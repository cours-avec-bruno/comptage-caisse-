/**
 * Agents : qui se connecte, et avec quel mot de passe.
 *
 * Contrairement aux comptages, les agents se modifient — ce n'est pas de
 * l'historique, et aucun trigger ne les protège.
 *
 * Le mot de passe n'est jamais stocké en clair. On le passe par scrypt, la
 * fonction de dérivation intégrée à Node : aucune dépendance à ajouter, et
 * elle est volontairement lente, ce qui est exactement ce qu'on veut ici.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { ErreurValidation } from './calculs.js';
import { horodatage } from './dates.js';

const LONGUEUR_HASH = 64;

/**
 * Mot de passe par défaut d'un agent : son prénom en majuscules, sans accent.
 *
 * Les accents sont retirés parce qu'il faut pouvoir le taper vite au clavier
 * de l'accueil — « HELENE » plutôt que « HÉLÈNE ».
 *
 * @param {string} prenom
 * @returns {string}
 */
export function motDePasseParDefaut(prenom) {
  return prenom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * @param {string} motDePasse
 * @param {string} [sel]
 * @returns {{hash: string, sel: string}}
 */
export function hacher(motDePasse, sel = randomBytes(16).toString('hex')) {
  const hash = scryptSync(motDePasse, sel, LONGUEUR_HASH).toString('hex');
  return { hash, sel };
}

/**
 * Comparaison à temps constant : comparer deux chaînes avec `===` laisse
 * fuiter, par la durée, le nombre de caractères devinés.
 *
 * @param {string} motDePasse
 * @param {string} hash
 * @param {string} sel
 * @returns {boolean}
 */
export function verifier(motDePasse, hash, sel) {
  const candidat = scryptSync(motDePasse, sel, LONGUEUR_HASH);
  const attendu = Buffer.from(hash, 'hex');
  if (candidat.length !== attendu.length) return false;
  return timingSafeEqual(candidat, attendu);
}

/**
 * Initiales déduites du prénom et du nom : « Bruno Ricci » -> « BR ».
 * @param {string} prenom
 * @param {string} nom
 * @returns {string}
 */
export function initialesDe(prenom, nom) {
  const lettre = (mot) =>
    (mot ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .charAt(0)
      .toUpperCase();
  return `${lettre(prenom)}${lettre(nom)}`;
}

const nettoyer = (valeur) => String(valeur ?? '').trim();

/**
 * @param {string} prenom
 * @param {string} nom
 */
function validerIdentite(prenom, nom) {
  if (!prenom) throw new ErreurValidation('Le prénom est obligatoire.');
  if (!nom) throw new ErreurValidation('Le nom est obligatoire.');
  if (prenom.length > 40 || nom.length > 40) {
    throw new ErreurValidation('Prénom et nom font 40 caractères au maximum.');
  }
}

/**
 * Sans le hash ni le sel : ces deux colonnes ne sortent jamais de la base.
 * @param {object} ligne
 */
const publier = (ligne) => ({
  id: ligne.id,
  prenom: ligne.prenom,
  nom: ligne.nom,
  initiales: ligne.initiales,
  actif: Boolean(ligne.actif),
  cree_le: ligne.cree_le,
});

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{inclureInactifs?: boolean}} [options]
 */
export function listerAgents(db, options = {}) {
  const requete = options.inclureInactifs
    ? 'SELECT * FROM agents ORDER BY actif DESC, prenom, nom'
    : 'SELECT * FROM agents WHERE actif = 1 ORDER BY prenom, nom';
  return db.prepare(requete).all().map(publier);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function agentParId(db, id) {
  const ligne = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  return ligne ? publier(ligne) : null;
}

/**
 * Choisit des initiales libres : « BR », puis « BR2 », « BR3 »…
 * @param {import('better-sqlite3').Database} db
 * @param {string} base
 */
function initialesLibres(db, base) {
  const existe = db.prepare('SELECT 1 FROM agents WHERE initiales = ?');
  if (!existe.get(base)) return base;
  for (let suffixe = 2; suffixe < 100; suffixe += 1) {
    const candidat = `${base}${suffixe}`;
    if (!existe.get(candidat)) return candidat;
  }
  throw new ErreurValidation(`Impossible de trouver des initiales libres pour ${base}.`);
}

/**
 * Crée un agent. Son mot de passe initial est son prénom en majuscules.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{prenom: string, nom: string, motDePasse?: string}} params
 */
export function creerAgent(db, params) {
  const prenom = nettoyer(params.prenom);
  const nom = nettoyer(params.nom);
  validerIdentite(prenom, nom);

  const motDePasse = nettoyer(params.motDePasse) || motDePasseParDefaut(prenom);
  const { hash, sel } = hacher(motDePasse);
  const initiales = initialesLibres(db, initialesDe(prenom, nom));

  const resultat = db
    .prepare(
      `INSERT INTO agents (prenom, nom, initiales, mdp_hash, mdp_sel, actif, cree_le)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(prenom, nom, initiales, hash, sel, horodatage());

  return agentParId(db, Number(resultat.lastInsertRowid));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {{prenom?: string, nom?: string, actif?: boolean}} modifications
 */
export function modifierAgent(db, id, modifications) {
  const existant = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  if (!existant) throw new ErreurValidation('Agent introuvable.');

  const prenom = modifications.prenom !== undefined ? nettoyer(modifications.prenom) : existant.prenom;
  const nom = modifications.nom !== undefined ? nettoyer(modifications.nom) : existant.nom;
  validerIdentite(prenom, nom);

  const actif = modifications.actif !== undefined ? (modifications.actif ? 1 : 0) : existant.actif;

  // Désactiver le dernier agent actif fermerait l'application à tout le monde.
  if (!actif && existant.actif) {
    const restants = db
      .prepare('SELECT COUNT(*) AS n FROM agents WHERE actif = 1 AND id <> ?')
      .get(id).n;
    if (restants === 0) {
      throw new ErreurValidation(
        'Impossible de désactiver le dernier agent : plus personne ne pourrait se connecter.',
      );
    }
  }

  db.prepare('UPDATE agents SET prenom = ?, nom = ?, actif = ? WHERE id = ?')
    .run(prenom, nom, actif, id);

  // Un agent désactivé ne doit pas rester connecté sur un poste ouvert.
  if (!actif) db.prepare('DELETE FROM sessions WHERE agent_id = ?').run(id);

  return agentParId(db, id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {string} motDePasse
 */
export function changerMotDePasse(db, id, motDePasse) {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  if (!agent) throw new ErreurValidation('Agent introuvable.');

  const nouveau = nettoyer(motDePasse);
  if (nouveau.length < 3) {
    throw new ErreurValidation('Le mot de passe fait au moins 3 caractères.');
  }
  if (nouveau.length > 100) {
    throw new ErreurValidation('Le mot de passe fait 100 caractères au maximum.');
  }

  const { hash, sel } = hacher(nouveau);
  db.prepare('UPDATE agents SET mdp_hash = ?, mdp_sel = ? WHERE id = ?').run(hash, sel, id);
  return agentParId(db, id);
}

/**
 * Vérifie le mot de passe d'un agent donné, pour confirmer l'ancien avant
 * d'en changer.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {string} motDePasse
 * @returns {boolean}
 */
export function motDePasseCorrect(db, id, motDePasse) {
  const ligne = db.prepare('SELECT mdp_hash, mdp_sel FROM agents WHERE id = ?').get(id);
  if (!ligne) return false;
  return verifier(String(motDePasse ?? '').trim(), ligne.mdp_hash, ligne.mdp_sel);
}

/**
 * Change son propre mot de passe, et uniquement le sien.
 *
 * Trois conditions, chacune pour une raison distincte :
 *
 *  - l'ancien est exigé, sinon un poste laissé ouvert une minute suffirait à
 *    verrouiller quelqu'un hors de son compte ou à s'y installer ;
 *  - le nouveau ne peut pas être l'ancien, sinon le geste ne change rien ;
 *  - le nouveau est saisi deux fois, parce qu'on ne relit pas un mot de passe
 *    masqué et qu'une faute de frappe enfermerait dehors.
 *
 * La double saisie est vérifiée ici, et pas seulement à l'écran : c'est la
 * règle, pas une commodité d'interface.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {string} ancien
 * @param {string} nouveau
 * @param {string} confirmation
 */
export function changerSonMotDePasse(db, id, ancien, nouveau, confirmation) {
  if (!motDePasseCorrect(db, id, ancien)) {
    throw new ErreurValidation('Ancien mot de passe incorrect.');
  }
  if (String(nouveau ?? '').trim() !== String(confirmation ?? '').trim()) {
    throw new ErreurValidation(
      'Les deux nouveaux mots de passe ne sont pas identiques. Retapez-les.',
    );
  }
  if (String(nouveau ?? '').trim() === String(ancien ?? '').trim()) {
    throw new ErreurValidation('Le nouveau mot de passe est identique à l’ancien.');
  }
  return changerMotDePasse(db, id, nouveau);
}

/**
 * Vérifie un couple initiales / mot de passe.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} initiales
 * @param {string} motDePasse
 * @returns {object|null} l'agent, ou null si le couple ne correspond pas
 */
export function authentifier(db, initiales, motDePasse) {
  const ligne = db
    .prepare('SELECT * FROM agents WHERE initiales = ? AND actif = 1')
    .get(nettoyer(initiales).toUpperCase());

  // Même en l'absence d'agent, on paie le coût d'un hachage : sinon la
  // rapidité de la réponse dirait quelles initiales existent.
  if (!ligne) {
    hacher(nettoyer(motDePasse) || 'x');
    return null;
  }

  return verifier(nettoyer(motDePasse), ligne.mdp_hash, ligne.mdp_sel)
    ? publier(ligne)
    : null;
}

/**
 * Crée les deux agents de départ si la table est vide.
 * @param {import('better-sqlite3').Database} db
 */
export function amorcerAgents(db) {
  const nombre = db.prepare('SELECT COUNT(*) AS n FROM agents').get().n;
  if (nombre > 0) return [];

  return [
    creerAgent(db, { prenom: 'Bruno', nom: 'Ricci' }),
    creerAgent(db, { prenom: 'Marie', nom: 'Lefevre' }),
  ];
}

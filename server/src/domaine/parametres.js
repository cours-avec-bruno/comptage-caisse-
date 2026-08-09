/**
 * Paramètres de l'application. Contrairement à l'historique, ils sont
 * modifiables : ce ne sont pas des lignes de caisse.
 */

import {
  ErreurValidation,
  normaliserQuantites,
  totalCentimes,
} from './calculs.js';

const CLES_AUTORISEES = new Set(['fond_composition']);

/**
 * @param {import('better-sqlite3').Database} db
 */
export function lireParametres(db) {
  const lignes = db.prepare('SELECT cle, valeur FROM parametres').all();
  const brut = Object.fromEntries(lignes.map((l) => [l.cle, l.valeur]));

  const composition = lireComposition(brut.fond_composition);

  return {
    fond_composition: Object.fromEntries(composition),
    // Dérivé, jamais stocké : un montant mis de côté finirait par diverger de
    // la composition, et c'est la composition qu'on retrouve dans le tiroir.
    fond_defaut_centimes: totalCentimes(composition),
  };
}

/**
 * @param {string|undefined} json
 * @returns {Map<number, number>}
 */
function lireComposition(json) {
  if (!json) return new Map();
  try {
    return normaliserQuantites(JSON.parse(json));
  } catch {
    // Une composition illisible ne doit pas empêcher d'ouvrir l'application :
    // on repart d'un fond vide, que les paramètres permettent de refaire.
    return new Map();
  }
}

/**
 * Composition du fond de caisse, sous la forme attendue par les calculs.
 * @param {import('better-sqlite3').Database} db
 * @returns {Map<number, number>}
 */
export function fondDeCaisse(db) {
  const ligne = db
    .prepare("SELECT valeur FROM parametres WHERE cle = 'fond_composition'")
    .get();
  return lireComposition(ligne?.valeur);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Record<string, unknown>} modifications
 */
export function ecrireParametres(db, modifications) {
  const inconnues = Object.keys(modifications).filter(
    (cle) => !CLES_AUTORISEES.has(cle),
  );
  if (inconnues.length > 0) {
    throw new ErreurValidation(`Paramètre inconnu : ${inconnues.join(', ')}.`);
  }

  /** @type {[string, string][]} */
  const aEcrire = [];

  if ('fond_composition' in modifications) {
    const composition = normaliserQuantites(modifications.fond_composition ?? {});
    aEcrire.push([
      'fond_composition',
      JSON.stringify(Object.fromEntries(composition)),
    ]);
  }


  const requete = db.prepare(
    `INSERT INTO parametres (cle, valeur) VALUES (?, ?)
     ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur`,
  );
  const transaction = db.transaction(() => {
    for (const [cle, valeur] of aEcrire) requete.run(cle, valeur);
  });
  transaction();

  return lireParametres(db);
}


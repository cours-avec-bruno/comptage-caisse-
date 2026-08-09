/**
 * Sessions de connexion.
 *
 * Le jeton vit en base et non en mémoire : redémarrer l'application ne doit
 * pas déconnecter un agent en plein comptage.
 */

import { randomBytes } from 'node:crypto';

import { horodatage } from './dates.js';

/** Une session dure une journée de travail large. */
export const DUREE_HEURES = 14;

export const NOM_COOKIE = 'caisse_session';

/**
 * @param {Date} instant
 * @param {number} heures
 */
function dans(instant, heures) {
  return new Date(instant.getTime() + heures * 3600 * 1000);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} agentId
 * @param {Date} [instant]
 * @returns {{jeton: string, expire_le: string}}
 */
export function ouvrirSession(db, agentId, instant = new Date()) {
  // 32 octets d'aléa cryptographique : un jeton se devine encore moins bien
  // qu'un mot de passe.
  const jeton = randomBytes(32).toString('hex');
  const expireLe = horodatage(dans(instant, DUREE_HEURES));

  db.prepare(
    'INSERT INTO sessions (jeton, agent_id, cree_le, expire_le) VALUES (?, ?, ?, ?)',
  ).run(jeton, agentId, horodatage(instant), expireLe);

  purgerSessions(db, instant);
  return { jeton, expire_le: expireLe };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} jeton
 * @param {Date} [instant]
 * @returns {object|null} l'agent de la session, ou null
 */
export function agentDeSession(db, jeton, instant = new Date()) {
  if (!jeton) return null;

  const ligne = db
    .prepare(
      `SELECT s.expire_le, a.id, a.prenom, a.nom, a.initiales, a.actif, a.cree_le
         FROM sessions s
         JOIN agents a ON a.id = s.agent_id
        WHERE s.jeton = ?`,
    )
    .get(jeton);

  if (!ligne) return null;
  if (!ligne.actif) return null;
  if (ligne.expire_le <= horodatage(instant)) {
    fermerSession(db, jeton);
    return null;
  }

  return {
    id: ligne.id,
    prenom: ligne.prenom,
    nom: ligne.nom,
    initiales: ligne.initiales,
    actif: Boolean(ligne.actif),
    cree_le: ligne.cree_le,
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} jeton
 */
export function fermerSession(db, jeton) {
  db.prepare('DELETE FROM sessions WHERE jeton = ?').run(jeton);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Date} [instant]
 */
export function purgerSessions(db, instant = new Date()) {
  db.prepare('DELETE FROM sessions WHERE expire_le <= ?').run(horodatage(instant));
}

/**
 * Lit un cookie dans l'en-tête brut. Un analyseur dédié serait une dépendance
 * de plus pour trois lignes.
 *
 * @param {string|undefined} entete
 * @param {string} nom
 * @returns {string}
 */
export function lireCookie(entete, nom) {
  if (!entete) return '';
  for (const morceau of entete.split(';')) {
    const separateur = morceau.indexOf('=');
    if (separateur === -1) continue;
    if (morceau.slice(0, separateur).trim() === nom) {
      return decodeURIComponent(morceau.slice(separateur + 1).trim());
    }
  }
  return '';
}

/**
 * @param {string} jeton
 * @param {{secure?: boolean, maxAgeSecondes?: number}} [options]
 * @returns {string} valeur de l'en-tête Set-Cookie
 */
export function cookieDeSession(jeton, options = {}) {
  const { secure = false, maxAgeSecondes = DUREE_HEURES * 3600 } = options;
  const morceaux = [
    `${NOM_COOKIE}=${encodeURIComponent(jeton)}`,
    'Path=/',
    // httpOnly : le jeton reste hors de portée de tout script de la page.
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSecondes}`,
  ];
  if (secure) morceaux.push('Secure');
  return morceaux.join('; ');
}

/** Cookie qui efface le précédent. */
export function cookieEfface() {
  return `${NOM_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

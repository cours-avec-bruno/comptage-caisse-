/**
 * Paramètres de l'application. Contrairement à l'historique, ils sont
 * modifiables : ce ne sont pas des lignes de caisse.
 */

import { ErreurValidation, montantCentimes } from './calculs.js';

const CLES_AUTORISEES = new Set(['fond_defaut_centimes']);

/**
 * @param {import('better-sqlite3').Database} db
 */
export function lireParametres(db) {
  const lignes = db.prepare('SELECT cle, valeur FROM parametres').all();
  const brut = Object.fromEntries(lignes.map((l) => [l.cle, l.valeur]));

  return { fond_defaut_centimes: Number(brut.fond_defaut_centimes ?? 0) };
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

  if ('fond_defaut_centimes' in modifications) {
    const fond = montantCentimes(
      modifications.fond_defaut_centimes,
      'Le fond de caisse par défaut',
    );
    aEcrire.push(['fond_defaut_centimes', String(fond)]);
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


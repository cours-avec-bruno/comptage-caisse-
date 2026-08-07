/**
 * Comptage de la journée : la saisie du soir, puis le versement au coffre.
 */

import {
  ErreurValidation,
  recetteEspeces,
  recetteJour,
  totalCentimes,
} from './calculs.js';
import { horodatage } from './dates.js';
import { insererMouvement } from './coffre.js';

/**
 * Valide une journée : crée le comptage, son détail, et le versement au
 * coffre portant exactement le même détail.
 *
 * Règle v1 : la totalité du comptage monte au coffre, fond de caisse compris.
 * (Si le fond finit par rester physiquement dans la caisse le soir, c'est ici
 * qu'il faudra soustraire les coupures laissées avant de créer le versement.)
 *
 * La CB n'entre jamais au coffre : elle ne figure dans aucun mouvement.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {string} params.date
 * @param {string} params.agent
 * @param {Map<number, number>} params.quantites
 * @param {number} params.cbCentimes
 * @param {number} params.fondCentimes
 */
export function validerJournee(db, params) {
  const { date, agent, quantites, cbCentimes, fondCentimes } = params;

  if (quantites.size === 0 && cbCentimes === 0) {
    throw new ErreurValidation(
      'Rien à valider : ni espèces comptées, ni recette CB.',
    );
  }

  const especesCentimes = totalCentimes(quantites);

  const transaction = db.transaction(() => {
    const resultat = db
      .prepare(
        `INSERT INTO comptages
           (date, agent, especes_centimes, cb_centimes, fond_centimes, cree_le)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(date, agent, especesCentimes, cbCentimes, fondCentimes, horodatage());

    const comptageId = Number(resultat.lastInsertRowid);
    const insererLigne = db.prepare(
      `INSERT INTO comptage_detail (comptage_id, coupure_centimes, quantite)
       VALUES (?, ?, ?)`,
    );

    for (const [coupure, quantite] of [...quantites].sort((a, b) => a[0] - b[0])) {
      insererLigne.run(comptageId, coupure, quantite);
    }

    let mouvementId = null;
    if (quantites.size > 0) {
      mouvementId = insererMouvement(db, {
        date,
        agent,
        type: 'versement',
        motif: `Versement du comptage du ${date}`,
        quantites,
        comptageId,
      });
    }

    return {
      id: comptageId,
      mouvement_id: mouvementId,
      date,
      agent,
      especes_centimes: especesCentimes,
      cb_centimes: cbCentimes,
      fond_centimes: fondCentimes,
      recette_especes_centimes: recetteEspeces(especesCentimes, fondCentimes),
      recette_centimes: recetteJour(especesCentimes, fondCentimes, cbCentimes),
    };
  });

  return transaction();
}

/**
 * Journal : une ligne par journée validée, de la plus récente à la plus
 * ancienne, avec le cumul en pied de tableau.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function journal(db) {
  const lignes = db
    .prepare(
      `SELECT id, date, agent, especes_centimes, cb_centimes, fond_centimes, cree_le
         FROM comptages
        ORDER BY date DESC, id DESC`,
    )
    .all()
    .map((ligne) => ({
      ...ligne,
      recette_especes_centimes: recetteEspeces(
        ligne.especes_centimes,
        ligne.fond_centimes,
      ),
      recette_centimes: recetteJour(
        ligne.especes_centimes,
        ligne.fond_centimes,
        ligne.cb_centimes,
      ),
    }));

  const cumul = lignes.reduce(
    (somme, ligne) => ({
      especes_centimes: somme.especes_centimes + ligne.especes_centimes,
      cb_centimes: somme.cb_centimes + ligne.cb_centimes,
      recette_especes_centimes:
        somme.recette_especes_centimes + ligne.recette_especes_centimes,
      recette_centimes: somme.recette_centimes + ligne.recette_centimes,
    }),
    {
      especes_centimes: 0,
      cb_centimes: 0,
      recette_especes_centimes: 0,
      recette_centimes: 0,
    },
  );

  return { lignes, cumul };
}

/**
 * Détail par coupure d'un comptage.
 * @param {import('better-sqlite3').Database} db
 * @param {number} comptageId
 */
export function detailComptage(db, comptageId) {
  return db
    .prepare(
      `SELECT coupure_centimes, quantite
         FROM comptage_detail
        WHERE comptage_id = ?
        ORDER BY coupure_centimes`,
    )
    .all(comptageId);
}

/**
 * Comptages déjà enregistrés pour une date. Sert à prévenir l'agent qu'une
 * journée a déjà été validée — sans la bloquer : une correction se fait par
 * un nouvel enregistrement, jamais par modification.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} date
 */
export function comptagesDuJour(db, date) {
  return db
    .prepare(
      `SELECT id, agent, especes_centimes, cb_centimes, cree_le
         FROM comptages
        WHERE date = ?
        ORDER BY id`,
    )
    .all(date);
}

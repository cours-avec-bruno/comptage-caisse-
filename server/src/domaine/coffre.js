/**
 * Accès au coffre. Le solde n'est jamais lu depuis une colonne : il est
 * reconstruit à chaque appel depuis `mouvement_detail`.
 */

import {
  construireInventaire,
  coupuresInsuffisantes,
  soldeInventaire,
  totalCentimes,
  ErreurValidation,
  libelleCoupure,
} from './calculs.js';
import { horodatage } from './dates.js';

/** En v1 il n'y a qu'un coffre. La colonne existe pour la suite. */
export const CONTENANT_PAR_DEFAUT = 1;

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} [contenantId]
 * @returns {{coupure_centimes: number, quantite: number, valeur_centimes: number}[]}
 */
export function inventaire(db, contenantId = CONTENANT_PAR_DEFAUT) {
  const lignes = db
    .prepare(
      `SELECT d.coupure_centimes AS coupure_centimes,
              SUM(d.quantite)    AS quantite
         FROM mouvement_detail d
         JOIN mouvements_coffre m ON m.id = d.mouvement_id
        WHERE m.contenant_id = ?
        GROUP BY d.coupure_centimes`,
    )
    .all(contenantId);

  return construireInventaire(lignes);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} [contenantId]
 */
export function etatCoffre(db, contenantId = CONTENANT_PAR_DEFAUT) {
  const detail = inventaire(db, contenantId);
  const dernierVersement = db
    .prepare(
      `SELECT date, agent, cree_le
         FROM mouvements_coffre
        WHERE contenant_id = ? AND type = 'versement'
        ORDER BY id DESC
        LIMIT 1`,
    )
    .get(contenantId);

  return {
    solde_centimes: soldeInventaire(detail),
    dernier_versement: dernierVersement ?? null,
    inventaire: detail,
  };
}

/**
 * Enregistre un mouvement et son détail. À appeler dans une transaction.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} mouvement
 * @param {string} mouvement.date
 * @param {string} mouvement.agent
 * @param {'versement'|'sortie'} mouvement.type
 * @param {string} mouvement.motif
 * @param {Map<number, number>} mouvement.quantites signées
 * @param {number|null} [mouvement.comptageId]
 * @param {number} [mouvement.contenantId]
 * @returns {number} id du mouvement créé
 */
export function insererMouvement(db, mouvement) {
  const {
    date,
    agent,
    type,
    motif,
    quantites,
    comptageId = null,
    contenantId = CONTENANT_PAR_DEFAUT,
  } = mouvement;

  const resultat = db
    .prepare(
      `INSERT INTO mouvements_coffre
         (contenant_id, date, agent, type, motif, comptage_id, cree_le)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(contenantId, date, agent, type, motif, comptageId, horodatage());

  const mouvementId = Number(resultat.lastInsertRowid);
  const insererLigne = db.prepare(
    `INSERT INTO mouvement_detail (mouvement_id, coupure_centimes, quantite)
     VALUES (?, ?, ?)`,
  );

  for (const [coupure, quantite] of [...quantites].sort((a, b) => a[0] - b[0])) {
    insererLigne.run(mouvementId, coupure, quantite);
  }

  return mouvementId;
}

/**
 * Sortie du coffre : saisie par coupures, jamais par montant.
 * Refuse en bloc si une seule coupure dépasse le stock.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {string} params.date
 * @param {string} params.agent
 * @param {string} params.motif
 * @param {Map<number, number>} params.quantites quantités positives à retirer
 * @param {number} [params.contenantId]
 */
export function enregistrerSortie(db, params) {
  const {
    date,
    agent,
    motif,
    quantites,
    contenantId = CONTENANT_PAR_DEFAUT,
  } = params;

  if (quantites.size === 0) {
    throw new ErreurValidation('Une sortie doit porter sur au moins une coupure.');
  }

  const transaction = db.transaction(() => {
    const stock = inventaire(db, contenantId);
    const manquantes = coupuresInsuffisantes(stock, quantites);

    if (manquantes.length > 0) {
      const details = manquantes
        .map(
          (m) =>
            `${libelleCoupure(m.coupure_centimes)} (demandé ${m.demande}, disponible ${m.disponible})`,
        )
        .join(', ');
      throw new ErreurValidation(
        `Stock insuffisant au coffre : ${details}.`,
        { coupures: manquantes },
      );
    }

    const signees = new Map(
      [...quantites].map(([coupure, quantite]) => [coupure, -quantite]),
    );

    const id = insererMouvement(db, {
      date,
      agent,
      type: 'sortie',
      motif,
      quantites: signees,
      contenantId,
    });

    return { id, montant_centimes: totalCentimes(quantites) };
  });

  return transaction();
}

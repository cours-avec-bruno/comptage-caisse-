/**
 * Accès au coffre. Le solde n'est jamais lu depuis une colonne : il est
 * reconstruit à chaque appel depuis `mouvement_detail`.
 */

import { repartirCoffre } from 'caisse-partage';

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
 * Chèques présents au coffre. Comme le reste, jamais stocké : somme des
 * mouvements, positifs à l'entrée, négatifs à la sortie.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} [contenantId]
 * @returns {{nombre: number, centimes: number}}
 */
export function chequesAuCoffre(db, contenantId = CONTENANT_PAR_DEFAUT) {
  const ligne = db
    .prepare(
      `SELECT COALESCE(SUM(cheques_nombre), 0)   AS nombre,
              COALESCE(SUM(cheques_centimes), 0) AS centimes
         FROM mouvements_coffre
        WHERE contenant_id = ?`,
    )
    .get(contenantId);

  return { nombre: ligne.nombre, centimes: ligne.centimes };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} [contenantId]
 */
export function etatCoffre(db, contenantId = CONTENANT_PAR_DEFAUT) {
  const detail = inventaire(db, contenantId);
  const cheques = chequesAuCoffre(db, contenantId);
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
    // Les chèques sont physiquement dans le coffre : ils comptent dans le
    // solde, qui doit rester vérifiable en ouvrant la porte.
    solde_centimes: soldeInventaire(detail) + cheques.centimes,
    especes_centimes: soldeInventaire(detail),
    cheques,
    dernier_versement: dernierVersement ?? null,
    inventaire: detail,
    repartition: repartirCoffre(detail, cheques),
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
 * @param {{nombre: number, centimes: number}} [mouvement.cheques] signés
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
    cheques = { nombre: 0, centimes: 0 },
    comptageId = null,
    contenantId = CONTENANT_PAR_DEFAUT,
  } = mouvement;

  const resultat = db
    .prepare(
      `INSERT INTO mouvements_coffre
         (contenant_id, date, agent, type, motif, comptage_id, cree_le,
          cheques_nombre, cheques_centimes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      contenantId, date, agent, type, motif, comptageId, horodatage(),
      cheques.nombre, cheques.centimes,
    );

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
 * @param {{nombre: number, centimes: number}} [params.cheques] positifs à retirer
 * @param {number} [params.contenantId]
 */
export function enregistrerSortie(db, params) {
  const {
    date,
    agent,
    motif,
    quantites,
    cheques = { nombre: 0, centimes: 0 },
    contenantId = CONTENANT_PAR_DEFAUT,
  } = params;

  if (quantites.size === 0 && cheques.centimes === 0) {
    throw new ErreurValidation(
      'Une sortie doit porter sur au moins une coupure ou un chèque.',
    );
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

    const stockCheques = chequesAuCoffre(db, contenantId);
    if (cheques.centimes > stockCheques.centimes) {
      throw new ErreurValidation(
        `Pas autant de chèques au coffre : demandé ${cheques.centimes} centimes, disponible ${stockCheques.centimes} centimes.`,
        { cheques: { demande: cheques, disponible: stockCheques } },
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
      cheques: { nombre: -cheques.nombre, centimes: -cheques.centimes },
      contenantId,
    });

    return {
      id,
      montant_centimes: totalCentimes(quantites) + cheques.centimes,
      especes_centimes: totalCentimes(quantites),
      cheques_centimes: cheques.centimes,
    };
  });

  return transaction();
}

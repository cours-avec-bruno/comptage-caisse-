/**
 * Export CSV de tout l'historique.
 *
 * Contrainte du brief : le format doit rester lisible sans l'application.
 * D'où le séparateur `;`, la virgule décimale et le BOM UTF-8 — c'est ce
 * qu'attend un tableur français ouvert d'un double-clic. Chaque montant
 * apparaît aussi en centimes bruts, pour recalculer sans perte.
 */

import { COUPURES, formaterDecimal } from 'caisse-partage';

import { libelleCoupure, recetteEspeces, recetteJour } from './domaine/calculs.js';

const SEPARATEUR = ';';
const BOM = '﻿';

/**
 * @param {unknown} valeur
 * @returns {string}
 */
function echapper(valeur) {
  const texte = String(valeur ?? '');
  return /[";\n\r]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

/**
 * @param {string[]} entetes
 * @param {unknown[][]} lignes
 * @returns {string}
 */
export function versCsv(entetes, lignes) {
  const contenu = [entetes, ...lignes]
    .map((ligne) => ligne.map(echapper).join(SEPARATEUR))
    .join('\r\n');
  return `${BOM}${contenu}\r\n`;
}

/**
 * Journal des journées validées, une ligne par comptage, avec le détail
 * par coupure en colonnes.
 * @param {import('better-sqlite3').Database} db
 */
export function csvComptages(db) {
  const comptages = db
    .prepare(
      `SELECT id, date, agent, especes_centimes, cb_centimes, fond_centimes, cree_le
         FROM comptages
        ORDER BY date DESC, id DESC`,
    )
    .all();

  const details = db
    .prepare('SELECT comptage_id, coupure_centimes, quantite FROM comptage_detail')
    .all();

  /** @type {Map<number, Map<number, number>>} */
  const parComptage = new Map();
  for (const ligne of details) {
    if (!parComptage.has(ligne.comptage_id)) {
      parComptage.set(ligne.comptage_id, new Map());
    }
    parComptage.get(ligne.comptage_id).set(ligne.coupure_centimes, ligne.quantite);
  }

  const entetes = [
    'id',
    'date',
    'agent',
    'especes_eur',
    'cb_eur',
    'fond_eur',
    'recette_especes_eur',
    'recette_jour_eur',
    'especes_centimes',
    'cb_centimes',
    'fond_centimes',
    'recette_jour_centimes',
    'cree_le',
    ...COUPURES.map((c) => `qte_${c.libelle.replace(/\s/g, '_')}`),
  ];

  const lignes = comptages.map((c) => {
    const quantites = parComptage.get(c.id) ?? new Map();
    const recetteEsp = recetteEspeces(c.especes_centimes, c.fond_centimes);
    const recette = recetteJour(c.especes_centimes, c.fond_centimes, c.cb_centimes);

    return [
      c.id,
      c.date,
      c.agent,
      formaterDecimal(c.especes_centimes),
      formaterDecimal(c.cb_centimes),
      formaterDecimal(c.fond_centimes),
      formaterDecimal(recetteEsp),
      formaterDecimal(recette),
      c.especes_centimes,
      c.cb_centimes,
      c.fond_centimes,
      recette,
      c.cree_le,
      ...COUPURES.map((coupure) => quantites.get(coupure.valeur) ?? 0),
    ];
  });

  return versCsv(entetes, lignes);
}

/**
 * Mouvements de coffre, une ligne par coupure : c'est le format qui permet
 * de reconstruire l'inventaire à la main dans un tableur.
 * @param {import('better-sqlite3').Database} db
 */
export function csvMouvements(db) {
  const lignes = db
    .prepare(
      `SELECT m.id, m.date, m.agent, m.type, m.motif, m.comptage_id, m.cree_le,
              d.coupure_centimes, d.quantite
         FROM mouvements_coffre m
         JOIN mouvement_detail d ON d.mouvement_id = m.id
        ORDER BY m.date DESC, m.id DESC, d.coupure_centimes`,
    )
    .all();

  const entetes = [
    'mouvement_id',
    'date',
    'agent',
    'type',
    'motif',
    'comptage_id',
    'coupure',
    'coupure_centimes',
    'quantite',
    'valeur_eur',
    'valeur_centimes',
    'cree_le',
  ];

  return versCsv(
    entetes,
    lignes.map((l) => [
      l.id,
      l.date,
      l.agent,
      l.type,
      l.motif,
      l.comptage_id ?? '',
      libelleCoupure(l.coupure_centimes),
      l.coupure_centimes,
      l.quantite,
      formaterDecimal(l.coupure_centimes * l.quantite),
      l.coupure_centimes * l.quantite,
      l.cree_le,
    ]),
  );
}

/**
 * Inventaire courant du coffre.
 * @param {{coupure_centimes: number, quantite: number, valeur_centimes: number}[]} inventaire
 */
export function csvInventaire(inventaire) {
  return versCsv(
    ['coupure', 'coupure_centimes', 'quantite', 'valeur_eur', 'valeur_centimes'],
    inventaire.map((l) => [
      libelleCoupure(l.coupure_centimes),
      l.coupure_centimes,
      l.quantite,
      formaterDecimal(l.valeur_centimes),
      l.valeur_centimes,
    ]),
  );
}

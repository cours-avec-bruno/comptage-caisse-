/**
 * Couche de calcul. Aucune dépendance à la base : des entiers entrent,
 * des entiers sortent. C'est ici que l'arithmétique en centimes est testée.
 */

import { COUPURES, VALEURS_COUPURES, estCoupureValide } from 'caisse-partage';

export class ErreurValidation extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details) {
    super(message);
    this.name = 'ErreurValidation';
    this.details = details;
  }
}

/**
 * Normalise une saisie de quantités par coupure.
 *
 * Accepte un objet { "5000": 3, "200": 12 } ou un tableau
 * [{ coupure_centimes, quantite }]. Rejette tout ce qui n'est pas un entier :
 * un flottant qui passerait ici finirait en centimes fractionnaires en base.
 *
 * @param {Record<string, unknown> | {coupure_centimes: unknown, quantite: unknown}[]} saisie
 * @param {{autoriserNegatif?: boolean}} [options]
 * @returns {Map<number, number>} coupure -> quantité, quantités nulles écartées
 */
export function normaliserQuantites(saisie, options = {}) {
  const { autoriserNegatif = false } = options;
  /** @type {[unknown, unknown][]} */
  let entrees;

  if (Array.isArray(saisie)) {
    entrees = saisie.map((ligne) => [ligne?.coupure_centimes, ligne?.quantite]);
  } else if (saisie && typeof saisie === 'object') {
    entrees = Object.entries(saisie);
  } else {
    throw new ErreurValidation('Le détail par coupure est absent ou invalide.');
  }

  /** @type {Map<number, number>} */
  const quantites = new Map();

  for (const [coupureBrute, quantiteBrute] of entrees) {
    const coupure = Number(coupureBrute);
    if (!estCoupureValide(coupure)) {
      throw new ErreurValidation(
        `Coupure inconnue : ${String(coupureBrute)}. Coupures acceptées : ${VALEURS_COUPURES.join(', ')} centimes.`,
      );
    }

    const quantite = Number(quantiteBrute ?? 0);
    if (!Number.isInteger(quantite)) {
      throw new ErreurValidation(
        `Quantité non entière pour la coupure de ${coupure} centimes : ${String(quantiteBrute)}.`,
      );
    }
    if (!autoriserNegatif && quantite < 0) {
      throw new ErreurValidation(
        `Quantité négative pour la coupure de ${coupure} centimes.`,
      );
    }
    if (quantites.has(coupure)) {
      throw new ErreurValidation(
        `La coupure de ${coupure} centimes apparaît deux fois dans la saisie.`,
      );
    }

    if (quantite !== 0) {
      quantites.set(coupure, quantite);
    }
  }

  return quantites;
}

/**
 * Total en centimes d'un jeu de quantités. Somme d'entiers, rien d'autre.
 * @param {Map<number, number> | Record<string, number>} quantites
 * @returns {number}
 */
export function totalCentimes(quantites) {
  const entrees =
    quantites instanceof Map ? quantites.entries() : Object.entries(quantites);

  let total = 0;
  for (const [coupure, quantite] of entrees) {
    total += Number(coupure) * Number(quantite);
  }
  return total;
}

/**
 * Recette espèces = ce qui a été compté moins le fond de caisse.
 * Peut être négative : il manque de l'argent, et l'app doit le dire.
 * @param {number} especesCentimes
 * @param {number} fondCentimes
 * @returns {number}
 */
export function recetteEspeces(especesCentimes, fondCentimes) {
  return especesCentimes - fondCentimes;
}

/**
 * Recette du jour = recette espèces + CB + chèques.
 * @param {number} especesCentimes
 * @param {number} fondCentimes
 * @param {number} cbCentimes
 * @param {number} [chequesCentimes]
 * @returns {number}
 */
export function recetteJour(
  especesCentimes,
  fondCentimes,
  cbCentimes,
  chequesCentimes = 0,
) {
  return recetteEspeces(especesCentimes, fondCentimes) + cbCentimes + chequesCentimes;
}

/**
 * Construit l'inventaire complet du coffre à partir des lignes de mouvement.
 * Les 12 coupures sont toujours présentes, même à zéro : savoir qu'il n'y a
 * plus de pièces de 20 centimes est une information utile.
 *
 * @param {{coupure_centimes: number, quantite: number}[]} lignes
 * @returns {{coupure_centimes: number, quantite: number, valeur_centimes: number}[]}
 */
export function construireInventaire(lignes) {
  /** @type {Map<number, number>} */
  const cumul = new Map(VALEURS_COUPURES.map((valeur) => [valeur, 0]));

  for (const ligne of lignes) {
    const coupure = Number(ligne.coupure_centimes);
    if (!cumul.has(coupure)) {
      // Une coupure retirée du référentiel resterait visible dans l'historique.
      cumul.set(coupure, 0);
    }
    cumul.set(coupure, cumul.get(coupure) + Number(ligne.quantite));
  }

  return [...cumul.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([coupure_centimes, quantite]) => ({
      coupure_centimes,
      quantite,
      valeur_centimes: coupure_centimes * quantite,
    }));
}

/**
 * Solde du coffre. Jamais stocké : toujours recalculé depuis l'inventaire.
 * @param {{valeur_centimes: number}[]} inventaire
 * @returns {number}
 */
export function soldeInventaire(inventaire) {
  return inventaire.reduce((somme, ligne) => somme + ligne.valeur_centimes, 0);
}

/**
 * Vérifie qu'une sortie ne dépasse pas le stock, coupure par coupure.
 *
 * Le solde global ne suffit pas : on peut avoir 500 € au coffre et pas
 * une seule pièce de 20 centimes.
 *
 * @param {{coupure_centimes: number, quantite: number}[]} inventaire
 * @param {Map<number, number>} demande quantités positives à sortir
 * @returns {{coupure_centimes: number, demande: number, disponible: number}[]}
 *   liste vide si la sortie est possible
 */
export function coupuresInsuffisantes(inventaire, demande) {
  const stock = new Map(
    inventaire.map((ligne) => [ligne.coupure_centimes, ligne.quantite]),
  );

  /** @type {{coupure_centimes: number, demande: number, disponible: number}[]} */
  const manquantes = [];

  for (const [coupure, quantite] of demande) {
    const disponible = stock.get(coupure) ?? 0;
    if (quantite > disponible) {
      manquantes.push({
        coupure_centimes: coupure,
        demande: quantite,
        disponible,
      });
    }
  }

  return manquantes.sort((a, b) => a.coupure_centimes - b.coupure_centimes);
}

/**
 * Ce qui monte au coffre : le comptage moins le fond de caisse, coupure par
 * coupure.
 *
 * Le fond reste physiquement dans le tiroir pour rendre la monnaie le
 * lendemain. Retirer seulement son *montant* laissait monter ses pièces au
 * coffre : le solde était juste, l'inventaire faux.
 *
 * @param {Map<number, number>} comptees
 * @param {Map<number, number>} fond
 * @returns {{versement: Map<number, number>, manquantes: {coupure_centimes: number, fond: number, compte: number}[]}}
 */
export function versementApresFond(comptees, fond) {
  /** @type {Map<number, number>} */
  const versement = new Map();
  /** @type {{coupure_centimes: number, fond: number, compte: number}[]} */
  const manquantes = [];

  for (const [coupure, quantite] of comptees) {
    const reste = quantite - (fond.get(coupure) ?? 0);
    if (reste > 0) versement.set(coupure, reste);
  }

  // Une coupure du fond absente du comptage, ou en quantité insuffisante :
  // le fond ne peut pas être reconstitué ce soir.
  for (const [coupure, attendu] of fond) {
    const compte = comptees.get(coupure) ?? 0;
    if (compte < attendu) {
      manquantes.push({ coupure_centimes: coupure, fond: attendu, compte });
    }
  }

  manquantes.sort((a, b) => a.coupure_centimes - b.coupure_centimes);
  return { versement, manquantes };
}

/**
 * Libellé lisible d'une coupure, pour les messages d'erreur et les CSV.
 * @param {number} centimes
 * @returns {string}
 */
export function libelleCoupure(centimes) {
  return (
    COUPURES.find((c) => c.valeur === centimes)?.libelle ?? `${centimes} centimes`
  );
}

/**
 * Montant entier en centimes issu d'une entrée utilisateur (CB, fond de caisse).
 * @param {unknown} valeur
 * @param {string} nomChamp
 * @returns {number}
 */
export function montantCentimes(valeur, nomChamp) {
  const montant = Number(valeur ?? 0);
  if (!Number.isInteger(montant)) {
    throw new ErreurValidation(
      `${nomChamp} doit être un entier de centimes (reçu : ${String(valeur)}).`,
    );
  }
  if (montant < 0) {
    throw new ErreurValidation(`${nomChamp} ne peut pas être négatif.`);
  }
  return montant;
}

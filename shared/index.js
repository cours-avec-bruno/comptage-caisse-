/**
 * Domaine partagé entre l'API et le front.
 *
 * Règle absolue du projet : tous les montants sont des entiers en centimes.
 * Aucun flottant, nulle part. La conversion en euros n'existe qu'à l'affichage.
 */

// L'agrégation des recettes vit à part : elle ne parle pas de coupures.
export * from './statistiques.js';

/** Les 12 coupures acceptées, de la plus petite à la plus grande. */
export const COUPURES = [
  { valeur: 1, type: 'piece', libelle: '1 centime' },
  { valeur: 2, type: 'piece', libelle: '2 centimes' },
  { valeur: 5, type: 'piece', libelle: '5 centimes' },
  { valeur: 10, type: 'piece', libelle: '10 centimes' },
  { valeur: 20, type: 'piece', libelle: '20 centimes' },
  { valeur: 50, type: 'piece', libelle: '50 centimes' },
  { valeur: 100, type: 'piece', libelle: '1 euro' },
  { valeur: 200, type: 'piece', libelle: '2 euros' },
  { valeur: 500, type: 'billet', libelle: '5 euros' },
  { valeur: 1000, type: 'billet', libelle: '10 euros' },
  { valeur: 2000, type: 'billet', libelle: '20 euros' },
  { valeur: 5000, type: 'billet', libelle: '50 euros' },
];

/** Valeurs seules, ordre croissant. Sert aux vérifications d'appartenance. */
export const VALEURS_COUPURES = COUPURES.map((c) => c.valeur);

/** Billets d'abord (du plus gros au plus petit), puis les pièces : l'ordre de saisie. */
export const COUPURES_ORDRE_SAISIE = [
  ...COUPURES.filter((c) => c.type === 'billet').reverse(),
  ...COUPURES.filter((c) => c.type === 'piece').reverse(),
];

const formateurEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

/**
 * Seul endroit où des centimes deviennent des euros : l'affichage.
 * @param {number} centimes
 * @returns {string}
 */
export function formaterEuros(centimes) {
  return formateurEuros.format(centimes / 100);
}

/**
 * Variante sans symbole, pour les CSV lus dans un tableur français.
 * @param {number} centimes
 * @returns {string}
 */
export function formaterDecimal(centimes) {
  const signe = centimes < 0 ? '-' : '';
  const absolu = Math.abs(centimes);
  const unites = Math.trunc(absolu / 100);
  const reste = absolu % 100;
  return `${signe}${unites},${String(reste).padStart(2, '0')}`;
}

/**
 * @param {unknown} valeur
 * @returns {boolean}
 */
export function estCoupureValide(valeur) {
  return VALEURS_COUPURES.includes(/** @type {number} */ (valeur));
}

/* ------------------------------------------------------------------ *
 * Rangement du coffre : caisse grise et caisse rouge
 * ------------------------------------------------------------------ */

/** Nombre de billets d'une même valeur qui forment une liasse. */
export const SEUIL_LIASSE = 10;

/** Coupures qui vont en caisse rouge quel que soit leur nombre. */
export const COUPURES_TOUJOURS_ROUGE = [5000];

/**
 * Répartit le contenu du coffre entre les deux caisses.
 *
 * La règle de rangement de l'accueil :
 *  - par défaut tout va dans la caisse grise ;
 *  - dès qu'on a 10 billets d'une même valeur, on en fait une liasse qui part
 *    dans la caisse rouge — le reste de la pile demeure en grise ;
 *  - les billets de 50 € et les chèques vont en rouge quel que soit leur nombre ;
 *  - les pièces restent en grise.
 *
 * Cette répartition est **calculée**, jamais saisie ni stockée. C'est la même
 * raison que pour le solde : un rangement stocké finirait par diverger de
 * l'inventaire. Un versement ou une sortie réajuste donc le rangement tout
 * seul, et l'écran dit ce qui doit se trouver dans chaque caisse.
 *
 * @param {{coupure_centimes: number, quantite: number}[]} inventaire
 * @param {{nombre?: number, centimes?: number}} [cheques]
 */
export function repartirCoffre(inventaire, cheques = {}) {
  const chequesNombre = cheques.nombre ?? 0;
  const chequesCentimes = cheques.centimes ?? 0;

  /** @type {{coupure_centimes: number, quantite: number, valeur_centimes: number}[]} */
  const grise = [];
  /** @type {{coupure_centimes: number, quantite: number, valeur_centimes: number, liasses: number}[]} */
  const rouge = [];

  for (const { coupure_centimes, quantite } of inventaire) {
    const coupure = COUPURES.find((c) => c.valeur === coupure_centimes);
    const estBillet = coupure?.type === 'billet';

    let enRouge = 0;
    let liasses = 0;

    if (quantite > 0 && estBillet) {
      if (COUPURES_TOUJOURS_ROUGE.includes(coupure_centimes)) {
        enRouge = quantite;
        liasses = Math.floor(quantite / SEUIL_LIASSE);
      } else {
        liasses = Math.floor(quantite / SEUIL_LIASSE);
        enRouge = liasses * SEUIL_LIASSE;
      }
    }

    const enGris = quantite - enRouge;

    rouge.push({
      coupure_centimes,
      quantite: enRouge,
      valeur_centimes: coupure_centimes * enRouge,
      liasses,
    });
    grise.push({
      coupure_centimes,
      quantite: enGris,
      valeur_centimes: coupure_centimes * enGris,
    });
  }

  const sommer = (lignes) =>
    lignes.reduce((somme, ligne) => somme + ligne.valeur_centimes, 0);

  const totalRougeEspeces = sommer(rouge);
  const totalGrise = sommer(grise);

  return {
    grise: { lignes: grise, total_centimes: totalGrise },
    rouge: {
      lignes: rouge,
      especes_centimes: totalRougeEspeces,
      cheques: { nombre: chequesNombre, centimes: chequesCentimes },
      total_centimes: totalRougeEspeces + chequesCentimes,
    },
    total_centimes: totalGrise + totalRougeEspeces + chequesCentimes,
  };
}

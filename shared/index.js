/**
 * Domaine partagé entre l'API et le front.
 *
 * Règle absolue du projet : tous les montants sont des entiers en centimes.
 * Aucun flottant, nulle part. La conversion en euros n'existe qu'à l'affichage.
 */

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

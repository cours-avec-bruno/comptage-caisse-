/**
 * Dates au format AAAA-MM-JJ, dans le fuseau du PC de l'accueil.
 * `toISOString()` est volontairement évité : il bascule en UTC et fait
 * changer de jour un comptage validé après 22 h en été.
 */

/**
 * @param {Date} [instant]
 * @returns {string} AAAA-MM-JJ
 */
export function dateDuJour(instant = new Date()) {
  const annee = instant.getFullYear();
  const mois = String(instant.getMonth() + 1).padStart(2, '0');
  const jour = String(instant.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

/**
 * Horodatage complet local, pour les colonnes `cree_le`.
 * @param {Date} [instant]
 * @returns {string} AAAA-MM-JJ HH:MM:SS
 */
export function horodatage(instant = new Date()) {
  const heures = String(instant.getHours()).padStart(2, '0');
  const minutes = String(instant.getMinutes()).padStart(2, '0');
  const secondes = String(instant.getSeconds()).padStart(2, '0');
  return `${dateDuJour(instant)} ${heures}:${minutes}:${secondes}`;
}

/**
 * Suffixe de nom de fichier de sauvegarde : 2026-08-07_18-42-11
 * @param {Date} [instant]
 * @returns {string}
 */
export function suffixeFichier(instant = new Date()) {
  return horodatage(instant).replace(' ', '_').replaceAll(':', '-');
}

/**
 * Vérifie qu'une date fournie par le client est bien au format attendu.
 * @param {unknown} valeur
 * @returns {boolean}
 */
export function estDateValide(valeur) {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return false;
  }
  const [annee, mois, jour] = valeur.split('-').map(Number);
  const date = new Date(annee, mois - 1, jour);
  return (
    date.getFullYear() === annee &&
    date.getMonth() === mois - 1 &&
    date.getDate() === jour
  );
}

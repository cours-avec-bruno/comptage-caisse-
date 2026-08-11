import { formaterEuros } from 'caisse-partage';

export { formaterEuros };

/**
 * Convertit une saisie en euros (« 100 », « 100,5 », « 1 250,75 ») en
 * centimes entiers, sans jamais passer par un flottant : on découpe la
 * chaîne, on complète les décimales et on assemble deux entiers.
 *
 * Renvoie null si la saisie n'est pas exploitable.
 */
export function centimesDepuisEuros(saisie: string): number | null {
  const nettoye = saisie
    .replace(/[\s  €]/g, '')
    .replace('.', ',')
    .trim();

  if (nettoye === '') return 0;
  if (!/^\d*(,\d{0,2})?$/.test(nettoye)) return null;

  const [entier = '', decimales = ''] = nettoye.split(',');
  const unites = entier === '' ? 0 : Number.parseInt(entier, 10);
  const centimes = Number.parseInt(decimales.padEnd(2, '0') || '0', 10);

  return unites * 100 + centimes;
}

/** Centimes vers une saisie éditable : 12345 -> « 123,45 ». */
export function eurosDepuisCentimes(centimes: number): string {
  const unites = Math.trunc(Math.abs(centimes) / 100);
  const reste = Math.abs(centimes) % 100;
  return `${centimes < 0 ? '-' : ''}${unites},${String(reste).padStart(2, '0')}`;
}

/** Quantité saisie -> entier. Toute saisie vide ou invalide vaut zéro. */
export function quantiteDepuisSaisie(saisie: string): number {
  if (saisie.trim() === '') return 0;
  if (!/^\d+$/.test(saisie.trim())) return 0;
  return Number.parseInt(saisie.trim(), 10);
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** « 2026-08-07 » -> « vendredi 7 août 2026 ». */
export function dateLongue(iso: string): string {
  const [annee, mois, jour] = iso.split('-').map(Number);
  if (!annee || !mois || !jour) return iso;
  const date = new Date(annee, mois - 1, jour);
  return `${JOURS[date.getDay()]} ${jour} ${MOIS[mois - 1]} ${annee}`;
}

/** « 2026-08-07 » -> « 07/08/2026 ». */
export function dateCourte(iso: string): string {
  const [annee, mois, jour] = iso.split('-');
  if (!annee || !mois || !jour) return iso;
  return `${jour}/${mois}/${annee}`;
}

/** « 2026-08-07 » -> « 07/08 ». Pour les places étroites, l'année allant de soi. */
export function dateBreve(iso: string): string {
  const [annee, mois, jour] = iso.split('-');
  if (!annee || !mois || !jour) return iso;
  return `${jour}/${mois}`;
}

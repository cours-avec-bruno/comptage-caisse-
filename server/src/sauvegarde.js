/**
 * Sauvegarde du fichier `.db`.
 *
 * L'app tourne sur un seul PC, avec une base dans un fichier : c'est le point
 * faible de l'architecture et il concerne de l'argent. Une copie horodatée est
 * donc faite à chaque validation de journée, avec rotation.
 *
 * On passe par `db.backup()` (API de sauvegarde en ligne de SQLite) et non par
 * une copie de fichier : en mode WAL, copier le `.db` seul donne une base
 * amputée des dernières écritures.
 */

import fs from 'node:fs';
import path from 'node:path';

import { suffixeFichier } from './domaine/dates.js';

const PREFIXE = 'caisse_';
const EXTENSION = '.db';

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} options
 * @param {string} options.dossier
 * @param {number} [options.maxFichiers] nombre de copies conservées
 * @param {Date} [options.instant]
 * @returns {Promise<{fichier: string, supprimes: string[]}>}
 */
export async function sauvegarder(db, options) {
  const { dossier, maxFichiers = 30, instant = new Date() } = options;

  fs.mkdirSync(dossier, { recursive: true });

  const fichier = cheminLibre(dossier, suffixeFichier(instant));

  await db.backup(fichier);

  return { fichier, supprimes: appliquerRotation(dossier, maxFichiers) };
}

/**
 * L'horodatage est à la seconde : deux journées validées coup sur coup
 * tomberaient sur le même nom, et la seconde copie écraserait la première.
 * On suffixe alors -2, -3… plutôt que de perdre une sauvegarde.
 *
 * @param {string} dossier
 * @param {string} horodatage
 * @returns {string}
 */
function cheminLibre(dossier, horodatage) {
  const candidat = path.join(dossier, `${PREFIXE}${horodatage}${EXTENSION}`);
  if (!fs.existsSync(candidat)) return candidat;

  for (let suffixe = 2; suffixe < 100; suffixe += 1) {
    const autre = path.join(dossier, `${PREFIXE}${horodatage}-${suffixe}${EXTENSION}`);
    if (!fs.existsSync(autre)) return autre;
  }

  throw new Error(`Impossible de nommer une sauvegarde dans ${dossier}.`);
}

/**
 * Ne garde que les `maxFichiers` sauvegardes les plus récentes.
 * @param {string} dossier
 * @param {number} maxFichiers
 * @returns {string[]} fichiers supprimés
 */
export function appliquerRotation(dossier, maxFichiers) {
  if (maxFichiers <= 0) return [];

  const fichiers = fs
    .readdirSync(dossier)
    .filter((nom) => nom.startsWith(PREFIXE) && nom.endsWith(EXTENSION))
    // Le nom porte l'horodatage : le tri alphabétique est le tri chronologique.
    .sort();

  const aSupprimer = fichiers.slice(0, Math.max(0, fichiers.length - maxFichiers));
  for (const nom of aSupprimer) {
    fs.rmSync(path.join(dossier, nom), { force: true });
  }

  return aSupprimer;
}

/**
 * Liste des sauvegardes présentes, de la plus récente à la plus ancienne.
 * @param {string} dossier
 */
export function listerSauvegardes(dossier) {
  if (!fs.existsSync(dossier)) return [];

  return fs
    .readdirSync(dossier)
    .filter((nom) => nom.startsWith(PREFIXE) && nom.endsWith(EXTENSION))
    .sort()
    .reverse()
    .map((nom) => {
      const infos = fs.statSync(path.join(dossier, nom));
      return { fichier: nom, taille_octets: infos.size, modifie_le: infos.mtime };
    });
}

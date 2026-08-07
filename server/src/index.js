/**
 * Point d'entrée : ouvre la base, applique les migrations, sert l'API et
 * le front buildé sur un seul port.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { creerApp } from './app.js';
import { ouvrirBase } from './db/index.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');

const PORT = Number(process.env.PORT ?? 4173);
const CHEMIN_BASE =
  process.env.CAISSE_DB ?? path.join(RACINE, 'donnees', 'caisse.db');
const DOSSIER_SAUVEGARDES =
  process.env.CAISSE_SAUVEGARDES ?? path.join(RACINE, 'sauvegardes');
const MAX_SAUVEGARDES = Number(process.env.CAISSE_MAX_SAUVEGARDES ?? 30);
const DOSSIER_STATIQUE = path.join(RACINE, 'client', 'dist');

const db = ouvrirBase(CHEMIN_BASE);

const app = creerApp({
  db,
  dossierSauvegardes: DOSSIER_SAUVEGARDES,
  maxSauvegardes: MAX_SAUVEGARDES,
  dossierStatique: DOSSIER_STATIQUE,
});

const serveur = app.listen(PORT, () => {
  console.log('');
  console.log('  Caisse piscine');
  console.log(`  Ouvrir : http://localhost:${PORT}`);
  console.log(`  Base   : ${CHEMIN_BASE}`);
  console.log(`  Copies : ${DOSSIER_SAUVEGARDES} (${MAX_SAUVEGARDES} conservées)`);
  console.log('');
  console.log('  Laisser cette fenêtre ouverte. Fermer = arrêter l’application.');
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    serveur.close(() => {
      db.close();
      process.exit(0);
    });
  });
}

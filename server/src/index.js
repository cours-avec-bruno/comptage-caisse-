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

/*
 * On n'écoute que la machine elle-même.
 *
 * Écouter sur toutes les interfaces, c'est offrir la caisse à qui se branche
 * sur le réseau de la piscine : la page de connexion protège du visiteur qui
 * passe derrière le comptoir, pas de quelqu'un qui a le temps devant un
 * portable. L'accès depuis un autre poste n'est pas au programme — le jour
 * où il le sera, ce sera une décision, pas un défaut.
 */
const HOTE = process.env.CAISSE_HOTE ?? '127.0.0.1';
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

const serveur = app.listen(PORT, HOTE, () => {
  console.log('');
  console.log('  Caisse piscine');
  console.log(`  Ouvrir : http://localhost:${PORT}`);
  console.log(`  Base   : ${CHEMIN_BASE}`);
  console.log(`  Copies : ${DOSSIER_SAUVEGARDES} (${MAX_SAUVEGARDES} conservées)`);
  console.log(`  Écoute : ${HOTE} — ce poste seulement`);
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

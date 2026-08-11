/**
 * Finalise le dossier `docs/` publié par GitHub Pages.
 *
 * Deux fichiers que Vite ne produit pas :
 *  - `.nojekyll`, sinon Pages passe la sortie dans Jekyll, qui ignore les
 *    dossiers commençant par un underscore ;
 *  - `404.html`, copie de `index.html`, pour qu'un rechargement sur une URL
 *    profonde retombe sur l'application au lieu d'un 404 de GitHub.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(RACINE, 'docs');

const index = path.join(DOCS, 'index.html');
if (!fs.existsSync(index)) {
  console.error(`Rien à finaliser : ${index} est absent.`);
  process.exit(1);
}

fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');
fs.copyFileSync(index, path.join(DOCS, '404.html'));

console.log('docs/ finalisé : .nojekyll et 404.html écrits.');

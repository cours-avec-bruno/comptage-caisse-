import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { migrer } from './migrations.js';

/**
 * Ouvre (ou crée) la base et applique les migrations.
 * @param {string} cheminFichier
 * @returns {import('better-sqlite3').Database}
 */
export function ouvrirBase(cheminFichier) {
  if (cheminFichier !== ':memory:') {
    fs.mkdirSync(path.dirname(cheminFichier), { recursive: true });
  }

  const db = new Database(cheminFichier);

  // WAL : la sauvegarde peut se faire pendant qu'on écrit.
  if (cheminFichier !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  // L'argent mérite un fsync à chaque commit.
  db.pragma('synchronous = FULL');

  migrer(db);

  return db;
}

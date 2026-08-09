import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { amorcerAgents } from '../domaine/agents.js';
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

  // `migrer` suspend le temps des migrations le contrôle des clés étrangères,
  // puis vérifie la base avant de le remettre.
  migrer(db);
  // Sans agent, personne ne peut se connecter : on en crée deux au premier
  // démarrage. Le mot de passe de chacun est son prénom en majuscules.
  amorcerAgents(db);

  return db;
}

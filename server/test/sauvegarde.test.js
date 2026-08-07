import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ouvrirBase } from '../src/db/index.js';
import { normaliserQuantites } from '../src/domaine/calculs.js';
import { validerJournee } from '../src/domaine/comptages.js';
import { csvComptages, csvInventaire, csvMouvements, versCsv } from '../src/export-csv.js';
import { inventaire } from '../src/domaine/coffre.js';
import { appliquerRotation, listerSauvegardes, sauvegarder } from '../src/sauvegarde.js';

/** @type {string} */
let bacASable;
/** @type {import('better-sqlite3').Database} */
let db;

beforeEach(() => {
  bacASable = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-test-'));
  db = ouvrirBase(path.join(bacASable, 'donnees', 'caisse.db'));
  validerJournee(db, {
    date: '2026-08-07',
    agent: 'BR',
    quantites: normaliserQuantites({ 5000: 2, 200: 15, 5: 40 }),
    cbCentimes: 22_350,
    fondCentimes: 10_000,
  });
});

afterEach(() => {
  db.close();
  fs.rmSync(bacASable, { recursive: true, force: true });
});

describe('sauvegarde de la base', () => {
  it('écrit une copie horodatée relisible', async () => {
    const dossier = path.join(bacASable, 'sauvegardes');
    const { fichier } = await sauvegarder(db, { dossier });

    assert.ok(fs.existsSync(fichier));
    assert.match(path.basename(fichier), /^caisse_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/);

    // La copie doit contenir les données, pas une base vide.
    const copie = ouvrirBase(fichier);
    assert.equal(copie.prepare('SELECT COUNT(*) n FROM comptages').get().n, 1);
    assert.equal(
      copie.prepare('SELECT especes_centimes FROM comptages').get().especes_centimes,
      10_000 + 3_000 + 200,
    );
    copie.close();
  });

  it('applique la rotation en gardant les plus récentes', async () => {
    const dossier = path.join(bacASable, 'sauvegardes');

    for (let minute = 0; minute < 5; minute += 1) {
      await sauvegarder(db, {
        dossier,
        maxFichiers: 3,
        instant: new Date(2026, 7, 7, 18, minute, 0),
      });
    }

    const restantes = listerSauvegardes(dossier).map((s) => s.fichier);
    assert.equal(restantes.length, 3);
    assert.deepEqual(restantes, [
      'caisse_2026-08-07_18-04-00.db',
      'caisse_2026-08-07_18-03-00.db',
      'caisse_2026-08-07_18-02-00.db',
    ]);
  });

  it('ne touche pas aux fichiers étrangers du dossier', () => {
    const dossier = path.join(bacASable, 'sauvegardes');
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(path.join(dossier, 'notes.txt'), 'à ne pas supprimer');
    fs.writeFileSync(path.join(dossier, 'caisse_2026-01-01_00-00-00.db'), '');

    appliquerRotation(dossier, 0);
    assert.ok(fs.existsSync(path.join(dossier, 'notes.txt')));
  });
});

describe('export CSV', () => {
  it('échappe les séparateurs et les guillemets', () => {
    const csv = versCsv(['a', 'b'], [['x;y', 'guillemet "ici"']]);
    assert.ok(csv.includes('"x;y"'));
    assert.ok(csv.includes('"guillemet ""ici"""'));
  });

  it('produit un CSV de comptages lisible dans un tableur français', () => {
    const csv = csvComptages(db);
    const [entete, premiere] = csv.split('\r\n');

    assert.ok(csv.startsWith('﻿'), 'un BOM UTF-8 est attendu pour Excel');
    assert.ok(entete.includes(';'));
    assert.ok(premiere.includes('2026-08-07'));
    assert.ok(premiere.includes('132,00'), 'les espèces en euros, virgule décimale');
    assert.ok(premiere.includes('13200'), 'et les centimes bruts, pour recalculer');
  });

  it('sort les mouvements de coffre ligne à ligne par coupure', () => {
    const csv = csvMouvements(db);
    assert.ok(csv.startsWith('﻿'), 'un BOM UTF-8 est attendu pour Excel');

    // `trim()` mange le BOM (JS le compte comme un blanc) : on le retire à part.
    const lignes = csv.slice(1).trim().split('\r\n');
    // Une ligne d'entête + une ligne par coupure versée.
    assert.equal(lignes.length, 4);
    assert.ok(lignes[0].startsWith('mouvement_id'));
    assert.ok(lignes.every((l, i) => i === 0 || l.includes('versement')));
  });

  it('sort l’inventaire complet, coupures absentes comprises', () => {
    const lignes = csvInventaire(inventaire(db)).trim().split('\r\n');
    assert.equal(lignes.length, 13); // entête + 12 coupures
  });
});

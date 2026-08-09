import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ouvrirBase } from '../src/db/index.js';
import { ErreurValidation, normaliserQuantites } from '../src/domaine/calculs.js';
import { chequesAuCoffre, enregistrerSortie, etatCoffre } from '../src/domaine/coffre.js';
import { journal, validerJournee } from '../src/domaine/comptages.js';

/** @type {import('better-sqlite3').Database} */
let db;

beforeEach(() => {
  db = ouvrirBase(':memory:');
});

const valider = (options = {}) =>
  validerJournee(db, {
    date: options.date ?? '2026-08-07',
    agent: 'BR',
    quantites: normaliserQuantites(options.detail ?? {}),
    cbCentimes: options.cb ?? 0,
    fond: normaliserQuantites(options.fond ?? {}),
    cheques: options.cheques ?? { nombre: 0, centimes: 0 },
  });

describe('chèques au comptage', () => {
  it('les compte dans la recette du jour', () => {
    const comptage = valider({
      detail: { 2000: 5 },
      cb: 10_000,
      cheques: { nombre: 0, centimes: 7_500 },
    });

    assert.equal(comptage.cheques_centimes, 7_500);
    // 100 € espèces + 100 € CB + 75 € chèques
    assert.equal(comptage.recette_centimes, 10_000 + 10_000 + 7_500);
  });

  it('les fait monter au coffre, contrairement à la CB', () => {
    valider({ detail: { 2000: 5 }, cb: 50_000, cheques: { nombre: 0, centimes: 6_000 } });

    const coffre = etatCoffre(db);
    assert.equal(coffre.cheques.centimes, 6_000);
    // 100 € d'espèces + 60 € de chèques, et pas un centime de CB.
    assert.equal(coffre.especes_centimes, 10_000);
    assert.equal(coffre.solde_centimes, 16_000);
  });

  it('crée un versement même sans une seule espèce', () => {
    const comptage = valider({ cheques: { nombre: 0, centimes: 4_500 } });
    assert.notEqual(comptage.mouvement_id, null);
    assert.equal(etatCoffre(db).solde_centimes, 4_500);
  });

  it('refuse une journée sans espèces, sans CB et sans chèque', () => {
    assert.throws(() => valider({}), ErreurValidation);
  });

  it('les cumule dans le journal', () => {
    valider({ date: '2026-08-06', cheques: { nombre: 0, centimes: 5_000 } });
    valider({ date: '2026-08-07', cheques: { nombre: 0, centimes: 9_000 } });

    const { cumul } = journal(db);
    assert.equal(cumul.cheques_centimes, 14_000);
    assert.equal(cumul.recette_centimes, 14_000);
  });

  it('les range en caisse rouge', () => {
    valider({ detail: { 200: 20 }, cheques: { nombre: 0, centimes: 5_000 } });
    const { repartition } = etatCoffre(db);

    assert.equal(repartition.rouge.cheques.centimes, 5_000);
    assert.equal(repartition.rouge.total_centimes, 5_000);
    // Les pièces de 2 € restent en grise, quelle que soit leur quantité.
    assert.equal(repartition.grise.total_centimes, 4_000);
  });
});

describe('chèques à la sortie du coffre', () => {
  beforeEach(() => {
    valider({ detail: { 5000: 4 }, cheques: { nombre: 0, centimes: 12_000 } });
  });

  it('sortent avec le reste lors d’une remise en banque', () => {
    const sortie = enregistrerSortie(db, {
      date: '2026-08-08',
      agent: 'BR',
      motif: 'Remise en banque',
      quantites: normaliserQuantites({ 5000: 4 }),
      cheques: { nombre: 0, centimes: 12_000 },
    });

    assert.equal(sortie.montant_centimes, 20_000 + 12_000);
    assert.equal(sortie.especes_centimes, 20_000);
    assert.equal(sortie.cheques_centimes, 12_000);
    assert.equal(etatCoffre(db).solde_centimes, 0);
    assert.equal(chequesAuCoffre(db).centimes, 0);
  });

  it('peuvent sortir seuls, sans aucune espèce', () => {
    enregistrerSortie(db, {
      date: '2026-08-08',
      agent: 'BR',
      motif: 'Remise en banque',
      quantites: new Map(),
      cheques: { nombre: 0, centimes: 12_000 },
    });
    assert.equal(etatCoffre(db).solde_centimes, 20_000);
  });

  it('refusent de sortir un montant de chèques supérieur au stock', () => {
    assert.throws(
      () =>
        enregistrerSortie(db, {
          date: '2026-08-08',
          agent: 'BR',
          motif: 'Remise en banque',
          quantites: new Map(),
          cheques: { nombre: 0, centimes: 12_001 },
        }),
      /Pas autant de chèques/,
    );
    // Rien n'a bougé.
    assert.equal(etatCoffre(db).solde_centimes, 32_000);
  });

  it('acceptent une sortie partielle de chèques', () => {
    enregistrerSortie(db, {
      date: '2026-08-08',
      agent: 'BR',
      motif: 'Remise en banque',
      quantites: new Map(),
      cheques: { nombre: 0, centimes: 5_000 },
    });
    assert.equal(chequesAuCoffre(db).centimes, 7_000);
    assert.equal(etatCoffre(db).solde_centimes, 27_000);
  });

  it('refusent une sortie totalement vide', () => {
    assert.throws(
      () =>
        enregistrerSortie(db, {
          date: '2026-08-08',
          agent: 'BR',
          motif: 'Rien',
          quantites: new Map(),
          cheques: { nombre: 0, centimes: 0 },
        }),
      ErreurValidation,
    );
  });

  it('laissent la colonne du nombre à zéro : elle n’est plus renseignée', () => {
    const mouvement = db
      .prepare("SELECT cheques_nombre FROM mouvements_coffre WHERE type = 'versement'")
      .get();
    assert.equal(mouvement.cheques_nombre, 0);
  });
});

describe('migration vers les chèques', () => {
  it('laisse les colonnes à zéro sur une base sans chèque', () => {
    valider({ detail: { 1000: 2 } });
    const comptage = db.prepare('SELECT * FROM comptages').get();
    assert.equal(comptage.cheques_nombre, 0);
    assert.equal(comptage.cheques_centimes, 0);
    assert.equal(etatCoffre(db).solde_centimes, 2_000);
  });
});

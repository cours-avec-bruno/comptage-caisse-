import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ouvrirBase } from '../src/db/index.js';
import { ErreurValidation, normaliserQuantites } from '../src/domaine/calculs.js';
import {
  enregistrerChange,
  etatCoffre,
  inventaire,
} from '../src/domaine/coffre.js';
import { validerJournee } from '../src/domaine/comptages.js';
import { MIGRATIONS, migrer } from '../src/db/migrations.js';

/** @type {import('better-sqlite3').Database} */
let db;

beforeEach(() => {
  db = ouvrirBase(':memory:');
  // De quoi rendre la monnaie : 2 billets de 50, 6 de 10, 20 pièces de 2 €.
  validerJournee(db, {
    date: '2026-08-07',
    agent: 'BR',
    quantites: normaliserQuantites({ 5000: 2, 1000: 6, 200: 20 }),
    cbCentimes: 0,
    fond: new Map(),
  });
});

const changer = (entrantes, sortantes, motif = 'Monnaie') =>
  enregistrerChange(db, {
    date: '2026-08-08',
    agent: 'BR',
    motif,
    entrantes: normaliserQuantites(entrantes),
    sortantes: normaliserQuantites(sortantes),
  });

const quantiteAu = (coupure) =>
  inventaire(db).find((l) => l.coupure_centimes === coupure).quantite;

describe('change de monnaie au coffre', () => {
  it('ne fait pas varier le solde, mais change la composition', () => {
    const avant = etatCoffre(db).solde_centimes;

    // On donne un billet de 50 au coffre, on reprend 5 billets de 10.
    const change = changer({ 5000: 1 }, { 1000: 5 });

    assert.equal(etatCoffre(db).solde_centimes, avant);
    assert.equal(change.montant_centimes, 5_000);
    assert.equal(quantiteAu(5000), 3);
    assert.equal(quantiteAu(1000), 1);
  });

  it('écrit un seul mouvement, de type change, aux quantités signées', () => {
    const { id } = changer({ 5000: 1 }, { 1000: 5 });

    const mouvement = db
      .prepare('SELECT type, motif FROM mouvements_coffre WHERE id = ?')
      .get(id);
    assert.equal(mouvement.type, 'change');
    assert.equal(mouvement.motif, 'Monnaie');

    const detail = db
      .prepare(
        'SELECT coupure_centimes, quantite FROM mouvement_detail WHERE mouvement_id = ? ORDER BY coupure_centimes',
      )
      .all(id);
    assert.deepEqual(detail, [
      { coupure_centimes: 1000, quantite: -5 },
      { coupure_centimes: 5000, quantite: 1 },
    ]);

    // Une sortie suivie d'un versement aurait fait deux lignes : il n'y en a
    // qu'une de plus que le versement de la journée.
    assert.equal(db.prepare('SELECT COUNT(*) n FROM mouvements_coffre').get().n, 2);
  });

  it('refuse un change déséquilibré et chiffre ce qui manque', () => {
    let erreur;
    try {
      changer({ 5000: 1 }, { 1000: 4 });
    } catch (capturee) {
      erreur = capturee;
    }

    assert.ok(erreur instanceof ErreurValidation);
    assert.match(erreur.message, /10,00/);
    assert.equal(erreur.details.ecart_centimes, 1_000);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM mouvements_coffre').get().n, 1);
  });

  it('refuse quand le coffre n’a pas la monnaie, en nommant les coupures', () => {
    let erreur;
    try {
      // 10 billets de 10 demandés, le coffre n'en a que 6.
      changer({ 5000: 2 }, { 1000: 10 });
    } catch (capturee) {
      erreur = capturee;
    }

    assert.ok(erreur instanceof ErreurValidation);
    assert.match(erreur.message, /monnaie/i);
    assert.match(erreur.message, /10 euros/);
    assert.deepEqual(
      erreur.details.coupures.map((c) => c.coupure_centimes),
      [1000],
    );
    // Rien n'a été écrit : le mouvement est refusé en bloc.
    assert.equal(db.prepare('SELECT COUNT(*) n FROM mouvements_coffre').get().n, 1);
  });

  it('compense les coupures présentes des deux côtés', () => {
    // 1 × 50 donné, 1 × 10 + 1 × 50 repris… et 1 × 10 donné : au net, on
    // n'échange que du 2 € contre du 10 €.
    changer({ 1000: 3, 200: 5 }, { 1000: 1, 200: 15 });

    const detail = db
      .prepare(
        `SELECT coupure_centimes, quantite FROM mouvement_detail
          WHERE mouvement_id = (SELECT MAX(id) FROM mouvements_coffre)
          ORDER BY coupure_centimes`,
      )
      .all();
    assert.deepEqual(detail, [
      { coupure_centimes: 200, quantite: -10 },
      { coupure_centimes: 1000, quantite: 2 },
    ]);
  });

  it('refuse un change qui ne changerait rien', () => {
    assert.throws(() => changer({ 1000: 2 }, { 1000: 2 }), ErreurValidation);
  });

  it('refuse un change vide', () => {
    assert.throws(() => changer({}, {}), ErreurValidation);
  });

  it('ne se modifie ni ne se supprime, comme tout mouvement', () => {
    const { id } = changer({ 5000: 1 }, { 1000: 5 });
    assert.throws(
      () => db.prepare('UPDATE mouvements_coffre SET motif = ? WHERE id = ?').run('x', id),
      /ne se modifie pas/,
    );
    assert.throws(
      () => db.prepare('DELETE FROM mouvements_coffre WHERE id = ?').run(id),
      /ne se supprime pas/,
    );
  });
});

describe('migration vers le type « change »', () => {
  it('reconstruit la table sans perdre ni modifier une seule ligne', async () => {
    const { default: Database } = await import('better-sqlite3');
    const ancienne = new Database(':memory:');

    // Une base restée à la version d'avant le change.
    for (const migration of MIGRATIONS.slice(0, 5)) ancienne.exec(migration.sql);
    ancienne.pragma('user_version = 5');
    ancienne
      .prepare(
        `INSERT INTO mouvements_coffre
           (id, contenant_id, date, agent, type, motif, comptage_id, cree_le,
            cheques_nombre, cheques_centimes)
         VALUES (7, 1, '2026-08-01', 'ML', 'versement', 'Journée', NULL,
                 '2026-08-01T19:00:00', 2, 4500)`,
      )
      .run();
    ancienne
      .prepare(
        'INSERT INTO mouvement_detail (mouvement_id, coupure_centimes, quantite) VALUES (7, 5000, 3)',
      )
      .run();

    const avant = ancienne.prepare('SELECT * FROM mouvements_coffre').all();

    migrer(ancienne);

    assert.deepEqual(ancienne.prepare('SELECT * FROM mouvements_coffre').all(), avant);
    assert.deepEqual(ancienne.prepare('SELECT * FROM mouvement_detail').all(), [
      { mouvement_id: 7, coupure_centimes: 5000, quantite: 3 },
    ]);
    // Aucune ligne de détail orpheline.
    assert.deepEqual(ancienne.pragma('foreign_key_check'), []);

    // Le nouveau type passe, un type inventé ne passe toujours pas.
    ancienne
      .prepare(
        `INSERT INTO mouvements_coffre (date, agent, type, motif, cree_le)
         VALUES ('2026-08-02', 'BR', 'change', 'Monnaie', '2026-08-02T19:00:00')`,
      )
      .run();
    assert.throws(() =>
      ancienne
        .prepare(
          `INSERT INTO mouvements_coffre (date, agent, type, motif, cree_le)
           VALUES ('2026-08-02', 'BR', 'cadeau', 'Monnaie', '2026-08-02T19:00:00')`,
        )
        .run(),
    );

    // Les triggers ont bien été replacés sur la table reconstruite.
    assert.throws(
      () => ancienne.prepare('UPDATE mouvements_coffre SET motif = ?').run('x'),
      /ne se modifie pas/,
    );
    assert.throws(
      () => ancienne.prepare('DELETE FROM mouvements_coffre').run(),
      /ne se supprime pas/,
    );

    // L'identifiant reste au-delà de ceux déjà utilisés.
    assert.ok(
      ancienne.prepare('SELECT MAX(id) m FROM mouvements_coffre').get().m > 7,
    );

    ancienne.close();
  });
});

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ouvrirBase } from '../src/db/index.js';
import { ErreurValidation, normaliserQuantites } from '../src/domaine/calculs.js';
import { enregistrerSortie, etatCoffre, inventaire } from '../src/domaine/coffre.js';
import { journal, validerJournee } from '../src/domaine/comptages.js';

/** @type {import('better-sqlite3').Database} */
let db;

beforeEach(() => {
  db = ouvrirBase(':memory:');
});

/** Par défaut aucun fond laissé : la plupart de ces tests portent sur le coffre. */
const valider = (date, quantites, { cb = 0, fond = {}, agent = 'BR' } = {}) =>
  validerJournee(db, {
    date,
    agent,
    quantites: normaliserQuantites(quantites),
    cbCentimes: cb,
    fond: normaliserQuantites(fond),
  });

const quantiteAu = (coupure) =>
  inventaire(db).find((l) => l.coupure_centimes === coupure).quantite;

describe('validation d’une journée', () => {
  it('crée le comptage, son détail et le versement au coffre', () => {
    const comptage = valider('2026-08-07', { 5000: 2, 2000: 3, 100: 12 }, {
      cb: 22_350,
      fond: { 2000: 1, 100: 8 },
    });

    assert.equal(comptage.especes_centimes, 100_00 + 60_00 + 12_00);
    // Fond laissé : 1 × 20 € + 8 × 1 € = 28,00 €
    assert.equal(comptage.fond_centimes, 2_800);
    assert.equal(comptage.recette_especes_centimes, 17_200 - 2_800);
    assert.equal(comptage.recette_centimes, 14_400 + 22_350);

    const detail = db
      .prepare('SELECT coupure_centimes, quantite FROM comptage_detail WHERE comptage_id = ?')
      .all(comptage.id);
    assert.equal(detail.length, 3);

    const mouvements = db.prepare('SELECT * FROM mouvements_coffre').all();
    assert.equal(mouvements.length, 1);
    assert.equal(mouvements[0].type, 'versement');
    assert.equal(mouvements[0].comptage_id, comptage.id);
  });

  it('laisse le fond dans le tiroir : il ne monte pas au coffre', () => {
    // 4 billets de 50 comptés, 1 laissé en fond : 3 montent.
    valider('2026-08-07', { 5000: 4 }, { fond: { 5000: 1 } });
    assert.equal(etatCoffre(db).solde_centimes, 15_000);
    assert.equal(quantiteAu(5000), 3);
  });

  it('ne fait jamais entrer la CB au coffre', () => {
    valider('2026-08-07', { 5000: 1 }, { cb: 500_00 });
    assert.equal(etatCoffre(db).solde_centimes, 5_000);

    const { cumul } = journal(db);
    assert.equal(cumul.cb_centimes, 50_000);
  });

  it('refuse une journée entièrement vide', () => {
    assert.throws(() => valider('2026-08-07', {}, { cb: 0 }), ErreurValidation);
  });

  it('refuse quand le comptage ne couvre pas le fond, en nommant les coupures', () => {
    const erreur = (() => {
      try {
        valider('2026-08-07', { 5000: 2, 100: 3 }, { fond: { 100: 8, 20: 15 } });
        return null;
      } catch (capturee) {
        return capturee;
      }
    })();

    assert.ok(erreur instanceof ErreurValidation);
    assert.match(erreur.message, /1 euro/);
    assert.match(erreur.message, /20 centimes/);
    // Rien n'a été écrit.
    assert.equal(db.prepare('SELECT COUNT(*) n FROM comptages').get().n, 0);
    assert.equal(etatCoffre(db).solde_centimes, 0);
  });

  it('ne verse rien quand le comptage est exactement le fond', () => {
    const comptage = valider('2026-08-07', { 2000: 1 }, { fond: { 2000: 1 } });
    assert.equal(comptage.mouvement_id, null);
    assert.equal(comptage.verse_centimes, 0);
    assert.equal(comptage.recette_especes_centimes, 0);
    assert.equal(etatCoffre(db).solde_centimes, 0);
  });

  it('accepte une journée sans espèces mais avec de la CB, sans mouvement de coffre', () => {
    const comptage = valider('2026-08-07', {}, { cb: 4_500 });
    assert.equal(comptage.mouvement_id, null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM mouvements_coffre').get().n, 0);
  });

  it('accepte deux comptages le même jour : une correction est un nouvel enregistrement', () => {
    valider('2026-08-07', { 5000: 1 });
    valider('2026-08-07', { 1000: 1 });
    assert.equal(journal(db).lignes.length, 2);
    assert.equal(etatCoffre(db).solde_centimes, 6_000);
  });
});

describe('inventaire du coffre', () => {
  it('cumule plusieurs journées coupure par coupure', () => {
    valider('2026-08-05', { 2000: 3, 200: 10 });
    valider('2026-08-06', { 2000: 2, 100: 5 });

    assert.equal(quantiteAu(2000), 5);
    assert.equal(quantiteAu(200), 10);
    assert.equal(quantiteAu(100), 5);
    assert.equal(etatCoffre(db).solde_centimes, 100_00 + 20_00 + 5_00);
  });

  it('n’est stocké nulle part : aucune colonne de solde en base', () => {
    const colonnes = db
      .prepare("SELECT name FROM pragma_table_info('mouvements_coffre')")
      .all()
      .map((c) => c.name);
    assert.ok(!colonnes.some((nom) => /solde|montant|total/.test(nom)));
  });

  it('remonte la date du dernier versement', () => {
    valider('2026-08-05', { 1000: 1 });
    valider('2026-08-07', { 1000: 1 });
    assert.equal(etatCoffre(db).dernier_versement.date, '2026-08-07');
  });
});

describe('sortie du coffre', () => {
  beforeEach(() => {
    valider('2026-08-07', { 5000: 4, 2000: 2, 100: 10 });
  });

  it('retire exactement les coupures demandées', () => {
    const sortie = enregistrerSortie(db, {
      date: '2026-08-08',
      agent: 'BR',
      motif: 'Remise en banque',
      quantites: normaliserQuantites({ 5000: 3 }),
    });

    assert.equal(sortie.montant_centimes, 15_000);
    assert.equal(quantiteAu(5000), 1);
    assert.equal(etatCoffre(db).solde_centimes, 5_000 + 4_000 + 1_000);
  });

  it('écrit des quantités négatives dans le détail', () => {
    const { id } = enregistrerSortie(db, {
      date: '2026-08-08',
      agent: 'BR',
      motif: 'Appro monnaie',
      quantites: normaliserQuantites({ 100: 10 }),
    });

    const detail = db
      .prepare('SELECT quantite FROM mouvement_detail WHERE mouvement_id = ?')
      .all(id);
    assert.deepEqual(detail, [{ quantite: -10 }]);
  });

  it('refuse une sortie qui dépasse le stock et nomme les coupures', () => {
    let erreur;
    try {
      enregistrerSortie(db, {
        date: '2026-08-08',
        agent: 'BR',
        motif: 'Remise en banque',
        quantites: normaliserQuantites({ 5000: 5, 20: 2 }),
      });
    } catch (capturee) {
      erreur = capturee;
    }

    assert.ok(erreur instanceof ErreurValidation, 'une ErreurValidation était attendue');
    assert.match(erreur.message, /20 centimes/);
    assert.match(erreur.message, /50 euros/);
    assert.deepEqual(
      erreur.details.coupures.map((c) => c.coupure_centimes),
      [20, 5000],
    );
  });

  it('n’écrit rien du tout quand une seule coupure manque', () => {
    const avant = etatCoffre(db).solde_centimes;
    assert.throws(() =>
      enregistrerSortie(db, {
        date: '2026-08-08',
        agent: 'BR',
        motif: 'Remise en banque',
        quantites: normaliserQuantites({ 5000: 4, 2000: 3 }),
      }),
    );

    assert.equal(etatCoffre(db).solde_centimes, avant);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM mouvements_coffre WHERE type='sortie'").get().n, 0);
  });

  it('refuse une sortie vide', () => {
    assert.throws(
      () =>
        enregistrerSortie(db, {
          date: '2026-08-08',
          agent: 'BR',
          motif: 'Rien',
          quantites: new Map(),
        }),
      ErreurValidation,
    );
  });

  it('vide le coffre exactement, sans reste', () => {
    enregistrerSortie(db, {
      date: '2026-08-08',
      agent: 'BR',
      motif: 'Remise en banque',
      quantites: normaliserQuantites({ 5000: 4, 2000: 2, 100: 10 }),
    });
    assert.equal(etatCoffre(db).solde_centimes, 0);
    assert.ok(inventaire(db).every((l) => l.quantite === 0));
  });
});

describe('historique non modifiable', () => {
  beforeEach(() => {
    valider('2026-08-07', { 5000: 2 });
  });

  it('interdit la modification d’un comptage', () => {
    assert.throws(
      () => db.prepare('UPDATE comptages SET cb_centimes = 1').run(),
      /ne se modifie pas/,
    );
  });

  it('interdit la suppression d’un comptage', () => {
    assert.throws(() => db.prepare('DELETE FROM comptages').run(), /ne se supprime pas/);
  });

  it('interdit la modification d’un mouvement de coffre et de son détail', () => {
    assert.throws(
      () => db.prepare('UPDATE mouvement_detail SET quantite = 99').run(),
      /ne se modifie pas/,
    );
    assert.throws(
      () => db.prepare('DELETE FROM mouvements_coffre').run(),
      /ne se supprime pas/,
    );
  });
});

describe('journal', () => {
  it('trie du plus récent au plus ancien et cumule en pied de tableau', () => {
    valider('2026-08-05', { 2000: 5 }, { cb: 10_000, fond: { 2000: 1 } });
    valider('2026-08-07', { 2000: 3 }, { cb: 5_000, fond: { 2000: 1 } });
    valider('2026-08-06', { 2000: 4 }, { cb: 2_500, fond: { 2000: 1 } });

    const { lignes, cumul } = journal(db);
    assert.deepEqual(
      lignes.map((l) => l.date),
      ['2026-08-07', '2026-08-06', '2026-08-05'],
    );

    assert.equal(cumul.especes_centimes, 10_000 + 8_000 + 6_000);
    assert.equal(cumul.cb_centimes, 17_500);
    // 3 journées, fond de 20 € laissé à chacune.
    assert.equal(cumul.recette_especes_centimes, 24_000 - 6_000);
    assert.equal(cumul.recette_centimes, 18_000 + 17_500);
  });
});

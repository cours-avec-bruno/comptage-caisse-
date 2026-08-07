import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COUPURES, formaterDecimal, formaterEuros } from 'caisse-partage';

import {
  ErreurValidation,
  construireInventaire,
  coupuresInsuffisantes,
  montantCentimes,
  normaliserQuantites,
  recetteEspeces,
  recetteJour,
  soldeInventaire,
  totalCentimes,
} from '../src/domaine/calculs.js';

describe('référentiel des coupures', () => {
  it('contient les 12 valeurs attendues, dans l’ordre croissant', () => {
    assert.deepEqual(
      COUPURES.map((c) => c.valeur),
      [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000],
    );
  });
});

describe('normaliserQuantites', () => {
  it('accepte un objet et écarte les quantités nulles', () => {
    const quantites = normaliserQuantites({ 5000: 3, 200: 12, 1: 0 });
    assert.equal(quantites.size, 2);
    assert.equal(quantites.get(5000), 3);
    assert.equal(quantites.get(200), 12);
    assert.equal(quantites.has(1), false);
  });

  it('accepte la forme tableau de l’API', () => {
    const quantites = normaliserQuantites([
      { coupure_centimes: 100, quantite: 4 },
      { coupure_centimes: 50, quantite: 2 },
    ]);
    assert.equal(quantites.get(100), 4);
    assert.equal(quantites.get(50), 2);
  });

  it('refuse une coupure hors référentiel', () => {
    assert.throws(() => normaliserQuantites({ 300: 1 }), ErreurValidation);
    assert.throws(() => normaliserQuantites({ 10000: 1 }), ErreurValidation);
  });

  it('refuse une quantité non entière : aucun flottant ne doit passer', () => {
    assert.throws(() => normaliserQuantites({ 100: 1.5 }), ErreurValidation);
    assert.throws(() => normaliserQuantites({ 100: '2,5' }), ErreurValidation);
    assert.throws(() => normaliserQuantites({ 100: NaN }), ErreurValidation);
  });

  it('refuse une quantité négative sauf autorisation explicite', () => {
    assert.throws(() => normaliserQuantites({ 100: -3 }), ErreurValidation);
    assert.equal(
      normaliserQuantites({ 100: -3 }, { autoriserNegatif: true }).get(100),
      -3,
    );
  });

  it('refuse une saisie qui n’est ni objet ni tableau', () => {
    assert.throws(() => normaliserQuantites(null), ErreurValidation);
    assert.throws(() => normaliserQuantites('5000:3'), ErreurValidation);
  });
});

describe('totalCentimes', () => {
  it('additionne des entiers, sans jamais passer par des euros', () => {
    const quantites = normaliserQuantites({
      5000: 2, // 100,00 €
      2000: 3, // 60,00 €
      500: 1, //   5,00 €
      50: 7, //    3,50 €
      1: 9, //     0,09 €
    });
    assert.equal(totalCentimes(quantites), 16859);
  });

  it('donne zéro sur une saisie vide', () => {
    assert.equal(totalCentimes(new Map()), 0);
  });

  it('reste exact là où les flottants dérivent', () => {
    // 0,10 + 0,20 vaut 0,30000000000000004 en flottant. Pas ici.
    const quantites = normaliserQuantites({ 10: 1, 20: 1 });
    assert.equal(totalCentimes(quantites), 30);

    // 1 centime pris 100 000 fois : toujours un entier exact.
    assert.equal(totalCentimes(new Map([[1, 100_000]])), 100_000);
  });

  it('accepte aussi un objet brut', () => {
    assert.equal(totalCentimes({ 100: 3, 200: 1 }), 500);
  });
});

describe('recettes', () => {
  it('retire le fond de caisse des espèces comptées', () => {
    assert.equal(recetteEspeces(45_000, 10_000), 35_000);
  });

  it('additionne espèces et CB pour la recette du jour', () => {
    assert.equal(recetteJour(45_000, 10_000, 22_350), 57_350);
  });

  it('rend une recette négative quand il manque de l’argent', () => {
    // On ne masque pas un écart : c'est exactement ce qu'il faut voir.
    assert.equal(recetteEspeces(9_500, 10_000), -500);
    assert.equal(recetteJour(9_500, 10_000, 0), -500);
  });
});

describe('construireInventaire', () => {
  it('renvoie les 12 coupures même absentes du coffre', () => {
    const inventaire = construireInventaire([{ coupure_centimes: 5000, quantite: 2 }]);
    assert.equal(inventaire.length, 12);
    const vingtCentimes = inventaire.find((l) => l.coupure_centimes === 20);
    assert.equal(vingtCentimes.quantite, 0);
    assert.equal(vingtCentimes.valeur_centimes, 0);
  });

  it('somme les versements et les sorties (quantités signées)', () => {
    const inventaire = construireInventaire([
      { coupure_centimes: 2000, quantite: 10 },
      { coupure_centimes: 2000, quantite: -4 },
      { coupure_centimes: 100, quantite: 25 },
    ]);
    assert.equal(inventaire.find((l) => l.coupure_centimes === 2000).quantite, 6);
    assert.equal(inventaire.find((l) => l.coupure_centimes === 100).quantite, 25);
  });

  it('est trié par valeur croissante', () => {
    const valeurs = construireInventaire([]).map((l) => l.coupure_centimes);
    assert.deepEqual(valeurs, [...valeurs].sort((a, b) => a - b));
  });
});

describe('soldeInventaire', () => {
  it('recalcule le solde depuis les seules quantités', () => {
    const inventaire = construireInventaire([
      { coupure_centimes: 5000, quantite: 3 }, // 150,00 €
      { coupure_centimes: 1000, quantite: 7 }, //  70,00 €
      { coupure_centimes: 200, quantite: 15 }, //  30,00 €
      { coupure_centimes: 5, quantite: 40 }, //     2,00 €
    ]);
    assert.equal(soldeInventaire(inventaire), 25_200);
  });

  it('vaut zéro quand tout est ressorti', () => {
    const inventaire = construireInventaire([
      { coupure_centimes: 5000, quantite: 4 },
      { coupure_centimes: 5000, quantite: -4 },
    ]);
    assert.equal(soldeInventaire(inventaire), 0);
  });
});

describe('coupuresInsuffisantes', () => {
  const stock = construireInventaire([
    { coupure_centimes: 5000, quantite: 4 },
    { coupure_centimes: 2000, quantite: 2 },
    { coupure_centimes: 20, quantite: 0 },
  ]);

  it('laisse passer une sortie couverte par le stock', () => {
    assert.deepEqual(coupuresInsuffisantes(stock, new Map([[5000, 4]])), []);
  });

  it('nomme les coupures qui manquent', () => {
    const manquantes = coupuresInsuffisantes(
      stock,
      new Map([[5000, 5], [2000, 1], [20, 3]]),
    );
    assert.deepEqual(manquantes, [
      { coupure_centimes: 20, demande: 3, disponible: 0 },
      { coupure_centimes: 5000, demande: 5, disponible: 4 },
    ]);
  });

  it('bloque même quand le solde global suffirait', () => {
    // 200 € au coffre en billets de 50, mais aucune pièce de 20 centimes :
    // une sortie de 20 centimes doit être refusée.
    const manquantes = coupuresInsuffisantes(stock, new Map([[20, 1]]));
    assert.equal(manquantes.length, 1);
    assert.equal(manquantes[0].coupure_centimes, 20);
  });
});

describe('montantCentimes', () => {
  it('accepte un entier positif ou nul', () => {
    assert.equal(montantCentimes(0, 'La CB'), 0);
    assert.equal(montantCentimes(22_350, 'La CB'), 22_350);
  });

  it('refuse un flottant ou un négatif', () => {
    assert.throws(() => montantCentimes(12.5, 'La CB'), ErreurValidation);
    assert.throws(() => montantCentimes(-1, 'La CB'), ErreurValidation);
  });
});

describe('formatage', () => {
  it('n’affiche des euros qu’au moment de l’affichage', () => {
    // Espace insécable étroit avant le symbole : normal en fr-FR.
    assert.match(formaterEuros(16_859), /^168,59\s?€$/u);
    assert.match(formaterEuros(1_685_900), /^16\s?859,00\s?€$/u);
    assert.match(formaterEuros(0), /^0,00\s?€$/u);
    assert.match(formaterEuros(-500), /^-5,00\s?€$/u);
  });

  it('rend un décimal à la française pour les CSV', () => {
    assert.equal(formaterDecimal(16_859), '168,59');
    assert.equal(formaterDecimal(5), '0,05');
    assert.equal(formaterDecimal(100), '1,00');
    assert.equal(formaterDecimal(-2_050), '-20,50');
  });
});

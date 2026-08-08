import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEUIL_LIASSE, repartirCoffre } from 'caisse-partage';

import { construireInventaire } from '../src/domaine/calculs.js';

/** Raccourci : { coupure: quantité } -> inventaire complet. */
const inventaire = (quantites) =>
  construireInventaire(
    Object.entries(quantites).map(([coupure, quantite]) => ({
      coupure_centimes: Number(coupure),
      quantite,
    })),
  );

const ligne = (caisse, coupure) =>
  caisse.lignes.find((l) => l.coupure_centimes === coupure);

describe('rangement en caisse grise et caisse rouge', () => {
  it('laisse en grise une pile qui n’atteint pas la liasse', () => {
    const { grise, rouge } = repartirCoffre(inventaire({ 2000: 9 }));
    assert.equal(ligne(grise, 2000).quantite, 9);
    assert.equal(ligne(rouge, 2000).quantite, 0);
  });

  it('fait monter une liasse pleine en rouge dès le dixième billet', () => {
    const { grise, rouge } = repartirCoffre(inventaire({ 2000: 10 }));
    assert.equal(ligne(rouge, 2000).quantite, 10);
    assert.equal(ligne(rouge, 2000).liasses, 1);
    assert.equal(ligne(grise, 2000).quantite, 0);
  });

  it('ne monte que les liasses complètes et laisse le reste en grise', () => {
    // 27 billets de 20 € : 2 liasses de 10 en rouge, 7 qui restent en grise.
    const { grise, rouge } = repartirCoffre(inventaire({ 2000: 27 }));
    assert.equal(ligne(rouge, 2000).quantite, 20);
    assert.equal(ligne(rouge, 2000).liasses, 2);
    assert.equal(ligne(grise, 2000).quantite, 7);
    assert.equal(ligne(grise, 2000).valeur_centimes, 7 * 2000);
  });

  it('met les billets de 50 € en rouge quel que soit leur nombre', () => {
    const { grise, rouge } = repartirCoffre(inventaire({ 5000: 3 }));
    assert.equal(ligne(rouge, 5000).quantite, 3);
    assert.equal(ligne(rouge, 5000).liasses, 0);
    assert.equal(ligne(grise, 5000).quantite, 0);
  });

  it('compte quand même les liasses de 50 €', () => {
    const { rouge } = repartirCoffre(inventaire({ 5000: 23 }));
    assert.equal(ligne(rouge, 5000).quantite, 23);
    assert.equal(ligne(rouge, 5000).liasses, 2);
  });

  it('garde toutes les pièces en grise, même par centaines', () => {
    const { grise, rouge } = repartirCoffre(inventaire({ 200: 150, 10: 40 }));
    assert.equal(ligne(grise, 200).quantite, 150);
    assert.equal(ligne(grise, 10).quantite, 40);
    assert.equal(ligne(rouge, 200).quantite, 0);
    assert.equal(ligne(rouge, 10).quantite, 0);
  });

  it('met les chèques en rouge et les compte dans son total', () => {
    const { rouge, grise } = repartirCoffre(inventaire({ 1000: 3 }), {
      nombre: 4,
      centimes: 8_750,
    });
    assert.deepEqual(rouge.cheques, { nombre: 4, centimes: 8_750 });
    assert.equal(rouge.especes_centimes, 0);
    assert.equal(rouge.total_centimes, 8_750);
    assert.equal(grise.total_centimes, 3_000);
  });

  it('range chaque euro dans une caisse et une seule', () => {
    const stock = inventaire({
      5000: 7, // 350 € -> rouge
      2000: 27, // 400 € rouge (2 liasses) + 140 € grise
      1000: 10, // 100 € rouge (1 liasse)
      500: 4, //    20 € grise
      200: 33, //   66 € grise
      5: 12, //     0,60 € grise
    });
    const cheques = { nombre: 2, centimes: 4_500 };
    const repartition = repartirCoffre(stock, cheques);

    const soldeEspeces = stock.reduce((s, l) => s + l.valeur_centimes, 0);

    assert.equal(
      repartition.grise.total_centimes + repartition.rouge.total_centimes,
      soldeEspeces + cheques.centimes,
      'grise + rouge doit reconstituer exactement le contenu du coffre',
    );
    assert.equal(repartition.total_centimes, soldeEspeces + cheques.centimes);

    assert.equal(repartition.rouge.especes_centimes, 35_000 + 40_000 + 10_000);
    assert.equal(repartition.grise.total_centimes, 14_000 + 2_000 + 6_600 + 60);
  });

  it('ne range rien quand le coffre est vide', () => {
    const repartition = repartirCoffre(inventaire({}));
    assert.equal(repartition.total_centimes, 0);
    assert.ok(repartition.grise.lignes.every((l) => l.quantite === 0));
    assert.ok(repartition.rouge.lignes.every((l) => l.quantite === 0));
  });

  it('expose le seuil de liasse plutôt que de le coder en dur', () => {
    assert.equal(SEUIL_LIASSE, 10);
    const { rouge } = repartirCoffre(inventaire({ 2000: SEUIL_LIASSE - 1 }));
    assert.equal(rouge.lignes.find((l) => l.coupure_centimes === 2000).quantite, 0);
  });
});

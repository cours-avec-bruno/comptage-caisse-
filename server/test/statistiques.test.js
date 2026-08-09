import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decalerJours,
  granularitePour,
  lundiDe,
  nombreDeJours,
  pourcentsEntiers,
  statistiques,
} from 'caisse-partage';

/** Une journée validée, réduite à ce dont les statistiques ont besoin. */
const journee = (date, { especes = 0, cb = 0, cheques = 0 } = {}) => ({
  date,
  cb_centimes: cb,
  cheques_centimes: cheques,
  recette_especes_centimes: especes,
  recette_centimes: especes + cb + cheques,
});

describe('dates', () => {
  it('décale sans se laisser piéger par les fins de mois et les bissextiles', () => {
    assert.equal(decalerJours('2026-08-09', 1), '2026-08-10');
    assert.equal(decalerJours('2026-08-31', 1), '2026-09-01');
    assert.equal(decalerJours('2026-01-01', -1), '2025-12-31');
    assert.equal(decalerJours('2024-02-28', 1), '2024-02-29');
    assert.equal(decalerJours('2026-02-28', 1), '2026-03-01');
  });

  it('compte les jours bornes comprises', () => {
    assert.equal(nombreDeJours('2026-08-09', '2026-08-09'), 1);
    assert.equal(nombreDeJours('2026-08-03', '2026-08-09'), 7);
    assert.equal(nombreDeJours('2026-12-25', '2027-01-05'), 12);
  });

  it('remonte au lundi de la semaine, dimanche compris', () => {
    // 2026-08-09 est un dimanche, 2026-08-03 le lundi qui précède.
    assert.equal(lundiDe('2026-08-09'), '2026-08-03');
    assert.equal(lundiDe('2026-08-03'), '2026-08-03');
    assert.equal(lundiDe('2026-08-04'), '2026-08-03');
  });

  it('choisit le pas de temps selon l’étendue', () => {
    assert.equal(granularitePour(7), 'jour');
    assert.equal(granularitePour(31), 'jour');
    assert.equal(granularitePour(32), 'semaine');
    assert.equal(granularitePour(120), 'semaine');
    assert.equal(granularitePour(121), 'mois');
  });
});

describe('pourcentages', () => {
  it('tombent toujours à 100, même quand trois tiers s’arrondissent mal', () => {
    assert.deepEqual(pourcentsEntiers([1, 1, 1]), [34, 33, 33]);
    assert.equal(pourcentsEntiers([1, 1, 1]).reduce((s, v) => s + v, 0), 100);
    assert.deepEqual(pourcentsEntiers([50, 30, 20]), [50, 30, 20]);
    assert.deepEqual(pourcentsEntiers([1, 0, 0]), [100, 0, 0]);
  });

  it('rendent zéro partout quand il n’y a rien à répartir', () => {
    assert.deepEqual(pourcentsEntiers([0, 0, 0]), [0, 0, 0]);
  });

  it('comptent une part négative comme nulle', () => {
    // Une recette espèces négative est un manque, pas une part du gâteau.
    assert.deepEqual(pourcentsEntiers([-500, 300, 100]), [0, 75, 25]);
  });
});

describe('statistiques d’une période', () => {
  const lignes = [
    journee('2026-08-09', { especes: 10_000, cb: 5_000, cheques: 5_000 }),
    journee('2026-08-08', { especes: 20_000, cb: 20_000 }),
    journee('2026-08-03', { especes: 10_000 }),
    // Hors fenêtre de 7 jours (du 03 au 09) : sert de période précédente.
    journee('2026-08-01', { especes: 40_000 }),
    journee('2026-07-30', { especes: 20_000, cb: 10_000 }),
  ];

  it('additionne ce qui est dans la fenêtre, et rien d’autre', () => {
    const stat = statistiques(lignes, '2026-08-09', 7);

    assert.equal(stat.debut, '2026-08-03');
    assert.equal(stat.fin, '2026-08-09');
    assert.equal(stat.totaux.especes_centimes, 40_000);
    assert.equal(stat.totaux.cb_centimes, 25_000);
    assert.equal(stat.totaux.cheques_centimes, 5_000);
    assert.equal(stat.totaux.recette_centimes, 70_000);
    assert.equal(stat.journees, 3);
  });

  it('donne des parts entières qui font 100', () => {
    const stat = statistiques(lignes, '2026-08-09', 7);
    const { especes, cb, cheques } = stat.parts;
    assert.equal(especes + cb + cheques, 100);
    assert.deepEqual(stat.parts, { especes: 57, cb: 36, cheques: 7 });
  });

  it('moyenne sur les journées travaillées, pas sur les jours du calendrier', () => {
    const stat = statistiques(lignes, '2026-08-09', 7);
    // 700 € sur 3 journées, pas sur 7 jours : la piscine ferme.
    assert.equal(stat.moyenne_par_journee, Math.round(70_000 / 3));
  });

  it('désigne la meilleure journée', () => {
    const stat = statistiques(lignes, '2026-08-09', 7);
    assert.deepEqual(stat.meilleure, { date: '2026-08-08', recette_centimes: 40_000 });
  });

  it('compare à la période précédente de même longueur', () => {
    const stat = statistiques(lignes, '2026-08-09', 7);
    // Du 27/07 au 02/08 : 400 € + 300 € = 700 €.
    assert.equal(stat.precedent.recette_centimes, 70_000);
    assert.equal(stat.evolution_pourcent, 0);
  });

  it('n’invente pas d’évolution quand la période précédente est vide', () => {
    const stat = statistiques([journee('2026-08-09', { especes: 100 })], '2026-08-09', 7);
    assert.equal(stat.precedent, null);
    assert.equal(stat.evolution_pourcent, null);
  });

  it('regroupe plusieurs comptages du même jour en une seule journée', () => {
    const stat = statistiques(
      [
        journee('2026-08-09', { especes: 10_000 }),
        journee('2026-08-09', { cb: 5_000 }),
      ],
      '2026-08-09',
      7,
    );
    assert.equal(stat.journees, 1);
    assert.equal(stat.seaux.length, 1);
    assert.equal(stat.seaux[0].recette_centimes, 15_000);
  });

  it('passe à la semaine puis au mois quand la fenêtre s’allonge', () => {
    const parJour = statistiques(lignes, '2026-08-09', 30);
    assert.equal(parJour.granularite, 'jour');
    assert.equal(parJour.seaux.length, 5);

    const parSemaine = statistiques(lignes, '2026-08-09', 90);
    assert.equal(parSemaine.granularite, 'semaine');
    // Semaines du 27/07 (30/07 + 01/08) et du 03/08 (03, 08, 09).
    assert.deepEqual(
      parSemaine.seaux.map((s) => s.cle),
      ['2026-07-27', '2026-08-03'],
    );
    assert.equal(parSemaine.seaux[0].recette_centimes, 30_000 + 40_000);

    const parMois = statistiques(lignes, '2026-12-31', null);
    assert.equal(parMois.granularite, 'mois');
    assert.deepEqual(
      parMois.seaux.map((s) => s.cle),
      ['2026-07', '2026-08'],
    );
  });

  it('« Tout » part de la première journée validée', () => {
    const stat = statistiques(lignes, '2026-08-09', null);
    assert.equal(stat.debut, '2026-07-30');
    assert.equal(stat.fin, '2026-08-09');
    assert.equal(stat.totaux.recette_centimes, 140_000);
  });

  it('tient debout sans aucune journée', () => {
    const stat = statistiques([], '2026-08-09', 30);
    assert.equal(stat.journees, 0);
    assert.equal(stat.totaux.recette_centimes, 0);
    assert.deepEqual(stat.parts, { especes: 0, cb: 0, cheques: 0 });
    assert.equal(stat.moyenne_par_journee, 0);
    assert.equal(stat.meilleure, null);
    assert.deepEqual(stat.seaux, []);
  });
});

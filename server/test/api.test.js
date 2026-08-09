import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { creerApp } from '../src/app.js';
import { ouvrirBase } from '../src/db/index.js';

let bacASable;
/** @type {import('better-sqlite3').Database} */
let db;
/** @type {import('node:http').Server} */
let serveur;
/** @type {string} */
let base;

beforeEach(async () => {
  bacASable = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-api-'));
  db = ouvrirBase(path.join(bacASable, 'caisse.db'));
  const app = creerApp({
    db,
    dossierSauvegardes: path.join(bacASable, 'sauvegardes'),
    maxSauvegardes: 3,
  });

  await new Promise((resoudre) => {
    serveur = app.listen(0, resoudre);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
  cookie = '';
  await seConnecter();
});

afterEach(async () => {
  await new Promise((resoudre) => serveur.close(resoudre));
  db.close();
  fs.rmSync(bacASable, { recursive: true, force: true });
});

/** Cookie de session, conservé d'un appel à l'autre comme le ferait un navigateur. */
let cookie = '';

const appeler = async (methode, chemin, corps) => {
  const reponse = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: {
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const recu = reponse.headers.get('set-cookie');
  if (recu) cookie = recu.split(';')[0];
  const texte = await reponse.text();
  const type = reponse.headers.get('content-type') ?? '';
  return {
    statut: reponse.status,
    corps: type.includes('json') ? JSON.parse(texte) : texte,
  };
};

/** Ouvre une session : toute l'API la réclame désormais. */
const seConnecter = (initiales = 'BR', motDePasse = 'BRUNO') =>
  appeler('POST', '/api/connexion', { initiales, mot_de_passe: motDePasse });

describe('API paramètres', () => {
  it('expose le fond par défaut et la date du jour', async () => {
    const { statut, corps } = await appeler('GET', '/api/parametres');
    assert.equal(statut, 200);
    assert.equal(corps.fond_defaut_centimes, 10_000);
    assert.match(corps.date_du_jour, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('enregistre un nouveau fond par défaut', async () => {
    const { corps } = await appeler('PUT', '/api/parametres', {
      fond_defaut_centimes: 15_000,
    });
    assert.equal(corps.fond_defaut_centimes, 15_000);
  });

  it('refuse un fond par défaut en euros décimaux', async () => {
    const { statut } = await appeler('PUT', '/api/parametres', {
      fond_defaut_centimes: 100.5,
    });
    assert.equal(statut, 400);
  });
});

describe('API comptage', () => {
  it('valide une journée, verse au coffre et sauvegarde la base', async () => {
    const { statut, corps } = await appeler('POST', '/api/comptages', {
      date: '2026-08-07',
      detail: { 5000: 2, 2000: 3, 100: 12 },
      cb_centimes: 22_350,
      fond_centimes: 10_000,
    });

    assert.equal(statut, 201);
    assert.equal(corps.comptage.especes_centimes, 17_200);
    assert.equal(corps.comptage.recette_centimes, 7_200 + 22_350);
    assert.equal(corps.erreur_sauvegarde, null);
    assert.match(corps.sauvegarde, /^caisse_.*\.db$/);

    const coffre = await appeler('GET', '/api/coffre');
    assert.equal(coffre.corps.solde_centimes, 17_200);
    assert.equal(coffre.corps.dernier_versement.date, '2026-08-07');
    assert.equal(coffre.corps.inventaire.length, 12);
  });

  it('signe avec l’agent de la session, sans tenir compte du corps', async () => {
    const { corps } = await appeler('POST', '/api/comptages', {
      agent: 'ZZ',
      detail: { 5000: 1 },
      cb_centimes: 0,
      fond_centimes: 0,
    });
    assert.equal(corps.comptage.agent, 'BR');
  });

  it('refuse une quantité décimale', async () => {
    const { statut } = await appeler('POST', '/api/comptages', {
      detail: { 5000: 1.5 },
      cb_centimes: 0,
      fond_centimes: 0,
    });
    assert.equal(statut, 400);
  });

  it('signale les comptages déjà enregistrés pour une date', async () => {
    await appeler('POST', '/api/comptages', {
      date: '2026-08-07',
      detail: { 5000: 1 },
      cb_centimes: 0,
      fond_centimes: 0,
    });

    const { corps } = await appeler('GET', '/api/comptages/jour/2026-08-07');
    assert.equal(corps.comptages.length, 1);
    assert.equal(corps.comptages[0].agent, 'BR');
  });

  it('rend le journal trié avec son cumul', async () => {
    for (const date of ['2026-08-05', '2026-08-07', '2026-08-06']) {
      await appeler('POST', '/api/comptages', {
        date,
        detail: { 2000: 5 },
        cb_centimes: 1_000,
        fond_centimes: 0,
      });
    }

    const { corps } = await appeler('GET', '/api/comptages');
    assert.deepEqual(
      corps.lignes.map((l) => l.date),
      ['2026-08-07', '2026-08-06', '2026-08-05'],
    );
    assert.equal(corps.cumul.recette_centimes, 3 * (10_000 + 1_000));
  });
});

describe('API sortie de coffre', () => {
  beforeEach(async () => {
    await appeler('POST', '/api/comptages', {
      date: '2026-08-07',
      detail: { 5000: 4, 2000: 2 },
      cb_centimes: 0,
      fond_centimes: 0,
    });
  });

  it('enregistre une sortie et rend le coffre à jour', async () => {
    const { statut, corps } = await appeler('POST', '/api/coffre/sorties', {
      date: '2026-08-08',
      motif: 'Remise en banque',
      detail: { 5000: 4 },
    });

    assert.equal(statut, 201);
    assert.equal(corps.sortie.montant_centimes, 20_000);
    assert.equal(corps.coffre.solde_centimes, 4_000);
  });

  it('refuse une sortie sans motif', async () => {
    const { statut, corps } = await appeler('POST', '/api/coffre/sorties', {
      motif: '   ',
      detail: { 5000: 1 },
    });
    assert.equal(statut, 400);
    assert.match(corps.erreur, /motif/i);
  });

  it('refuse une sortie qui dépasse le stock et nomme les coupures', async () => {
    const { statut, corps } = await appeler('POST', '/api/coffre/sorties', {
      motif: 'Remise en banque',
      detail: { 5000: 9 },
    });

    assert.equal(statut, 400);
    assert.match(corps.erreur, /50 euros/);
    assert.deepEqual(corps.details.coupures, [
      { coupure_centimes: 5000, demande: 9, disponible: 4 },
    ]);

    const coffre = await appeler('GET', '/api/coffre');
    assert.equal(coffre.corps.solde_centimes, 24_000);
  });
});

describe('API export', () => {
  it('sert les trois CSV en pièce jointe', async () => {
    await appeler('POST', '/api/comptages', {
      detail: { 5000: 1 },
      cb_centimes: 0,
      fond_centimes: 0,
    });

    for (const nom of ['comptages', 'mouvements', 'inventaire']) {
      // Le navigateur joint le cookie sur une navigation directe ; ici il
      // faut le passer à la main.
      const reponse = await fetch(`${base}/api/export/${nom}.csv`, {
        headers: { Cookie: cookie },
      });
      assert.equal(reponse.status, 200);
      assert.match(reponse.headers.get('content-type'), /text\/csv/);
      assert.match(reponse.headers.get('content-disposition'), /attachment/);
      assert.ok((await reponse.text()).length > 0);
    }
  });

  it('liste les sauvegardes présentes', async () => {
    await appeler('POST', '/api/sauvegardes');
    const { corps } = await appeler('GET', '/api/sauvegardes');
    assert.equal(corps.fichiers.length, 1);
  });
});

describe('export sans session', () => {
  it('refuse de servir un CSV à qui n’est pas connecté', async () => {
    const reponse = await fetch(`${base}/api/export/comptages.csv`);
    assert.equal(reponse.status, 401);
  });
});

describe('routes inconnues', () => {
  it('rendent un 404 JSON', async () => {
    const { statut, corps } = await appeler('GET', '/api/nimporte-quoi');
    assert.equal(statut, 404);
    assert.equal(corps.erreur, 'Route inconnue.');
  });
});

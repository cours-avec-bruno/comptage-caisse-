import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { creerApp } from '../src/app.js';
import { ouvrirBase } from '../src/db/index.js';
import {
  authentifier,
  creerAgent,
  hacher,
  initialesDe,
  listerAgents,
  modifierAgent,
  motDePasseParDefaut,
  verifier,
} from '../src/domaine/agents.js';
import { ErreurValidation } from '../src/domaine/calculs.js';

let bacASable;
/** @type {import('better-sqlite3').Database} */
let db;
/** @type {import('node:http').Server} */
let serveur;
let base;

beforeEach(async () => {
  bacASable = fs.mkdtempSync(path.join(os.tmpdir(), 'caisse-agents-'));
  db = ouvrirBase(path.join(bacASable, 'caisse.db'));
  const app = creerApp({ db, dossierSauvegardes: path.join(bacASable, 'sauvegardes') });
  await new Promise((r) => { serveur = app.listen(0, r); });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

afterEach(async () => {
  await new Promise((r) => serveur.close(r));
  db.close();
  fs.rmSync(bacASable, { recursive: true, force: true });
});

/** Client HTTP qui garde le cookie de session, comme un navigateur. */
function creerClient() {
  let cookie = '';
  return async (methode, chemin, corps) => {
    const reponse = await fetch(`${base}${chemin}`, {
      method: methode,
      headers: {
        ...(corps ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const reçu = reponse.headers.get('set-cookie');
    if (reçu) cookie = reçu.split(';')[0];
    const texte = await reponse.text();
    return {
      statut: reponse.status,
      corps: texte && reponse.headers.get('content-type')?.includes('json')
        ? JSON.parse(texte)
        : texte,
    };
  };
}

describe('mot de passe', () => {
  it('vaut le prénom en majuscules', () => {
    assert.equal(motDePasseParDefaut('Bruno'), 'BRUNO');
    assert.equal(motDePasseParDefaut('  marie '), 'MARIE');
  });

  it('retire les accents, pour qu’il se tape vite', () => {
    assert.equal(motDePasseParDefaut('Hélène'), 'HELENE');
    assert.equal(motDePasseParDefaut('Joël'), 'JOEL');
  });

  it('n’est jamais stocké en clair', () => {
    const agent = listerAgents(db)[0];
    const ligne = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
    assert.ok(!JSON.stringify(ligne).includes('BRUNO'));
    assert.equal(ligne.mdp_hash.length, 128); // 64 octets en hexadécimal
    assert.ok(ligne.mdp_sel.length > 0);
  });

  it('donne un hash différent à deux agents ayant le même mot de passe', () => {
    const a = creerAgent(db, { prenom: 'Paul', nom: 'Un' });
    const b = creerAgent(db, { prenom: 'Paul', nom: 'Deux' });
    const ligneA = db.prepare('SELECT mdp_hash FROM agents WHERE id = ?').get(a.id);
    const ligneB = db.prepare('SELECT mdp_hash FROM agents WHERE id = ?').get(b.id);
    // Même mot de passe « PAUL », mais deux sels : deux empreintes.
    assert.notEqual(ligneA.mdp_hash, ligneB.mdp_hash);
  });

  it('vérifie sans se tromper de casse', () => {
    const { hash, sel } = hacher('BRUNO');
    assert.equal(verifier('BRUNO', hash, sel), true);
    assert.equal(verifier('bruno', hash, sel), false);
    assert.equal(verifier('BRUN', hash, sel), false);
  });
});

describe('agents au premier démarrage', () => {
  it('crée Bruno Ricci et un second agent', () => {
    const agents = listerAgents(db);
    assert.equal(agents.length, 2);
    assert.deepEqual(agents.map((a) => a.initiales).sort(), ['BR', 'ML']);
    assert.ok(agents.some((a) => a.prenom === 'Bruno' && a.nom === 'Ricci'));
  });

  it('leur donne leur prénom en majuscules comme mot de passe', () => {
    assert.ok(authentifier(db, 'BR', 'BRUNO'));
    assert.ok(authentifier(db, 'ML', 'MARIE'));
    assert.equal(authentifier(db, 'BR', 'RICCI'), null);
  });

  it('ne recrée personne au redémarrage', () => {
    const chemin = path.join(bacASable, 'caisse.db');
    db.close();
    db = ouvrirBase(chemin);
    assert.equal(listerAgents(db).length, 2);
  });
});

describe('initiales', () => {
  it('se déduisent du prénom et du nom', () => {
    assert.equal(initialesDe('Bruno', 'Ricci'), 'BR');
    assert.equal(initialesDe('Élodie', 'Ötz'), 'EO');
  });

  it('évitent la collision par un suffixe', () => {
    const agent = creerAgent(db, { prenom: 'Bernard', nom: 'Roux' }); // BR déjà pris
    assert.equal(agent.initiales, 'BR2');
  });
});

describe('gestion des agents', () => {
  it('refuse un agent sans prénom ou sans nom', () => {
    assert.throws(() => creerAgent(db, { prenom: '', nom: 'Durand' }), ErreurValidation);
    assert.throws(() => creerAgent(db, { prenom: 'Jean', nom: '  ' }), ErreurValidation);
  });

  it('désactive un agent et ferme ses sessions', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'ML', mot_de_passe: 'MARIE' });
    assert.ok((await client('GET', '/api/session')).corps.agent);

    const marie = listerAgents(db).find((a) => a.initiales === 'ML');
    modifierAgent(db, marie.id, { actif: false });

    assert.equal((await client('GET', '/api/session')).corps.agent, null);
    assert.equal(authentifier(db, 'ML', 'MARIE'), null);
  });

  it('refuse de désactiver le dernier agent actif', () => {
    const [premier, second] = listerAgents(db);
    modifierAgent(db, second.id, { actif: false });
    assert.throws(
      () => modifierAgent(db, premier.id, { actif: false }),
      /dernier agent/,
    );
  });
});

describe('API de connexion', () => {
  it('ouvre une session et rend l’agent', async () => {
    const client = creerClient();
    const { statut, corps } = await client('POST', '/api/connexion', {
      initiales: 'BR',
      mot_de_passe: 'BRUNO',
    });
    assert.equal(statut, 200);
    assert.equal(corps.agent.prenom, 'Bruno');
    assert.equal(corps.agent.initiales, 'BR');
    assert.equal(corps.agent.mdp_hash, undefined, 'le hash ne sort jamais de la base');
  });

  it('refuse un mauvais mot de passe sans dire lequel des deux est faux', async () => {
    const client = creerClient();
    const mauvaisMdp = await client('POST', '/api/connexion', {
      initiales: 'BR',
      mot_de_passe: 'FAUX',
    });
    const inconnu = await client('POST', '/api/connexion', {
      initiales: 'ZZ',
      mot_de_passe: 'FAUX',
    });
    assert.equal(mauvaisMdp.statut, 401);
    assert.equal(inconnu.statut, 401);
    assert.equal(mauvaisMdp.corps.erreur, inconnu.corps.erreur);
  });

  it('ferme la porte à tout le reste de l’API sans session', async () => {
    const anonyme = creerClient();
    for (const chemin of ['/api/coffre', '/api/comptages', '/api/agents', '/api/parametres']) {
      const { statut } = await anonyme('GET', chemin);
      assert.equal(statut, 401, `${chemin} devrait exiger une session`);
    }
  });

  it('signe le comptage avec l’agent de la session, pas avec celui du corps', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'ML', mot_de_passe: 'MARIE' });

    await client('PUT', '/api/parametres', { fond_composition: {} });

    // Le client tente de signer au nom de BR ; le serveur doit l'ignorer.
    const { corps } = await client('POST', '/api/comptages', {
      agent: 'BR',
      detail: { 5000: 1 },
      cb_centimes: 0,
    });
    assert.equal(corps.comptage.agent, 'ML');
  });

  it('déconnecte et referme l’accès', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    await client('POST', '/api/deconnexion');
    assert.equal((await client('GET', '/api/session')).corps.agent, null);
    assert.equal((await client('GET', '/api/coffre')).statut, 401);
  });
});

describe('API des agents', () => {
  it('ajoute un agent avec son mot de passe par défaut', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });

    const { statut, corps } = await client('POST', '/api/agents', {
      prenom: 'Sophie',
      nom: 'Nadal',
    });
    assert.equal(statut, 201);
    assert.equal(corps.agent.initiales, 'SN');

    // Le nouvel agent peut se connecter avec son prénom en majuscules.
    const sophie = creerClient();
    assert.equal(
      (await sophie('POST', '/api/connexion', { initiales: 'SN', mot_de_passe: 'SOPHIE' })).statut,
      200,
    );
  });

  it('change son mot de passe quand on donne l’ancien', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const bruno = listerAgents(db).find((a) => a.initiales === 'BR');

    const { statut } = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'piscine2026',
    });
    assert.equal(statut, 204);
    assert.ok(authentifier(db, 'BR', 'piscine2026'));
    assert.equal(authentifier(db, 'BR', 'BRUNO'), null);
  });

  it('refuse le changement si l’ancien mot de passe est faux', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const bruno = listerAgents(db).find((a) => a.initiales === 'BR');

    const { statut, corps } = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'PASBRUNO',
      mot_de_passe: 'piscine2026',
    });
    assert.equal(statut, 400);
    assert.match(corps.erreur, /Ancien mot de passe/);
    // Rien n'a bougé.
    assert.ok(authentifier(db, 'BR', 'BRUNO'));
  });

  it('refuse le changement sans ancien mot de passe du tout', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const bruno = listerAgents(db).find((a) => a.initiales === 'BR');

    const { statut } = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      mot_de_passe: 'piscine2026',
    });
    assert.equal(statut, 400);
    assert.ok(authentifier(db, 'BR', 'BRUNO'));
  });

  it('refuse un nouveau mot de passe identique à l’ancien', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const bruno = listerAgents(db).find((a) => a.initiales === 'BR');

    const { statut } = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'BRUNO',
    });
    assert.equal(statut, 400);
  });

  it('interdit de choisir le mot de passe d’un collègue', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const marie = listerAgents(db).find((a) => a.initiales === 'ML');

    const { statut, corps } = await client('PUT', `/api/agents/${marie.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'je_connais_ce_mot',
    });
    assert.equal(statut, 400);
    assert.match(corps.erreur, /collègue/);
    // Marie garde le sien.
    assert.ok(authentifier(db, 'ML', 'MARIE'));
  });

  it('réinitialise celui d’un collègue, en confirmant par le sien', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const marie = listerAgents(db).find((a) => a.initiales === 'ML');

    // Marie s'est choisi un mot de passe, puis l'a oublié.
    const marieClient = creerClient();
    await marieClient('POST', '/api/connexion', { initiales: 'ML', mot_de_passe: 'MARIE' });
    await marieClient('PUT', `/api/agents/${marie.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'MARIE',
      mot_de_passe: 'oublie2026',
    });

    const { corps } = await client('PUT', `/api/agents/${marie.id}/mot-de-passe`, {
      reinitialiser: true,
      mon_mot_de_passe: 'BRUNO',
    });
    assert.equal(corps.mot_de_passe, 'MARIE');
    assert.ok(authentifier(db, 'ML', 'MARIE'));
  });

  it('refuse la réinitialisation sans son propre mot de passe', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const marie = listerAgents(db).find((a) => a.initiales === 'ML');

    // Sans cette barrière, exiger l'ancien mot de passe ne servirait à rien :
    // il suffirait de réinitialiser puis de se connecter à sa place.
    const sansRien = await client('PUT', `/api/agents/${marie.id}/mot-de-passe`, {
      reinitialiser: true,
    });
    const avecFaux = await client('PUT', `/api/agents/${marie.id}/mot-de-passe`, {
      reinitialiser: true,
      mon_mot_de_passe: 'PASBRUNO',
    });

    assert.equal(sansRien.statut, 400);
    assert.equal(avecFaux.statut, 400);
    assert.ok(authentifier(db, 'ML', 'MARIE'), 'Marie ne doit pas avoir bougé');
  });

  it('refuse un mot de passe trop court', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const bruno = listerAgents(db).find((a) => a.initiales === 'BR');
    const { statut } = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'ab',
    });
    assert.equal(statut, 400);
  });
});

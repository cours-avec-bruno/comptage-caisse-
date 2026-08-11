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
  supprimerAgent,
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

  it('évitent la collision en comptant les homonymes entre parenthèses', () => {
    const bernard = creerAgent(db, { prenom: 'Bernard', nom: 'Roux' }); // BR déjà pris
    assert.equal(bernard.initiales, 'BR(2)');

    const beatrice = creerAgent(db, { prenom: 'Béatrice', nom: 'Renaud' });
    assert.equal(beatrice.initiales, 'BR(3)');
  });

  it('acceptent la connexion avec des initiales entre parenthèses', () => {
    creerAgent(db, { prenom: 'Bernard', nom: 'Roux' });
    assert.ok(authentifier(db, 'BR(2)', 'BERNARD'), 'Bernard doit pouvoir se connecter');
    // Les initiales se tapent sans se soucier de la casse, parenthèse comprise.
    assert.ok(authentifier(db, 'br(2)', 'BERNARD'));
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
      confirmation: 'piscine2026',
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
      confirmation: 'piscine2026',
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
      confirmation: 'piscine2026',
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
      confirmation: 'BRUNO',
    });
    assert.equal(statut, 400);
  });

  it('n’offre aucun moyen de toucher au mot de passe d’un collègue', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const marie = listerAgents(db).find((a) => a.initiales === 'ML');

    // Ni en le choisissant…
    const choisi = await client('PUT', `/api/agents/${marie.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'je_connais_ce_mot',
      confirmation: 'je_connais_ce_mot',
    });
    // …ni en tentant l'ancienne remise au prénom.
    const remis = await client('PUT', `/api/agents/${marie.id}/mot-de-passe`, {
      reinitialiser: true,
      mon_mot_de_passe: 'BRUNO',
    });

    assert.equal(choisi.statut, 400);
    assert.match(choisi.corps.erreur, /collègue/);
    assert.equal(remis.statut, 400);
    // Marie garde le sien, dans les deux cas.
    assert.ok(authentifier(db, 'ML', 'MARIE'));
  });

  it('exige que le nouveau mot de passe soit tapé deux fois à l’identique', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const bruno = listerAgents(db).find((a) => a.initiales === 'BR');

    const faute = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'nouveau2026',
      confirmation: 'nouveau2027',
    });
    assert.equal(faute.statut, 400);
    assert.match(faute.corps.erreur, /identiques/);
    assert.ok(authentifier(db, 'BR', 'BRUNO'), 'rien ne doit avoir changé');

    // Une confirmation absente ne passe pas non plus : la règle est au
    // serveur, pas seulement à l'écran.
    const sansRien = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'nouveau2026',
    });
    assert.equal(sansRien.statut, 400);
    assert.ok(authentifier(db, 'BR', 'BRUNO'));

    const bon = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'nouveau2026',
      confirmation: 'nouveau2026',
    });
    assert.equal(bon.statut, 204);
    assert.ok(authentifier(db, 'BR', 'nouveau2026'));
  });

  it('refuse un mot de passe trop court', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const bruno = listerAgents(db).find((a) => a.initiales === 'BR');
    const { statut } = await client('PUT', `/api/agents/${bruno.id}/mot-de-passe`, {
      ancien_mot_de_passe: 'BRUNO',
      mot_de_passe: 'ab',
      confirmation: 'ab',
    });
    assert.equal(statut, 400);
  });
});

describe('suppression définitive d’un agent', () => {
  /** Bruno est connecté ; Marie est la cible. */
  const acteurs = () => ({
    bruno: listerAgents(db).find((a) => a.initiales === 'BR'),
    marie: listerAgents(db).find((a) => a.initiales === 'ML'),
  });

  it('exige le mot de passe de la session qui la demande', async () => {
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const { marie } = acteurs();

    const sansRien = await client('DELETE', `/api/agents/${marie.id}`, {});
    assert.equal(sansRien.statut, 400);
    assert.match(sansRien.corps.erreur, /Mot de passe incorrect/);

    // Celui de la cible ne vaut rien : c'est la session qui confirme.
    const celuiDeMarie = await client('DELETE', `/api/agents/${marie.id}`, {
      mot_de_passe: 'MARIE',
    });
    assert.equal(celuiDeMarie.statut, 400);
    assert.ok(listerAgents(db).some((a) => a.initiales === 'ML'), 'Marie est toujours là');

    const bon = await client('DELETE', `/api/agents/${marie.id}`, {
      mot_de_passe: 'BRUNO',
    });
    assert.equal(bon.statut, 200);
    assert.equal(bon.corps.agent.initiales, 'ML');
    assert.ok(!listerAgents(db, { inclureInactifs: true }).some((a) => a.initiales === 'ML'));
  });

  it('refuse qu’on se supprime soi-même', () => {
    const { bruno } = acteurs();
    assert.throws(
      () => supprimerAgent(db, bruno.id, bruno.id, 'BRUNO'),
      (erreur) =>
        erreur instanceof ErreurValidation && /votre propre compte/.test(erreur.message),
    );
    assert.ok(authentifier(db, 'BR', 'BRUNO'));
  });

  it('refuse de supprimer le dernier agent actif', () => {
    const { bruno, marie } = acteurs();
    // Bruno désactivé, Marie est la seule qui peut encore se connecter — et
    // c'est elle qui demande, donc elle ne peut viser que Bruno.
    modifierAgent(db, marie.id, { actif: false });
    assert.throws(
      () => supprimerAgent(db, bruno.id, marie.id, 'MARIE'),
      (erreur) =>
        erreur instanceof ErreurValidation && /dernier agent actif/.test(erreur.message),
    );
  });

  it('ferme les sessions ouvertes de l’agent supprimé', async () => {
    const posteDeMarie = creerClient();
    await posteDeMarie('POST', '/api/connexion', { initiales: 'ML', mot_de_passe: 'MARIE' });
    assert.equal((await posteDeMarie('GET', '/api/agents')).statut, 200);

    const posteDeBruno = creerClient();
    await posteDeBruno('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const { marie } = acteurs();
    await posteDeBruno('DELETE', `/api/agents/${marie.id}`, { mot_de_passe: 'BRUNO' });

    // Le poste de Marie ne doit pas rester ouvert sur un compte disparu.
    assert.equal((await posteDeMarie('GET', '/api/agents')).statut, 401);
  });

  it('ne rend jamais les initiales d’un supprimé à un nouveau venu', () => {
    const { bruno, marie } = acteurs();
    supprimerAgent(db, marie.id, bruno.id, 'BRUNO');

    // Une autre Marie Lefevre : ses initiales naturelles sont « ML », déjà
    // portées par des mouvements passés. Elle en reçoit d'autres.
    const nouvelle = creerAgent(db, { prenom: 'Marie', nom: 'Lefevre' });
    assert.notEqual(nouvelle.initiales, 'ML');
    assert.equal(nouvelle.initiales, 'ML(2)');

    // Et la suivante, « ML(3) » : la parenthèse compte les homonymes.
    const encore = creerAgent(db, { prenom: 'Mathieu', nom: 'Lambert' });
    assert.equal(encore.initiales, 'ML(3)');
  });

  it('laisse l’historique intact : il porte des initiales, pas une clé', async () => {
    // Marie valide une journée : le versement au coffre porte ses initiales.
    const client = creerClient();
    await client('POST', '/api/connexion', { initiales: 'ML', mot_de_passe: 'MARIE' });
    await client('PUT', '/api/parametres', { fond_composition: { 2000: 1, 100: 5 } });
    const { statut } = await client('POST', '/api/comptages', {
      date: '2026-08-10',
      detail: { 5000: 2, 2000: 3, 100: 12 },
      cb_centimes: 0,
    });
    assert.equal(statut, 201);

    const parBruno = creerClient();
    await parBruno('POST', '/api/connexion', { initiales: 'BR', mot_de_passe: 'BRUNO' });
    const { marie } = acteurs();
    const suppression = await parBruno('DELETE', `/api/agents/${marie.id}`, {
      mot_de_passe: 'BRUNO',
    });
    assert.equal(suppression.statut, 200);

    const { corps } = await parBruno('GET', '/api/coffre/mouvements');
    const versement = corps.mouvements.find((m) => m.date === '2026-08-10');
    assert.ok(versement, 'le versement de Marie est toujours au journal');
    assert.equal(versement.agent, 'ML');
  });
});

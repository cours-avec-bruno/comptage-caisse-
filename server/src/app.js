import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

import { ErreurValidation, montantCentimes, normaliserQuantites } from './domaine/calculs.js';
import { dateDuJour, estDateValide } from './domaine/dates.js';
import { etatCoffre, enregistrerSortie, inventaire } from './domaine/coffre.js';
import {
  comptagesDuJour,
  detailComptage,
  journal,
  validerJournee,
} from './domaine/comptages.js';
import { ecrireParametres, lireParametres, validerAgent } from './domaine/parametres.js';
import { csvComptages, csvInventaire, csvMouvements } from './export-csv.js';
import { listerSauvegardes, sauvegarder } from './sauvegarde.js';

/**
 * @param {object} options
 * @param {import('better-sqlite3').Database} options.db
 * @param {string} options.dossierSauvegardes
 * @param {number} [options.maxSauvegardes]
 * @param {string} [options.dossierStatique] front buildé à servir
 */
export function creerApp(options) {
  const {
    db,
    dossierSauvegardes,
    maxSauvegardes = 30,
    dossierStatique,
  } = options;

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  const api = express.Router();

  /** Enveloppe les handlers asynchrones pour que les rejets arrivent au gestionnaire d'erreurs. */
  const asyncRoute = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

  /**
   * Chèques d'une requête : un seul montant total.
   *
   * La colonne `cheques_nombre` reste en base — les migrations sont
   * append-only et l'historique déjà écrit la porte — mais on ne la
   * renseigne plus : un montant suffit à vérifier la caisse rouge.
   */
  const lireCheques = (corps) => ({
    nombre: 0,
    centimes: montantCentimes(corps.cheques_centimes ?? 0, 'Le montant des chèques'),
  });

  // --- Paramètres -----------------------------------------------------------

  api.get('/parametres', (req, res) => {
    res.json({ ...lireParametres(db), date_du_jour: dateDuJour() });
  });

  api.put('/parametres', (req, res) => {
    res.json(ecrireParametres(db, req.body ?? {}));
  });

  // --- Comptage du jour -----------------------------------------------------

  api.get('/comptages', (req, res) => {
    res.json(journal(db));
  });

  api.get('/comptages/jour/:date', (req, res) => {
    const { date } = req.params;
    if (!estDateValide(date)) throw new ErreurValidation('Date invalide.');
    res.json({ date, comptages: comptagesDuJour(db, date) });
  });

  api.get('/comptages/:id', (req, res) => {
    const id = Number(req.params.id);
    const comptage = db.prepare('SELECT * FROM comptages WHERE id = ?').get(id);
    if (!comptage) {
      res.status(404).json({ erreur: 'Comptage introuvable.' });
      return;
    }
    res.json({ ...comptage, detail: detailComptage(db, id) });
  });

  api.post(
    '/comptages',
    asyncRoute(async (req, res) => {
      const corps = req.body ?? {};
      const date = corps.date ?? dateDuJour();
      if (!estDateValide(date)) throw new ErreurValidation('Date invalide.');

      const agent = validerAgent(db, corps.agent);
      const quantites = normaliserQuantites(corps.detail ?? {});
      const cbCentimes = montantCentimes(corps.cb_centimes, 'La recette CB');
      const fondCentimes = montantCentimes(corps.fond_centimes, 'Le fond de caisse');
      const cheques = lireCheques(corps);

      const comptage = validerJournee(db, {
        date,
        agent,
        quantites,
        cbCentimes,
        fondCentimes,
        cheques,
      });

      // Sauvegarde à chaque validation de journée, comme demandé au brief.
      // Un échec de sauvegarde ne doit pas annuler un comptage déjà écrit :
      // on le signale dans la réponse et l'interface le remonte.
      let sauvegarde = null;
      let erreurSauvegarde = null;
      try {
        const { fichier } = await sauvegarder(db, {
          dossier: dossierSauvegardes,
          maxFichiers: maxSauvegardes,
        });
        sauvegarde = path.basename(fichier);
      } catch (erreur) {
        erreurSauvegarde = erreur.message;
      }

      res.status(201).json({ comptage, sauvegarde, erreur_sauvegarde: erreurSauvegarde });
    }),
  );

  // --- Coffre ---------------------------------------------------------------

  api.get('/coffre', (req, res) => {
    res.json(etatCoffre(db));
  });

  api.get('/coffre/mouvements', (req, res) => {
    const mouvements = db
      .prepare(
        `SELECT id, date, agent, type, motif, comptage_id, cree_le,
                cheques_nombre, cheques_centimes
           FROM mouvements_coffre
          ORDER BY date DESC, id DESC`,
      )
      .all();

    const details = db
      .prepare(
        'SELECT mouvement_id, coupure_centimes, quantite FROM mouvement_detail ORDER BY coupure_centimes',
      )
      .all();

    const parMouvement = new Map();
    for (const ligne of details) {
      if (!parMouvement.has(ligne.mouvement_id)) parMouvement.set(ligne.mouvement_id, []);
      parMouvement.get(ligne.mouvement_id).push({
        coupure_centimes: ligne.coupure_centimes,
        quantite: ligne.quantite,
      });
    }

    res.json({
      mouvements: mouvements.map((m) => {
        const detail = parMouvement.get(m.id) ?? [];
        return {
          ...m,
          detail,
          montant_centimes:
            detail.reduce((somme, l) => somme + l.coupure_centimes * l.quantite, 0) +
            m.cheques_centimes,
        };
      }),
    });
  });

  api.post('/coffre/sorties', (req, res) => {
    const corps = req.body ?? {};
    const date = corps.date ?? dateDuJour();
    if (!estDateValide(date)) throw new ErreurValidation('Date invalide.');

    const agent = validerAgent(db, corps.agent);
    const motif = String(corps.motif ?? '').trim();
    if (!motif) {
      throw new ErreurValidation('Le motif de la sortie est obligatoire.');
    }

    const quantites = normaliserQuantites(corps.detail ?? {});
    const cheques = lireCheques(corps);
    const sortie = enregistrerSortie(db, { date, agent, motif, quantites, cheques });

    res.status(201).json({ sortie, coffre: etatCoffre(db) });
  });

  // --- Export et sauvegardes ------------------------------------------------

  const envoyerCsv = (res, nomFichier, contenu) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
    res.send(contenu);
  };

  api.get('/export/comptages.csv', (req, res) => {
    envoyerCsv(res, `comptages_${dateDuJour()}.csv`, csvComptages(db));
  });

  api.get('/export/mouvements.csv', (req, res) => {
    envoyerCsv(res, `mouvements_coffre_${dateDuJour()}.csv`, csvMouvements(db));
  });

  api.get('/export/inventaire.csv', (req, res) => {
    envoyerCsv(res, `inventaire_coffre_${dateDuJour()}.csv`, csvInventaire(inventaire(db)));
  });

  api.get('/sauvegardes', (req, res) => {
    res.json({ dossier: dossierSauvegardes, fichiers: listerSauvegardes(dossierSauvegardes) });
  });

  api.post(
    '/sauvegardes',
    asyncRoute(async (req, res) => {
      const { fichier } = await sauvegarder(db, {
        dossier: dossierSauvegardes,
        maxFichiers: maxSauvegardes,
      });
      res.status(201).json({ fichier: path.basename(fichier) });
    }),
  );

  api.use((req, res) => {
    res.status(404).json({ erreur: 'Route inconnue.' });
  });

  app.use('/api', api);

  // --- Front buildé ---------------------------------------------------------

  if (dossierStatique && fs.existsSync(dossierStatique)) {
    app.use(express.static(dossierStatique));
    app.get('*', (req, res) => {
      res.sendFile(path.join(dossierStatique, 'index.html'));
    });
  }

  // --- Erreurs --------------------------------------------------------------

  // eslint-disable-next-line no-unused-vars -- Express identifie le gestionnaire d'erreurs à ses 4 paramètres
  app.use((erreur, req, res, next) => {
    if (erreur instanceof ErreurValidation) {
      res.status(400).json({ erreur: erreur.message, details: erreur.details });
      return;
    }
    console.error(erreur);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  });

  return app;
}

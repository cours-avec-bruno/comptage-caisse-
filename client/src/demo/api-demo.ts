import { COUPURES, formaterDecimal } from 'caisse-partage';
import { ErreurApi, type Agent, type ClientApi } from '../api-types';
import { repartirCoffre } from 'caisse-partage';
import { MagasinDemo, dateLocale, libelleCoupure, totalCentimes } from './donnees';

/** Même forme que la réponse du serveur : solde, chèques et rangement. */
const etatCoffre = () => {
  const inventaire = magasin.inventaire();
  const cheques = magasin.cheques();
  return {
    solde_centimes: magasin.solde(),
    especes_centimes: magasin.especes(),
    cheques,
    dernier_versement: magasin.dernierVersement(),
    inventaire,
    repartition: repartirCoffre(inventaire, cheques),
  };
};

/**
 * Implémentation de l'API pour la version publiée en démonstration.
 * Même signature que le client HTTP, mais tout se passe en mémoire.
 */

const magasin = new MagasinDemo();

/** Un court délai rend la démo honnête : le vrai serveur n'est pas instantané. */
const repondre = <T>(valeur: T): Promise<T> =>
  new Promise((resoudre) => setTimeout(() => resoudre(valeur), 90));


/** Sans le mot de passe : la démonstration copie la discipline du serveur. */
const publier = (a: { id: number; prenom: string; nom: string; initiales: string; actif: boolean; cree_le: string }): Agent => ({
  id: a.id, prenom: a.prenom, nom: a.nom, initiales: a.initiales,
  actif: a.actif, cree_le: a.cree_le,
});

/** Toute route protégée exige une session, comme sur le vrai serveur. */
const exigerSession = () => {
  if (!magasin.connecte) {
    throw new ErreurApi('Session expirée. Reconnectez-vous.');
  }
  return magasin.connecte;
};

const BOM = '﻿';

function versCsv(entetes: string[], lignes: (string | number)[][]): string {
  const echapper = (valeur: string | number) => {
    const texte = String(valeur ?? '');
    return /[";\n\r]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
  };
  const contenu = [entetes, ...lignes]
    .map((ligne) => ligne.map(echapper).join(';'))
    .join('\r\n');
  return `${BOM}${contenu}\r\n`;
}

function csvComptages(): string {
  const entetes = [
    'id', 'date', 'agent', 'especes_eur', 'cb_eur', 'cheques_nombre',
    'cheques_eur', 'fond_eur', 'recette_especes_eur', 'recette_jour_eur',
    'especes_centimes', 'cb_centimes', 'cheques_centimes', 'fond_centimes',
    'recette_jour_centimes', 'cree_le',
    ...COUPURES.map((c) => `qte_${c.libelle.replace(/\s/g, '_')}`),
  ];

  return versCsv(
    entetes,
    magasin.journal().lignes.map((c) => {
      const quantites = new Map(
        c.detail.map((l) => [l.coupure_centimes, l.quantite]),
      );
      return [
        c.id, c.date, c.agent,
        formaterDecimal(c.especes_centimes),
        formaterDecimal(c.cb_centimes),
        c.cheques_nombre,
        formaterDecimal(c.cheques_centimes),
        formaterDecimal(c.fond_centimes),
        formaterDecimal(c.recette_especes_centimes),
        formaterDecimal(c.recette_centimes),
        c.especes_centimes, c.cb_centimes, c.cheques_centimes, c.fond_centimes,
        c.recette_centimes, c.cree_le,
        ...COUPURES.map((coupure) => quantites.get(coupure.valeur) ?? 0),
      ];
    }),
  );
}

function csvMouvements(): string {
  const lignes: (string | number)[][] = [];

  for (const mouvement of [...magasin.mouvements].reverse()) {
    for (const ligne of mouvement.detail) {
      lignes.push([
        mouvement.id, mouvement.date, mouvement.agent, mouvement.type,
        mouvement.motif, mouvement.comptage_id ?? '',
        libelleCoupure(ligne.coupure_centimes),
        ligne.coupure_centimes, ligne.quantite,
        formaterDecimal(ligne.coupure_centimes * ligne.quantite),
        ligne.coupure_centimes * ligne.quantite,
        mouvement.cree_le,
      ]);
    }
  }

  return versCsv(
    ['mouvement_id', 'date', 'agent', 'type', 'motif', 'comptage_id', 'coupure',
     'coupure_centimes', 'quantite', 'valeur_eur', 'valeur_centimes', 'cree_le'],
    lignes,
  );
}

function csvInventaire(): string {
  return versCsv(
    ['coupure', 'coupure_centimes', 'quantite', 'valeur_eur', 'valeur_centimes'],
    magasin.inventaire().map((l) => [
      libelleCoupure(l.coupure_centimes),
      l.coupure_centimes,
      l.quantite,
      formaterDecimal(l.valeur_centimes),
      l.valeur_centimes,
    ]),
  );
}

export const apiDemo: ClientApi = {
  session: () => repondre({ agent: magasin.connecte ? publier(magasin.connecte) : null }),

  connexion: (initiales, motDePasse) => {
    const agent = magasin.agents.find(
      (a) => a.actif && a.initiales === initiales.trim().toUpperCase(),
    );
    if (!agent || agent.motDePasse !== motDePasse.trim()) {
      return Promise.reject(new ErreurApi('Initiales ou mot de passe incorrect.'));
    }
    magasin.connecte = agent;
    return repondre({ agent: publier(agent) });
  },

  deconnexion: () => {
    magasin.connecte = null;
    return repondre(undefined as void);
  },

  agentsPourConnexion: () =>
    repondre({ agents: magasin.agents.filter((a) => a.actif).map(publier) }),

  agents: () => {
    exigerSession();
    return repondre({ agents: magasin.agents.map(publier) });
  },

  creerAgent: ({ prenom, nom }) => {
    exigerSession();
    if (!prenom.trim()) return Promise.reject(new ErreurApi('Le prénom est obligatoire.'));
    if (!nom.trim()) return Promise.reject(new ErreurApi('Le nom est obligatoire.'));
    return repondre({ agent: publier(magasin.ajouterAgent(prenom, nom)) });
  },

  modifierAgent: (id, modifications) => {
    exigerSession();
    const agent = magasin.agents.find((a) => a.id === id);
    if (!agent) return Promise.reject(new ErreurApi('Agent introuvable.'));

    if (modifications.actif === false) {
      const restants = magasin.agents.filter((a) => a.actif && a.id !== id).length;
      if (restants === 0) {
        return Promise.reject(
          new ErreurApi(
            'Impossible de désactiver le dernier agent : plus personne ne pourrait se connecter.',
          ),
        );
      }
    }

    if (modifications.prenom !== undefined) agent.prenom = modifications.prenom.trim();
    if (modifications.nom !== undefined) agent.nom = modifications.nom.trim();
    if (modifications.actif !== undefined) agent.actif = modifications.actif;
    return repondre({ agent: publier(agent) });
  },

  changerMotDePasse: (id, ancien, nouveau) => {
    const connecte = exigerSession();
    if (id !== connecte.id) {
      return Promise.reject(
        new ErreurApi('On ne choisit pas le mot de passe d’un collègue.'),
      );
    }
    if (connecte.motDePasse !== ancien.trim()) {
      return Promise.reject(new ErreurApi('Ancien mot de passe incorrect.'));
    }
    if (nouveau.trim() === ancien.trim()) {
      return Promise.reject(
        new ErreurApi('Le nouveau mot de passe est identique à l’ancien.'),
      );
    }
    if (nouveau.trim().length < 3) {
      return Promise.reject(new ErreurApi('Le mot de passe fait au moins 3 caractères.'));
    }
    connecte.motDePasse = nouveau.trim();
    return repondre(undefined as void);
  },

  reinitialiserMotDePasse: (id, monMotDePasse) => {
    const connecte = exigerSession();
    if (connecte.motDePasse !== monMotDePasse.trim()) {
      return Promise.reject(new ErreurApi('Votre mot de passe est incorrect.'));
    }
    const agent = magasin.agents.find((a) => a.id === id);
    if (!agent) return Promise.reject(new ErreurApi('Agent introuvable.'));
    agent.motDePasse = MagasinDemo.motDePasseParDefaut(agent.prenom);
    return repondre({ mot_de_passe: agent.motDePasse });
  },

  parametres: () =>
    repondre({
      fond_composition: { ...magasin.fondComposition },
      fond_defaut_centimes: magasin.fondDefautCentimes,
      date_du_jour: dateLocale(),
    }),

  enregistrerParametres: (modifications) => {
    exigerSession();
    if (modifications.fond_composition !== undefined) {
      magasin.fondComposition = { ...modifications.fond_composition };
    }
    return repondre({
      fond_composition: { ...magasin.fondComposition },
      fond_defaut_centimes: magasin.fondDefautCentimes,
    });
  },

  coffre: () => repondre(etatCoffre()),

  journal: () => {
    const { lignes, cumul } = magasin.journal();
    return repondre({ lignes, cumul });
  },

  comptagesDuJour: (date) =>
    repondre({
      date,
      comptages: magasin.comptages
        .filter((c) => c.date === date)
        .map((c) => ({
          id: c.id,
          agent: c.agent,
          especes_centimes: c.especes_centimes,
          cb_centimes: c.cb_centimes,
          cheques_centimes: c.cheques_centimes,
          cree_le: c.cree_le,
        })),
    }),

  validerJournee: (corps) => {
    if (
      Object.keys(corps.detail).length === 0 &&
      corps.cb_centimes === 0 &&
      corps.cheques_centimes === 0
    ) {
      return Promise.reject(
        new ErreurApi('Rien à valider : ni espèces comptées, ni recette CB, ni chèque.'),
      );
    }
    const connecte = exigerSession();
    // Le fond doit pouvoir être reconstitué avec ce qui a été compté.
    const manquantes = Object.entries(magasin.fondComposition)
      .filter(([coupure, attendu]) => (corps.detail[Number(coupure)] ?? 0) < attendu)
      .map(([coupure, attendu]) => ({
        coupure: Number(coupure),
        fond: attendu,
        compte: corps.detail[Number(coupure)] ?? 0,
      }));

    if (manquantes.length > 0) {
      const details = manquantes
        .map((m) => `${libelleCoupure(m.coupure)} (fond ${m.fond}, compté ${m.compte})`)
        .join(', ');
      return Promise.reject(
        new ErreurApi(
          `Le comptage ne permet pas de laisser le fond de caisse : ${details}. Recomptez, ou ajustez la composition du fond dans les paramètres.`,
        ),
      );
    }

    const comptage = magasin.validerJournee({ ...corps, agent: connecte.initiales });
    return repondre({
      comptage: { ...comptage, mouvement_id: null },
      sauvegarde: null,
      erreur_sauvegarde: null,
    });
  },

  sortieCoffre: (corps) => {
    if (!corps.motif.trim()) {
      return Promise.reject(
        new ErreurApi('Le motif de la sortie est obligatoire.'),
      );
    }
    const stockCheques = magasin.cheques();
    if (corps.cheques_centimes > stockCheques.centimes) {
      return Promise.reject(
        new ErreurApi(
          `Pas autant de chèques au coffre : disponible ${stockCheques.centimes} centimes.`,
        ),
      );
    }
    if (
      totalCentimes(
        Object.entries(corps.detail).map(([c, q]) => ({
          coupure_centimes: Number(c),
          quantite: Number(q),
        })),
      ) === 0 &&
      corps.cheques_centimes === 0
    ) {
      return Promise.reject(
        new ErreurApi('Une sortie doit porter sur au moins une coupure ou un chèque.'),
      );
    }

    try {
      const connecte = exigerSession();
      const sortie = magasin.enregistrerSortie({ ...corps, agent: connecte.initiales });
      return repondre({ sortie, coffre: etatCoffre() });
    } catch (probleme) {
      const erreur = probleme as Error & { details?: { coupures?: [] } };
      return Promise.reject(new ErreurApi(erreur.message, erreur.details));
    }
  },

  changeCoffre: (corps) => {
    try {
      const connecte = exigerSession();
      const change = magasin.enregistrerChange({
        ...corps,
        agent: connecte.initiales,
        motif: corps.motif.trim() || 'Monnaie',
      });
      return repondre({ change, coffre: etatCoffre() });
    } catch (probleme) {
      const erreur = probleme as Error & { details?: { coupures?: [] } };
      return Promise.reject(new ErreurApi(erreur.message, erreur.details));
    }
  },

  mouvementsCoffre: () => repondre({ mouvements: magasin.historique() }),

  sauvegardes: () =>
    repondre({
      dossier: 'sauvegardes/ (inactif en démonstration)',
      fichiers: [],
    }),

  lancerSauvegarde: () =>
    Promise.reject(
      new ErreurApi(
        'La sauvegarde n’existe pas en démonstration : il n’y a pas de base de données à copier.',
      ),
    ),

  exporter: (nom) => {
    const contenu =
      nom === 'comptages'
        ? csvComptages()
        : nom === 'mouvements'
          ? csvMouvements()
          : csvInventaire();

    // Le vrai serveur renvoie un fichier ; ici on le fabrique dans le
    // navigateur pour que le bouton fasse la même chose.
    const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = `${nom}_demo_${dateLocale()}.csv`;
    lien.click();
    URL.revokeObjectURL(url);

    return Promise.resolve();
  },
};

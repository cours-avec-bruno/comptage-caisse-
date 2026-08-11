/** Client HTTP : parle au serveur Express de l'application installée. */

import {
  ErreurApi,
  type Agent,
  type ClientApi,
  type ComptageDuJour,
  type EtatCoffre,
  type Journal,
  type MouvementCoffre,
  type Parametres,
  type ReponseValidation,
} from './api-types';

async function appeler<T>(chemin: string, options?: RequestInit): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, {
      // Le jeton de session vit dans un cookie httpOnly : il faut demander
      // qu'il accompagne la requête.
      credentials: 'same-origin',
      headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
  } catch {
    throw new ErreurApi(
      "L'application ne répond pas. Vérifiez que la fenêtre noire de démarrage est toujours ouverte.",
    );
  }

  const texte = await reponse.text();
  const donnees = texte ? JSON.parse(texte) : null;

  if (!reponse.ok) {
    throw new ErreurApi(donnees?.erreur ?? 'Erreur inattendue.', donnees?.details);
  }
  return donnees as T;
}

export const apiHttp: ClientApi = {
  session: () => appeler<{ agent: Agent | null }>('/session'),

  connexion: (initiales, motDePasse) =>
    appeler<{ agent: Agent }>('/connexion', {
      method: 'POST',
      body: JSON.stringify({ initiales, mot_de_passe: motDePasse }),
    }),

  deconnexion: async () => {
    await appeler<void>('/deconnexion', { method: 'POST' });
  },

  agentsPourConnexion: () => appeler<{ agents: Agent[] }>('/agents-connexion'),

  agents: () => appeler<{ agents: Agent[] }>('/agents'),

  creerAgent: (params) =>
    appeler<{ agent: Agent }>('/agents', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  modifierAgent: (id, modifications) =>
    appeler<{ agent: Agent }>(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(modifications),
    }),

  changerMotDePasse: async (id, ancien, nouveau, confirmation) => {
    await appeler<void>(`/agents/${id}/mot-de-passe`, {
      method: 'PUT',
      body: JSON.stringify({
        ancien_mot_de_passe: ancien,
        mot_de_passe: nouveau,
        confirmation,
      }),
    });
  },

  parametres: () => appeler<Parametres>('/parametres'),

  enregistrerParametres: (modifications: {
    fond_composition?: Record<number, number>;
  }) =>
    appeler<Omit<Parametres, 'date_du_jour'>>('/parametres', {
      method: 'PUT',
      body: JSON.stringify(modifications),
    }),

  coffre: () => appeler<EtatCoffre>('/coffre'),

  journal: () => appeler<Journal>('/comptages'),

  comptagesDuJour: (date: string) =>
    appeler<{ date: string; comptages: ComptageDuJour[] }>(`/comptages/jour/${date}`),

  validerJournee: (corps: {
    date: string;
    agent: string;
    detail: Record<number, number>;
    cb_centimes: number;
    cheques_centimes: number;
  }) =>
    appeler<ReponseValidation>('/comptages', {
      method: 'POST',
      body: JSON.stringify(corps),
    }),

  sortieCoffre: (corps: {
    date: string;
    agent: string;
    motif: string;
    detail: Record<number, number>;
  }) =>
    appeler<{ sortie: { id: number; montant_centimes: number }; coffre: EtatCoffre }>(
      '/coffre/sorties',
      { method: 'POST', body: JSON.stringify(corps) },
    ),

  changeCoffre: (corps: {
    date: string;
    agent: string;
    motif: string;
    entrantes: Record<number, number>;
    sortantes: Record<number, number>;
  }) =>
    appeler<{ change: { id: number; montant_centimes: number }; coffre: EtatCoffre }>(
      '/coffre/changes',
      { method: 'POST', body: JSON.stringify(corps) },
    ),

  mouvementsCoffre: () =>
    appeler<{ mouvements: MouvementCoffre[] }>('/coffre/mouvements'),

  sauvegardes: () =>
    appeler<{
      dossier: string;
      fichiers: { fichier: string; taille_octets: number; modifie_le: string }[];
    }>('/sauvegardes'),

  lancerSauvegarde: () =>
    appeler<{ fichier: string }>('/sauvegardes', { method: 'POST' }),

  exporter: async (nom) => {
    // Le serveur renvoie le CSV en pièce jointe : un simple lien suffit.
    window.location.href = `/api/export/${nom}.csv`;
  },
};

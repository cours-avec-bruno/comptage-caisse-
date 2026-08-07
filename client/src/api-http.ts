/** Client HTTP : parle au serveur Express de l'application installée. */

import {
  ErreurApi,
  type ClientApi,
  type ComptageDuJour,
  type EtatCoffre,
  type Journal,
  type Parametres,
  type ReponseValidation,
} from './api-types';

async function appeler<T>(chemin: string, options?: RequestInit): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, {
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
  parametres: () => appeler<Parametres>('/parametres'),

  enregistrerParametres: (modifications: {
    fond_defaut_centimes?: number;
    agents?: string[];
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
    fond_centimes: number;
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

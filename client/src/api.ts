export interface Parametres {
  fond_defaut_centimes: number;
  agents: string[];
  date_du_jour: string;
}

export interface LigneInventaire {
  coupure_centimes: number;
  quantite: number;
  valeur_centimes: number;
}

export interface EtatCoffre {
  solde_centimes: number;
  dernier_versement: { date: string; agent: string; cree_le: string } | null;
  inventaire: LigneInventaire[];
}

export interface LigneJournal {
  id: number;
  date: string;
  agent: string;
  especes_centimes: number;
  cb_centimes: number;
  fond_centimes: number;
  recette_especes_centimes: number;
  recette_centimes: number;
  cree_le: string;
}

export interface Journal {
  lignes: LigneJournal[];
  cumul: {
    especes_centimes: number;
    cb_centimes: number;
    recette_especes_centimes: number;
    recette_centimes: number;
  };
}

export interface ComptageDuJour {
  id: number;
  agent: string;
  especes_centimes: number;
  cb_centimes: number;
  cree_le: string;
}

export interface ReponseValidation {
  comptage: LigneJournal & { mouvement_id: number | null };
  sauvegarde: string | null;
  erreur_sauvegarde: string | null;
}

export interface CoupureManquante {
  coupure_centimes: number;
  demande: number;
  disponible: number;
}

/** Erreur métier renvoyée par l'API, avec les coupures fautives s'il y en a. */
export class ErreurApi extends Error {
  details?: { coupures?: CoupureManquante[] };

  constructor(message: string, details?: { coupures?: CoupureManquante[] }) {
    super(message);
    this.name = 'ErreurApi';
    this.details = details;
  }
}

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

export const api = {
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
};

/**
 * Types et erreurs partagés par le client HTTP et l'implémentation de
 * démonstration. Fichier séparé pour que les deux puissent s'y référer sans
 * créer d'import circulaire.
 */

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

export interface Cheques {
  nombre: number;
  centimes: number;
}

export interface LigneCaisse {
  coupure_centimes: number;
  quantite: number;
  valeur_centimes: number;
}

export interface RepartitionCoffre {
  grise: { lignes: LigneCaisse[]; total_centimes: number };
  rouge: {
    lignes: (LigneCaisse & { liasses: number })[];
    especes_centimes: number;
    cheques: Cheques;
    total_centimes: number;
  };
  total_centimes: number;
}

export interface EtatCoffre {
  solde_centimes: number;
  especes_centimes: number;
  cheques: Cheques;
  dernier_versement: { date: string; agent: string; cree_le: string } | null;
  inventaire: LigneInventaire[];
  repartition: RepartitionCoffre;
}

export interface LigneJournal {
  id: number;
  date: string;
  agent: string;
  especes_centimes: number;
  cb_centimes: number;
  fond_centimes: number;
  cheques_nombre: number;
  cheques_centimes: number;
  recette_especes_centimes: number;
  recette_centimes: number;
  cree_le: string;
}

export interface Journal {
  lignes: LigneJournal[];
  cumul: {
    especes_centimes: number;
    cb_centimes: number;
    cheques_nombre: number;
    cheques_centimes: number;
    recette_especes_centimes: number;
    recette_centimes: number;
  };
}

export interface ComptageDuJour {
  id: number;
  agent: string;
  especes_centimes: number;
  cb_centimes: number;
  cheques_centimes: number;
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

export type NomExport = 'comptages' | 'mouvements' | 'inventaire';

/**
 * Surface commune au client HTTP et à l'implémentation de démonstration.
 * Les écrans ne savent pas lequel des deux ils utilisent.
 */
export interface ClientApi {
  parametres(): Promise<Parametres>;
  enregistrerParametres(modifications: {
    fond_defaut_centimes?: number;
    agents?: string[];
  }): Promise<Omit<Parametres, 'date_du_jour'>>;
  coffre(): Promise<EtatCoffre>;
  journal(): Promise<Journal>;
  comptagesDuJour(date: string): Promise<{ date: string; comptages: ComptageDuJour[] }>;
  validerJournee(corps: {
    date: string;
    agent: string;
    detail: Record<number, number>;
    cb_centimes: number;
    fond_centimes: number;
    cheques_nombre: number;
    cheques_centimes: number;
  }): Promise<ReponseValidation>;
  sortieCoffre(corps: {
    date: string;
    agent: string;
    motif: string;
    detail: Record<number, number>;
    cheques_nombre: number;
    cheques_centimes: number;
  }): Promise<{ sortie: { id: number; montant_centimes: number }; coffre: EtatCoffre }>;
  sauvegardes(): Promise<{
    dossier: string;
    fichiers: { fichier: string; taille_octets: number; modifie_le: string }[];
  }>;
  lancerSauvegarde(): Promise<{ fichier: string }>;
  exporter(nom: NomExport): Promise<void>;
}

/**
 * Types et erreurs de l'API, décrits une fois pour toutes les écrans.
 */

export interface Parametres {
  /** Quantités laissées dans le tiroir chaque soir, par coupure. */
  fond_composition: Record<number, number>;
  /** Dérivé de la composition, jamais stocké. */
  fond_defaut_centimes: number;
  date_du_jour: string;
}

/** Un agent d'accueil. Le mot de passe ne sort jamais de la base. */
export interface Agent {
  id: number;
  prenom: string;
  nom: string;
  initiales: string;
  actif: boolean;
  cree_le: string;
}

export interface LigneInventaire {
  coupure_centimes: number;
  quantite: number;
  valeur_centimes: number;
}

export interface Cheques {
  /** Conservé pour l'historique déjà écrit ; plus renseigné à la saisie. */
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

/** Une ligne de l'historique du coffre : versement, sortie ou change. */
export interface MouvementCoffre {
  id: number;
  date: string;
  agent: string;
  type: 'versement' | 'sortie' | 'change';
  motif: string;
  comptage_id: number | null;
  cree_le: string;
  cheques_nombre: number;
  cheques_centimes: number;
  detail: { coupure_centimes: number; quantite: number }[];
  /** Effet sur le solde du coffre. Nul pour un change : c'est tout l'intérêt. */
  montant_centimes: number;
  /** Ce qui a bougé malgré tout : un change de 50 € déplace 50 €. */
  entrees_centimes: number;
  sorties_centimes: number;
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
  comptage: LigneJournal & { mouvement_id: number | null; verse_centimes: number };
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

/** Surface de l'API, telle que les écrans la voient. */
export interface ClientApi {
  /** Qui est connecté sur ce poste, ou `null`. */
  session(): Promise<{ agent: Agent | null }>;
  connexion(initiales: string, motDePasse: string): Promise<{ agent: Agent }>;
  deconnexion(): Promise<void>;

  /** Liste accessible avant connexion, pour la page de connexion. */
  agentsPourConnexion(): Promise<{ agents: Agent[] }>;
  agents(): Promise<{ agents: Agent[] }>;
  creerAgent(params: { prenom: string; nom: string }): Promise<{ agent: Agent }>;
  modifierAgent(
    id: number,
    modifications: { prenom?: string; nom?: string; actif?: boolean },
  ): Promise<{ agent: Agent }>;
  /**
   * Suppression définitive, confirmée par le mot de passe de la session qui
   * la demande — pas celui de l'agent supprimé. Les comptages et les
   * mouvements restent : ils portent des initiales, pas une clé étrangère.
   */
  supprimerAgent(id: number, motDePasse: string): Promise<{ agent: Agent }>;
  /**
   * Son propre mot de passe, et uniquement le sien : l'ancien est exigé et le
   * nouveau se tape deux fois.
   */
  changerMotDePasse(
    id: number,
    ancien: string,
    nouveau: string,
    confirmation: string,
  ): Promise<void>;

  parametres(): Promise<Parametres>;
  enregistrerParametres(modifications: {
    fond_composition?: Record<number, number>;
  }): Promise<Omit<Parametres, 'date_du_jour'>>;
  coffre(): Promise<EtatCoffre>;
  journal(): Promise<Journal>;
  comptagesDuJour(date: string): Promise<{ date: string; comptages: ComptageDuJour[] }>;
  validerJournee(corps: {
    date: string;
    agent: string;
    detail: Record<number, number>;
    cb_centimes: number;
    cheques_centimes: number;
  }): Promise<ReponseValidation>;
  sortieCoffre(corps: {
    date: string;
    agent: string;
    motif: string;
    detail: Record<number, number>;
    cheques_centimes: number;
  }): Promise<{ sortie: { id: number; montant_centimes: number }; coffre: EtatCoffre }>;
  /** Faire la monnaie : on donne des coupures, on en reprend pour autant. */
  changeCoffre(corps: {
    date: string;
    agent: string;
    motif: string;
    entrantes: Record<number, number>;
    sortantes: Record<number, number>;
  }): Promise<{ change: { id: number; montant_centimes: number }; coffre: EtatCoffre }>;
  mouvementsCoffre(): Promise<{ mouvements: MouvementCoffre[] }>;
  sauvegardes(): Promise<{
    dossier: string;
    fichiers: { fichier: string; taille_octets: number; modifie_le: string }[];
  }>;
  lancerSauvegarde(): Promise<{ fichier: string }>;
  exporter(nom: NomExport): Promise<void>;
}

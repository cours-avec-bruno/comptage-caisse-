export type TypeCoupure = 'billet' | 'piece';

export interface Coupure {
  /** Valeur faciale en centimes. */
  valeur: number;
  type: TypeCoupure;
  libelle: string;
}

export declare const COUPURES: readonly Coupure[];
export declare const VALEURS_COUPURES: readonly number[];
export declare const COUPURES_ORDRE_SAISIE: readonly Coupure[];

export declare function formaterEuros(centimes: number): string;
export declare function formaterDecimal(centimes: number): string;
export declare function estCoupureValide(valeur: unknown): boolean;

export declare const SEUIL_LIASSE: number;
export declare const COUPURES_TOUJOURS_ROUGE: readonly number[];

export interface LigneCaisse {
  coupure_centimes: number;
  quantite: number;
  valeur_centimes: number;
}

export interface LigneCaisseRouge extends LigneCaisse {
  /** Nombre de liasses de 10 billets. */
  liasses: number;
}

export interface RepartitionCoffre {
  grise: { lignes: LigneCaisse[]; total_centimes: number };
  rouge: {
    lignes: LigneCaisseRouge[];
    especes_centimes: number;
    cheques: { nombre: number; centimes: number };
    total_centimes: number;
  };
  total_centimes: number;
}

export declare function repartirCoffre(
  inventaire: { coupure_centimes: number; quantite: number }[],
  cheques?: { nombre?: number; centimes?: number },
): RepartitionCoffre;

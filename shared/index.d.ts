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

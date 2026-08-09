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

/* --- Statistiques -------------------------------------------------------- */

export interface Periode {
  cle: string;
  libelle: string;
  /** `null` : depuis la première journée validée. */
  jours: number | null;
}

/** Quatre fenêtres, dans cet ordre : 7 jours, 30 jours, 3 mois, tout. */
export declare const PERIODES: readonly [Periode, Periode, Periode, Periode];

export declare function decalerJours(date: string, jours: number): string;
export declare function nombreDeJours(debut: string, fin: string): number;
export declare function lundiDe(date: string): string;
export declare function granularitePour(jours: number): Granularite;
export declare function pourcentsEntiers(valeurs: number[]): number[];

export type Granularite = 'jour' | 'semaine' | 'mois';

export interface CumulRecette {
  especes_centimes: number;
  cb_centimes: number;
  cheques_centimes: number;
  recette_centimes: number;
}

export interface SeauRecette extends CumulRecette {
  cle: string;
  debut: string;
  fin: string;
}

export interface JourneeRecette {
  date: string;
  cb_centimes: number;
  cheques_centimes: number;
  recette_especes_centimes: number;
  recette_centimes: number;
}

export interface Statistiques {
  debut: string;
  fin: string;
  etendue_jours: number;
  granularite: Granularite;
  /** Nombre de journées effectivement validées dans la fenêtre. */
  journees: number;
  totaux: CumulRecette;
  /** Parts entières dont la somme fait exactement 100 (ou 0 si rien). */
  parts: { especes: number; cb: number; cheques: number };
  moyenne_par_journee: number;
  meilleure: { date: string; recette_centimes: number } | null;
  seaux: SeauRecette[];
  precedent: CumulRecette | null;
  evolution_pourcent: number | null;
}

export declare function statistiques(
  lignes: JourneeRecette[],
  aujourdHui: string,
  jours: number | null,
): Statistiques;

import { COUPURES, COUPURES_ORDRE_SAISIE, type Coupure } from 'caisse-partage';

export { COUPURES, COUPURES_ORDRE_SAISIE };
export type { Coupure };

/**
 * Apparence des jetons.
 *
 * Deux règles, non négociables côté design :
 *  - les couleurs sont celles des vrais euros (billets 50 orange / 20 bleu /
 *    10 rouge / 5 gris ; pièces cuivre, or nordique, bimétal) ;
 *  - les tailles sont proportionnelles aux dimensions réelles, y compris
 *    l'inversion 5 cts / 10 cts, qui existe pour de vrai.
 *
 * Le but est qu'on repère sa ligne à l'œil, sans lire l'étiquette.
 */

/** Dimensions réelles des billets, en millimètres. */
const BILLETS_MM: Record<number, { largeur: number; hauteur: number }> = {
  500: { largeur: 120, hauteur: 62 },
  1000: { largeur: 127, hauteur: 67 },
  2000: { largeur: 133, hauteur: 72 },
  5000: { largeur: 140, hauteur: 77 },
};

/** Diamètres réels des pièces, en millimètres. */
const PIECES_MM: Record<number, number> = {
  1: 16.25,
  2: 18.75,
  5: 21.25,
  10: 19.75,
  20: 22.25,
  50: 24.25,
  100: 23.25,
  200: 25.75,
};

// Deux échelles distinctes : à échelle commune, une pièce de 1 centime
// mesurerait 7 px à côté d'un billet de 50. Les proportions restent
// exactes à l'intérieur de chaque famille, ce qui est l'information utile.
const ECHELLE_BILLET = 0.42;
const ECHELLE_PIECE = 1.32;

const CUIVRE = { anneau: '#c07a4b', centre: '#b06c3f', bord: '#8a512c' };
const OR = { anneau: '#d9b451', centre: '#cfa63f', bord: '#a3812c' };
const ARGENT = { anneau: '#c4cad1', centre: '#b7bec6', bord: '#94a0aa' };

export type ApparenceJeton =
  | {
      forme: 'billet';
      largeur: number;
      hauteur: number;
      couleur: string;
      couleurClaire: string;
      bord: string;
    }
  | {
      forme: 'piece';
      diametre: number;
      anneau: string;
      centre: string;
      bord: string;
      bimetal: boolean;
    };

const BILLETS_COULEUR: Record<
  number,
  { couleur: string; couleurClaire: string; bord: string }
> = {
  500: { couleur: '#b9bcb6', couleurClaire: '#d9dbd6', bord: '#8b8f88' }, // gris
  1000: { couleur: '#cf5468', couleurClaire: '#e79aa6', bord: '#a03a4b' }, // rouge
  2000: { couleur: '#4785c0', couleurClaire: '#8fb8dd', bord: '#2f6194' }, // bleu
  5000: { couleur: '#e39a41', couleurClaire: '#f0c085', bord: '#b3742a' }, // orange
};

const PIECES_METAL: Record<number, { anneau: string; centre: string; bord: string; bimetal: boolean }> = {
  1: { ...CUIVRE, bimetal: false },
  2: { ...CUIVRE, bimetal: false },
  5: { ...CUIVRE, bimetal: false },
  10: { ...OR, bimetal: false },
  20: { ...OR, bimetal: false },
  50: { ...OR, bimetal: false },
  // 1 € : anneau argent, cœur or. 2 € : l'inverse.
  100: { anneau: ARGENT.anneau, centre: OR.centre, bord: ARGENT.bord, bimetal: true },
  200: { anneau: OR.anneau, centre: ARGENT.centre, bord: OR.bord, bimetal: true },
};

const APPARENCES = new Map<number, ApparenceJeton>(
  COUPURES.map((coupure) => {
    if (coupure.type === 'billet') {
      const mm = BILLETS_MM[coupure.valeur]!;
      const couleurs = BILLETS_COULEUR[coupure.valeur]!;
      return [
        coupure.valeur,
        {
          forme: 'billet' as const,
          largeur: Math.round(mm.largeur * ECHELLE_BILLET),
          hauteur: Math.round(mm.hauteur * ECHELLE_BILLET),
          ...couleurs,
        },
      ];
    }

    const metal = PIECES_METAL[coupure.valeur]!;
    return [
      coupure.valeur,
      {
        forme: 'piece' as const,
        diametre: Math.round(PIECES_MM[coupure.valeur]! * ECHELLE_PIECE),
        ...metal,
      },
    ];
  }),
);

export function apparence(valeur: number): ApparenceJeton {
  const trouvee = APPARENCES.get(valeur);
  if (!trouvee) throw new Error(`Coupure sans apparence : ${valeur}`);
  return trouvee;
}

/** Libellé court, pour les messages d'erreur : « 50 € », « 20 c ». */
export function libelleCourt(valeur: number): string {
  return valeur >= 100 ? `${valeur / 100} €` : `${valeur} c`;
}

/**
 * Ce qui est gravé sur le jeton lui-même. Sur une pièce de 1 centime, il n'y
 * a la place que pour le chiffre : l'unité se déduit du métal et du voisinage.
 */
export function inscriptionJeton(valeur: number, type: Coupure['type']): string {
  if (type === 'billet') return `${valeur / 100} €`;
  return valeur >= 100 ? `${valeur / 100} €` : String(valeur);
}

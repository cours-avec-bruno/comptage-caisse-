import { apparence, inscriptionJeton } from '../coupures';

interface Props {
  valeur: number;
  /** Taille réduite pour les tableaux denses. */
  compact?: boolean;
}

/**
 * Représentation d'une coupure : vraies couleurs de l'euro, proportions
 * relatives réelles. C'est ce qui permet de repérer sa ligne sans lire
 * l'étiquette.
 */
export function Jeton({ valeur, compact = false }: Props) {
  const forme = apparence(valeur);
  const echelle = compact ? 0.82 : 1;

  if (forme.forme === 'billet') {
    const largeur = forme.largeur * echelle;
    const hauteur = forme.hauteur * echelle;

    return (
      <span
        className="jeton jeton--billet"
        aria-hidden="true"
        style={{
          width: largeur,
          height: hauteur,
          background: `linear-gradient(150deg, ${forme.couleurClaire}, ${forme.couleur} 62%)`,
          borderColor: forme.bord,
          fontSize: Math.round(hauteur * 0.34),
        }}
      >
        <span className="jeton__valeur">{inscriptionJeton(valeur, 'billet')}</span>
      </span>
    );
  }

  const diametre = forme.diametre * echelle;

  return (
    <span
      className="jeton jeton--piece"
      aria-hidden="true"
      style={{
        width: diametre,
        height: diametre,
        background: `radial-gradient(circle at 34% 30%, #ffffff55, transparent 58%), ${forme.anneau}`,
        borderColor: forme.bord,
        // Le texte suit le diamètre : sinon « 50 » déborde d'une pièce de
        // 1 centime, qui est la plus petite de la série.
        fontSize: Math.max(6, Math.round(diametre * 0.32)),
      }}
    >
      {/* Sur une pièce d'un seul métal, ce disque a la couleur de l'anneau :
          il disparaît, et c'est voulu. Seules 1 € et 2 € montrent deux tons. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '21%',
          borderRadius: '50%',
          background: forme.centre,
          boxShadow: forme.bimetal ? `inset 0 0 0 1px ${forme.bord}55` : 'none',
        }}
      />
      <span className="jeton__valeur">{inscriptionJeton(valeur, 'piece')}</span>
    </span>
  );
}

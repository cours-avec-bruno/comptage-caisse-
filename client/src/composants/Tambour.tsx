import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Ressort,
  Velocimetre,
  animer,
  elastique,
  mouvementReduit,
  projeter,
} from '../animation/ressort';

export interface Cran {
  valeur: number;
  libelle: string;
}

interface Props {
  crans: Cran[];
  valeur: number;
  onChange: (valeur: number) => void;
  /** Ce que le tambour règle, pour les lecteurs d'écran. */
  etiquette: string;
  /** Colonne élargie : les mois s'écrivent en toutes lettres. */
  large?: boolean;
}

/** Hauteur d'un cran. Doit rester égale à `--tambour-cran` dans la feuille de style. */
const HAUTEUR = 36;

/** Angle entre deux crans voisins : vingt crans font le tour du cylindre. */
const ANGLE = 18;

/** Rayon qui espace deux crans voisins d'exactement `HAUTEUR` au centre. */
const RAYON = HAUTEUR / 2 / Math.tan((ANGLE * Math.PI) / 360);

/** Au-delà, le cran est passé derrière le cylindre : on ne le dessine plus. */
const PORTEE = Math.floor(90 / ANGLE);

/** Le temps de silence après lequel une molette est considérée comme finie. */
const REPOS_MOLETTE = 140;

const borner = (valeur: number, min: number, max: number) =>
  Math.min(max, Math.max(min, valeur));

/**
 * Une colonne de tambour, comme le sélecteur de date d'iOS.
 *
 * Les crans sont posés sur un cylindre : chacun est tourné autour de l'axe
 * horizontal et poussé vers l'avant du rayon. Ce n'est pas une liste qui
 * défile avec une perspective plaquée dessus — c'est bien un volume, et c'est
 * ce qui fait que les crans du haut et du bas se resserrent tout seuls.
 *
 * Le geste porte de l'élan et se cale sur le cran le plus proche au
 * relâchement. Au-delà du premier et du dernier, il résiste au lieu de
 * bloquer net : un arrêt franc se lit comme un bug, une résistance dit qu'il
 * n'y a rien de plus par là.
 */
export function Tambour({ crans, valeur, onChange, etiquette, large = false }: Props) {
  const cible = Math.max(0, crans.findIndex((cran) => cran.valeur === valeur));

  const [position, setPosition] = useState(cible);
  const positionVive = useRef(cible);

  const ressort = useRef(new Ressort(cible, { amortissement: 0.86, reponse: 0.34 }));
  const velocimetre = useRef(new Velocimetre());
  const geste = useRef<{ pointerId: number; depart: number; origine: number; actif: boolean } | null>(
    null,
  );
  const enVol = useRef<(() => void) | null>(null);
  const molette = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dernier = crans.length - 1;

  const voler = useCallback(() => {
    if (enVol.current) return;
    enVol.current = animer((dt) => {
      const fini = ressort.current.avancer(dt);
      positionVive.current = ressort.current.valeur;
      setPosition(ressort.current.valeur);
      if (fini) enVol.current = null;
      return fini;
    });
  }, []);

  const arreter = useCallback(() => {
    enVol.current?.();
    enVol.current = null;
  }, []);

  /* La valeur du tour précédent. Elle départage les deux raisons qu'a un
     tambour de ne plus être au bon cran. */
  const valeurPosee = useRef(valeur);

  /* Avant la peinture, pas après. Le rendu qui apporte la nouvelle liste de
     crans porte encore l'ancien rang : cette image-là montre le tambour
     décalé d'un cran, voire vide quand la liste s'est beaucoup raccourcie.
     Un `useEffect` la laisserait s'afficher le temps d'une image — c'est
     précisément le sursaut qu'on voit sur les mois. */
  useLayoutEffect(() => {
    if (geste.current) return;
    const memeValeur = valeurPosee.current === valeur;
    valeurPosee.current = valeur;

    if (Math.round(positionVive.current) === cible) return;

    /* La liste s'est allongée ou raccourcie sous le tambour sans que sa
       valeur bouge : la date voisine a resserré ses bornes. Le cran affiché
       reste le bon, seul son rang a changé — on se recale sans tourner. Une
       rotation ici mentirait, personne n'a rien choisi dans cette colonne.

       En plein vol, en revanche, le tambour finit son mouvement : la valeur
       ramenée à sa place par les bornes est le résultat du geste en cours,
       et l'arrêter net se lirait comme un gel. */
    if ((memeValeur && !enVol.current) || mouvementReduit()) {
      arreter();
      positionVive.current = cible;
      setPosition(cible);
      ressort.current.poser(cible);
      return;
    }

    ressort.current.viser(cible);
    voler();
  }, [valeur, cible, arreter, voler]);

  useEffect(() => () => arreter(), [arreter]);

  /** Cale le tambour sur le cran le plus proche, élan compris. */
  const poser = useCallback(
    (vitesse: number) => {
      const projete = positionVive.current + projeter(vitesse);
      const arrivee = borner(Math.round(projete), 0, dernier);
      const cran = crans[arrivee];

      if (mouvementReduit()) {
        positionVive.current = arrivee;
        setPosition(arrivee);
        ressort.current.poser(arrivee);
        if (cran) onChange(cran.valeur);
        return;
      }

      ressort.current.poser(positionVive.current);
      ressort.current.viser(arrivee, vitesse);
      if (cran) onChange(cran.valeur);
      voler();
    },
    [crans, dernier, onChange, voler],
  );

  const surPointerDown = (evenement: React.PointerEvent) => {
    if (evenement.button !== 0) return;
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    arreter();

    velocimetre.current.reinitialiser();
    velocimetre.current.ajouter(-evenement.clientY / HAUTEUR);
    geste.current = {
      pointerId: evenement.pointerId,
      depart: evenement.clientY,
      origine: positionVive.current,
      actif: false,
    };
  };

  const surPointerMove = (evenement: React.PointerEvent) => {
    const enCours = geste.current;
    if (!enCours || enCours.pointerId !== evenement.pointerId) return;

    const delta = evenement.clientY - enCours.depart;
    if (!enCours.actif && Math.abs(delta) < 3) return;
    enCours.actif = true;

    velocimetre.current.ajouter(-evenement.clientY / HAUTEUR);

    // Tirer vers le bas fait remonter la liste : on fait tourner le cylindre,
    // on ne pousse pas un curseur.
    const brut = enCours.origine - delta / HAUTEUR;
    const cale =
      brut < 0
        ? elastique(brut, PORTEE)
        : brut > dernier
          ? dernier + elastique(brut - dernier, PORTEE)
          : brut;

    positionVive.current = cale;
    setPosition(cale);
  };

  const surPointerUp = (evenement: React.PointerEvent) => {
    const enCours = geste.current;
    if (!enCours || enCours.pointerId !== evenement.pointerId) return;
    geste.current = null;
    if (!enCours.actif) return; // un simple clic : traité par le cran lui-même
    poser(velocimetre.current.vitesse());
  };

  /* La molette a besoin d'un écouteur non passif pour ne pas emporter la
     feuille avec elle. React pose les siens en passif : on descend au DOM.

     L'abonnement vaut pour toute la vie du tambour, et lit le reste par
     référence : le refaire à chaque rendu du parent effacerait, avec son
     nettoyage, le calage encore en attente à la fin du geste. */
  const colonne = useRef<HTMLDivElement>(null);
  const vif = useRef({ poser, dernier });
  vif.current = { poser, dernier };

  useEffect(() => {
    const element = colonne.current;
    if (!element) return;

    const surMolette = (evenement: WheelEvent) => {
      evenement.preventDefault();
      arreter();
      if (molette.current) clearTimeout(molette.current);

      positionVive.current = borner(
        positionVive.current + evenement.deltaY / HAUTEUR,
        0,
        vif.current.dernier,
      );
      setPosition(positionVive.current);

      molette.current = setTimeout(() => {
        molette.current = null;
        vif.current.poser(0);
      }, REPOS_MOLETTE);
    };

    element.addEventListener('wheel', surMolette, { passive: false });
    return () => {
      element.removeEventListener('wheel', surMolette);
      if (molette.current) clearTimeout(molette.current);
    };
  }, [arreter]);

  const surTouche = (evenement: React.KeyboardEvent) => {
    const pas =
      evenement.key === 'ArrowUp'
        ? -1
        : evenement.key === 'ArrowDown'
          ? 1
          : evenement.key === 'PageUp'
            ? -5
            : evenement.key === 'PageDown'
              ? 5
              : 0;

    let arrivee: number | null = null;
    if (pas !== 0) arrivee = Math.round(positionVive.current) + pas;
    else if (evenement.key === 'Home') arrivee = 0;
    else if (evenement.key === 'End') arrivee = dernier;
    if (arrivee === null) return;

    evenement.preventDefault();
    const cran = crans[borner(arrivee, 0, dernier)];
    if (cran) onChange(cran.valeur);
  };

  const choisir = (cran: Cran) => {
    // Un cran voisin se prend au clic : viser du doigt est plus court que
    // faire tourner, et le tambour tourne quand même jusque-là.
    if (geste.current) return;
    onChange(cran.valeur);
  };

  const premier = Math.max(0, Math.round(position) - PORTEE);
  const ultime = Math.min(dernier, Math.round(position) + PORTEE);
  const visibles = crans.slice(premier, ultime + 1);

  const courant = crans[borner(Math.round(position), 0, dernier)];

  return (
    <div
      ref={colonne}
      className={`tambour${large ? ' tambour--large' : ''}`}
      role="spinbutton"
      tabIndex={0}
      aria-label={etiquette}
      aria-valuemin={crans[0]?.valeur}
      aria-valuemax={crans[dernier]?.valeur}
      aria-valuenow={courant?.valeur}
      aria-valuetext={courant?.libelle}
      onKeyDown={surTouche}
      onPointerDown={surPointerDown}
      onPointerMove={surPointerMove}
      onPointerUp={surPointerUp}
      onPointerCancel={surPointerUp}
    >
      {visibles.map((cran, rang) => {
        const index = premier + rang;
        const ecart = index - position;
        const angle = ecart * ANGLE;
        const face = Math.cos((angle * Math.PI) / 180);

        return (
          <button
            key={cran.valeur}
            type="button"
            tabIndex={-1}
            className="tambour__cran"
            style={{
              transform: `rotateX(${-angle}deg) translateZ(${RAYON}px)`,
              // Les crans qui s'éloignent s'effacent : la lumière du cylindre
              // les fuit, comme sur une vraie molette.
              opacity: Math.max(0, face * face),
            }}
            onClick={() => choisir(cran)}
          >
            {cran.libelle}
          </button>
        );
      })}
    </div>
  );
}

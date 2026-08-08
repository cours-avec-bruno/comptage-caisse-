import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Velocimetre,
  animer,
  elastique,
  mouvementReduit,
  projeter,
  Ressort,
} from '../animation/ressort';

interface Props {
  titre: string;
  sousTitre?: string;
  onFermer: () => void;
  children: ReactNode;
  pied?: ReactNode;
  /**
   * Élément qui a ouvert la feuille. Elle en émerge et y retourne : quand une
   * chose disparaît d'un côté, on s'attend à la voir revenir du même côté.
   */
  origine?: { x: number; y: number } | null;
}

/** Au-delà de ce déplacement vers le bas, on considère l'intention de fermer. */
const SEUIL_FERMETURE = 120;
/** Un geste plus rapide que ça ferme, quelle que soit la distance parcourue. */
const VITESSE_FERMETURE = 500;
/** Hystérésis : en deçà, c'est un clic, pas un glissement. */
const SEUIL_GESTE = 10;

export function Modale({ titre, sousTitre, onFermer, children, pied, origine }: Props) {
  const feuille = useRef<HTMLDivElement>(null);
  /* Le voile a son propre calque : porté par le conteneur, son opacité
     s'appliquerait aussi à la feuille, qui se délaverait avec lui. */
  const voile = useRef<HTMLButtonElement>(null);

  /* Deux ressorts indépendants : l'apparition (matière + échelle) et le
     déplacement vertical du geste. Un seul ressort sur une distance 2D se
     désynchronise dès que les deux axes n'ont pas la même vitesse. */
  const apparition = useRef(new Ressort(0, { amortissement: 1, reponse: 0.38 }));
  const glissement = useRef(new Ressort(0, { amortissement: 0.8, reponse: 0.3 }));

  const ferme = useRef(false);
  const velocimetre = useRef(new Velocimetre());
  const geste = useRef<{ pointerId: number; depart: number; offset: number; actif: boolean } | null>(
    null,
  );

  /** Écrit l'état des deux ressorts dans le DOM. transform + opacity seuls. */
  const peindre = useCallback(() => {
    const boite = feuille.current;
    const fondu = voile.current;
    if (!boite || !fondu) return;

    const a = apparition.current.valeur; // 0 = absente, 1 = posée
    const y = glissement.current.valeur;

    // La matière arrive : le flou et l'échelle montent ensemble, pour qu'elle
    // se lise comme une surface réelle qui se forme, pas comme une image qui
    // apparaît en fondu.
    const echelle = 0.92 + 0.08 * a;
    boite.style.transform = `translate3d(0, ${y}px, 0) scale(${echelle})`;
    boite.style.opacity = String(Math.min(1, a * 1.4));
    boite.style.backdropFilter = `blur(${(a * 30).toFixed(1)}px) saturate(180%)`;

    // Le voile s'estompe à mesure qu'on tire la feuille vers le bas : le
    // mouvement intermédiaire annonce où l'on va.
    const progression = Math.max(0, 1 - y / 400);
    fondu.style.opacity = String(a * progression);
  }, []);

  const fermerUneFois = useCallback(() => {
    if (ferme.current) return;
    ferme.current = true;
    onFermer();
  }, [onFermer]);

  /** Referme en animant : la sortie emprunte le chemin de l'entrée. */
  const refermer = useCallback(
    (vitesse = 0) => {
      if (mouvementReduit()) {
        fermerUneFois();
        return;
      }
      apparition.current.viser(0);
      glissement.current.viser(
        (feuille.current?.offsetHeight ?? 400) + 80,
        vitesse || undefined,
      );
      animer((dt) => {
        const a = apparition.current.avancer(dt);
        const g = glissement.current.avancer(dt);
        peindre();
        if (a && g) {
          fermerUneFois();
          return true;
        }
        return false;
      });
    },
    [fermerUneFois, peindre],
  );

  /* --- Entrée --- */
  useEffect(() => {
    const boite = feuille.current;
    if (!boite) return;

    if (origine) {
      // La feuille émerge du bouton qui l'a ouverte : l'ancrage rend le lien
      // entre le déclencheur et le contenu évident.
      const rect = boite.getBoundingClientRect();
      boite.style.transformOrigin = `${origine.x - rect.left}px ${origine.y - rect.top}px`;
    }

    if (mouvementReduit()) {
      apparition.current.poser(1);
      peindre();
      return;
    }

    apparition.current.poser(0);
    glissement.current.poser(24);
    peindre();
    apparition.current.viser(1);
    glissement.current.viser(0);

    return animer((dt) => {
      const a = apparition.current.avancer(dt);
      const g = glissement.current.avancer(dt);
      peindre();
      return a && g;
    });
  }, [origine, peindre]);

  /* --- Échap et défilement du fond --- */
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') refermer();
    };
    document.addEventListener('keydown', surTouche);
    const defilementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Repousse le fond : une tâche modale ferme le passage, l'interface le dit
    // en assombrissant et en éloignant ce qui est derrière.
    document.body.classList.add('feuille-ouverte');

    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = defilementInitial;
      document.body.classList.remove('feuille-ouverte');
    };
  }, [refermer]);

  /* --- Geste : la feuille se saisit et se redirige à tout instant --- */

  const surPointerDown = (evenement: React.PointerEvent) => {
    if (evenement.button !== 0) return;
    if (!feuille.current) return;

    // On capture sur l'élément qui porte les gestionnaires, pas sur la
    // feuille : la capture redirige les événements vers l'élément capturant,
    // et ils ne redescendent pas vers ses enfants.
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    velocimetre.current.reinitialiser();
    velocimetre.current.ajouter(evenement.clientY);

    geste.current = {
      pointerId: evenement.pointerId,
      depart: evenement.clientY,
      // On respecte l'endroit exact où la feuille a été attrapée : la
      // recentrer sur le pointeur casserait l'illusion immédiatement.
      offset: glissement.current.valeur,
      actif: false,
    };
    // La feuille est peut-être en plein vol : on la fige là où elle est
    // réellement à l'écran, pas là où elle voulait aller.
    glissement.current.vitesse = 0;
  };

  const surPointerMove = (evenement: React.PointerEvent) => {
    const enCours = geste.current;
    if (!enCours || enCours.pointerId !== evenement.pointerId) return;

    const delta = evenement.clientY - enCours.depart;
    if (!enCours.actif && Math.abs(delta) < SEUIL_GESTE) return;
    enCours.actif = true;

    velocimetre.current.ajouter(evenement.clientY);

    const brut = enCours.offset + delta;
    // Vers le haut il n'y a rien : on résiste progressivement au lieu de
    // bloquer net. Un arrêt franc se lit comme un gel.
    const y =
      brut < 0
        ? elastique(brut, feuille.current?.offsetHeight ?? 400)
        : brut;

    glissement.current.poser(y);
    peindre();
  };

  const surPointerUp = (evenement: React.PointerEvent) => {
    const enCours = geste.current;
    if (!enCours || enCours.pointerId !== evenement.pointerId) return;
    geste.current = null;

    if (!enCours.actif) return; // simple clic sur la poignée

    const vitesse = velocimetre.current.vitesse();
    const position = glissement.current.valeur;
    // On ne décide pas depuis le point de relâchement mais depuis le point
    // où le geste allait finir : c'est ce qui fait qu'un lancer lance.
    const projection = position + projeter(vitesse);

    if (vitesse > VITESSE_FERMETURE || projection > SEUIL_FERMETURE) {
      refermer(vitesse);
      return;
    }

    // Retour en place, en héritant de la vitesse du doigt : aucune couture
    // entre le geste et l'animation.
    glissement.current.viser(0, vitesse);
    animer((dt) => {
      const fini = glissement.current.avancer(dt);
      peindre();
      return fini;
    });
  };

  return createPortal(
    <div className="voile">
      <button
        type="button"
        className="voile__fond"
        aria-label="Fermer"
        tabIndex={-1}
        ref={voile}
        onClick={() => refermer()}
      />

      <div
        className="feuille"
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        ref={feuille}
      >
        <div
          className="feuille__prise"
          onPointerDown={surPointerDown}
          onPointerMove={surPointerMove}
          onPointerUp={surPointerUp}
          onPointerCancel={surPointerUp}
        >
          <span className="feuille__poignee" aria-hidden="true" />

          <div className="feuille__entete">
            <div>
              <h2>{titre}</h2>
              {sousTitre && <p>{sousTitre}</p>}
            </div>
            <button
              type="button"
              className="bouton bouton--discret"
              onClick={() => refermer()}
            >
              Fermer
            </button>
          </div>
        </div>

        <div className="feuille__corps">{children}</div>
        {pied && <div className="feuille__pied">{pied}</div>}
      </div>
    </div>,
    document.body,
  );
}

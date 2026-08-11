import { useCallback, useEffect, useRef, useState } from 'react';
import { decalerJours } from 'caisse-partage';
import {
  Ressort,
  Velocimetre,
  animer,
  elastique,
  mouvementReduit,
  projeter,
} from '../animation/ressort';
import { dateCourte } from '../format';

interface Props {
  /** Longueur de la plage, en jours, bornes comprises. */
  jours: number;
  min: number;
  max: number;
  /** Dernier jour de la plage : toujours aujourd'hui. */
  fin: string;
  onChange: (jours: number) => void;
}

/** Largeur d'une journée sur la règle. */
const PAS = 14;

/** Combien de journées dessiner de part et d'autre du repère. */
const MARGE = 6;

const MOIS_COURTS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/** Jour de la semaine d'une date « AAAA-MM-JJ », 1 = lundi. */
function jourSemaine(iso: string): number {
  const [annee = 0, mois = 1, jour = 1] = iso.split('-').map(Number);
  return ((new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() + 6) % 7) + 1;
}

/** « 2026-08-03 » -> « 3 août ». Pour les repères de semaine. */
function jourEtMois(iso: string): string {
  const [, mois = '', jour = ''] = iso.split('-');
  return `${Number(jour)} ${MOIS_COURTS[Number(mois) - 1] ?? ''}`;
}

/**
 * Règle glissante pour choisir la plage des statistiques.
 *
 * On ne choisit pas un nombre dans une liste : on remonte le temps à la main.
 * Le repère central se pose sur le premier jour de la plage, le dernier étant
 * toujours aujourd'hui, et la zone teintée montre ce qui est compté.
 *
 * Le geste a de l'inertie et se cale sur la journée la plus proche au
 * relâchement : on lance la règle, elle finit sur un jour entier. Au-delà des
 * bornes elle résiste au lieu de bloquer — un arrêt net se lit comme un bug,
 * une résistance se lit comme « il n'y a rien de plus par là ».
 */
export function RoulettePlage({ jours, min, max, fin, onChange }: Props) {
  const piste = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(560);

  /* Décalage du premier jour de la plage, en journées avant aujourd'hui.
     Fractionnaire pendant le geste, entier au repos. */
  const [decalage, setDecalage] = useState(jours - 1);
  const decalageVif = useRef(jours - 1);

  const ressort = useRef(new Ressort(jours - 1, { amortissement: 0.85, reponse: 0.32 }));
  const velocimetre = useRef(new Velocimetre());
  const geste = useRef<{ pointerId: number; depart: number; origine: number } | null>(
    null,
  );
  const enVol = useRef<(() => void) | null>(null);

  const minDecalage = min - 1;
  const maxDecalage = max - 1;

  /* La valeur peut changer de l'extérieur (les raccourcis de période) : la
     règle y va en glissant plutôt que d'y sauter. */
  useEffect(() => {
    const vise = jours - 1;
    if (Math.round(decalageVif.current) === vise) return;

    if (mouvementReduit()) {
      decalageVif.current = vise;
      setDecalage(vise);
      ressort.current.poser(vise);
      return;
    }

    ressort.current.viser(vise);
    if (enVol.current) return;
    enVol.current = animer((dt) => {
      const fini = ressort.current.avancer(dt);
      decalageVif.current = ressort.current.valeur;
      setDecalage(ressort.current.valeur);
      if (fini) enVol.current = null;
      return fini;
    });
  }, [jours]);

  useEffect(() => () => enVol.current?.(), []);

  useEffect(() => {
    const element = piste.current;
    if (!element || typeof ResizeObserver !== 'function') return;
    const observateur = new ResizeObserver(([entree]) => {
      if (entree) setLargeur(entree.contentRect.width);
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  /** Cale la règle sur la journée la plus proche, en tenant compte de l'élan. */
  const poser = useCallback(
    (vitesseJoursParSeconde: number) => {
      const projete = decalageVif.current + projeter(vitesseJoursParSeconde);
      const cible = Math.min(maxDecalage, Math.max(minDecalage, Math.round(projete)));

      if (mouvementReduit()) {
        decalageVif.current = cible;
        setDecalage(cible);
        ressort.current.poser(cible);
        onChange(cible + 1);
        return;
      }

      ressort.current.poser(decalageVif.current);
      ressort.current.viser(cible, vitesseJoursParSeconde);
      onChange(cible + 1);

      if (enVol.current) return;
      enVol.current = animer((dt) => {
        const fini = ressort.current.avancer(dt);
        decalageVif.current = ressort.current.valeur;
        setDecalage(ressort.current.valeur);
        if (fini) enVol.current = null;
        return fini;
      });
    },
    [maxDecalage, minDecalage, onChange],
  );

  const surPointerDown = (evenement: React.PointerEvent) => {
    if (evenement.button !== 0) return;
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    enVol.current?.();
    enVol.current = null;

    velocimetre.current.reinitialiser();
    velocimetre.current.ajouter(evenement.clientX / PAS);
    geste.current = {
      pointerId: evenement.pointerId,
      depart: evenement.clientX,
      origine: decalageVif.current,
    };
  };

  const surPointerMove = (evenement: React.PointerEvent) => {
    const enCours = geste.current;
    if (!enCours || enCours.pointerId !== evenement.pointerId) return;

    velocimetre.current.ajouter(evenement.clientX / PAS);

    // Tirer la règle vers la droite fait remonter le temps : le passé arrive
    // par la gauche, comme sur une frise qu'on fait défiler.
    const brut = enCours.origine + (evenement.clientX - enCours.depart) / PAS;
    const borne =
      brut < minDecalage
        ? minDecalage + elastique(brut - minDecalage, largeur / PAS)
        : brut > maxDecalage
          ? maxDecalage + elastique(brut - maxDecalage, largeur / PAS)
          : brut;

    decalageVif.current = borne;
    setDecalage(borne);
  };

  const surPointerUp = (evenement: React.PointerEvent) => {
    const enCours = geste.current;
    if (!enCours || enCours.pointerId !== evenement.pointerId) return;
    geste.current = null;
    poser(velocimetre.current.vitesse());
  };

  const surTouche = (evenement: React.KeyboardEvent) => {
    const pas =
      evenement.key === 'ArrowLeft'
        ? -1
        : evenement.key === 'ArrowRight'
          ? 1
          : evenement.key === 'PageDown'
            ? -7
            : evenement.key === 'PageUp'
              ? 7
              : 0;

    let cible: number | null = null;
    if (pas !== 0) cible = Math.round(decalageVif.current) + pas;
    else if (evenement.key === 'Home') cible = minDecalage;
    else if (evenement.key === 'End') cible = maxDecalage;
    if (cible === null) return;

    evenement.preventDefault();
    onChange(Math.min(maxDecalage, Math.max(minDecalage, cible)) + 1);
  };

  /* Ne dessiner que ce qui se voit : la règle peut couvrir des années. */
  const portee = Math.ceil(largeur / 2 / PAS) + MARGE;
  const premier = Math.max(0, Math.floor(decalage) - portee);
  const dernier = Math.ceil(decalage) + portee;

  const graduations = [];
  for (let d = premier; d <= dernier; d += 1) {
    const date = decalerJours(fin, -d);
    const lundi = jourSemaine(date) === 1;
    graduations.push({ d, date, lundi, x: largeur / 2 + (decalage - d) * PAS });
  }

  const debut = decalerJours(fin, -Math.round(decalage));
  const xAujourdHui = largeur / 2 + decalage * PAS;

  return (
    <div className="roulette">
      <div className="roulette__lecture">
        <strong className="roulette__jours">
          {Math.round(decalage) + 1} jour{Math.round(decalage) > 0 ? 's' : ''}
        </strong>
        <span className="roulette__plage">
          du {dateCourte(debut)} au {dateCourte(fin)}
        </span>
      </div>

      <div
        ref={piste}
        className="roulette__piste"
        role="slider"
        tabIndex={0}
        aria-label="Longueur de la plage, en jours"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(decalage) + 1}
        aria-valuetext={`${Math.round(decalage) + 1} jours, du ${dateCourte(debut)} au ${dateCourte(fin)}`}
        onKeyDown={surTouche}
        onPointerDown={surPointerDown}
        onPointerMove={surPointerMove}
        onPointerUp={surPointerUp}
        onPointerCancel={surPointerUp}
      >
        {/* Ce qui est compté : du repère jusqu'à aujourd'hui. */}
        <span
          className="roulette__zone"
          style={{ left: `${largeur / 2}px`, width: `${Math.max(0, xAujourdHui - largeur / 2)}px` }}
          aria-hidden="true"
        />

        {graduations.map(({ d, date, lundi, x }) => (
          <span
            key={d}
            className={`roulette__trait${lundi ? ' roulette__trait--semaine' : ''}${
              d === 0 ? ' roulette__trait--aujourdhui' : ''
            }`}
            style={{ left: `${x}px` }}
            aria-hidden="true"
          >
            {lundi && <em className="roulette__date">{jourEtMois(date)}</em>}
          </span>
        ))}

        <span className="roulette__repere" aria-hidden="true" />
      </div>
    </div>
  );
}

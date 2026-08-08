import { useEffect, useRef } from 'react';
import { Ressort, animer, mouvementReduit } from '../animation/ressort';
import { formaterEuros } from '../format';

interface Props {
  centimes: number;
  className?: string;
}

/**
 * Montant qui réagit quand il change.
 *
 * Le chiffre, lui, change immédiatement : c'est la donnée, elle ne se fait
 * pas attendre. Ce qui est animé, c'est un ressort d'échelle qu'on pousse
 * d'une impulsion à chaque changement.
 *
 * Une image-clé CSS ne conviendrait pas ici : un agent qui saisit vite change
 * la valeur plus souvent que l'animation ne dure, et une image-clé
 * redémarrerait à zéro à chaque frappe — une saccade. Le ressort, lui, reçoit
 * l'impulsion sur son état courant et accumule : plus la saisie est rapide,
 * plus le mouvement reste continu.
 */
export function MontantAnime({ centimes, className = '' }: Props) {
  const boite = useRef<HTMLSpanElement>(null);
  const ressort = useRef(
    // Léger rebond : le geste — une frappe — porte de l'élan.
    new Ressort(1, { amortissement: 0.72, reponse: 0.32, precision: 0.0005 }),
  );
  const precedent = useRef(centimes);
  const enVol = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (precedent.current === centimes) return;
    const monte = centimes > precedent.current;
    precedent.current = centimes;

    if (mouvementReduit() || !boite.current) return;

    // L'impulsion pointe dans le sens du changement : le mouvement
    // intermédiaire annonce ce qui vient de se passer.
    ressort.current.impulsion(monte ? 0.85 : -0.85);
    ressort.current.viser(1);

    if (enVol.current) return; // déjà en mouvement : il absorbe l'impulsion
    enVol.current = animer((dt) => {
      const fini = ressort.current.avancer(dt);
      const element = boite.current;
      if (element) {
        const echelle = ressort.current.valeur;
        element.style.transform = `scale(${echelle.toFixed(4)})`;
      }
      if (fini) {
        enVol.current = null;
        if (element) element.style.transform = '';
      }
      return fini;
    });
  }, [centimes]);

  useEffect(() => () => enVol.current?.(), []);

  return (
    <span ref={boite} className={`montant-vedette montant ${className}`}>
      {formaterEuros(centimes)}
    </span>
  );
}

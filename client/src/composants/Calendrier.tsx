import { useEffect, useRef, useState } from 'react';
import { decalerJours } from 'caisse-partage';
import { MOIS } from '../format';

interface Props {
  /** Date choisie, `null` tant que rien n'est choisi. */
  valeur: string | null;
  /** Premier jour proposable, bornes comprises. */
  min: string;
  /** Dernier jour proposable. */
  max: string;
  /** Plage déjà connue : ses jours sont teintés pour qu'on la voie se former. */
  plage?: { debut: string; fin: string } | null;
  /** Ce que le calendrier choisit, pour les lecteurs d'écran. */
  etiquette: string;
  onChange: (date: string) => void;
}

/** Lundi en premier : c'est le repère d'un service, et celui des semaines du journal. */
const JOURS_COURTS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const JOURS_LONGS = [
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
];

const decouper = (iso: string) => iso.split('-').map(Number) as [number, number, number];

/** Longueur d'un mois, bissextiles comprises. */
const joursDuMois = (annee: number, mois: number) =>
  new Date(Date.UTC(annee, mois, 0)).getUTCDate();

/** Jour de la semaine, 0 = lundi. En UTC : l'application ne connaît que des dates civiles. */
function jourSemaine(iso: string): number {
  const [annee, mois, jour] = decouper(iso);
  return (new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() + 6) % 7;
}

const borner = (date: string, min: string, max: string) =>
  date < min ? min : date > max ? max : date;

/** « 2026-07 » -> « Juillet 2026 ». */
function titreDuMois(mois: string): string {
  const [annee, numero] = mois.split('-').map(Number);
  const nom = MOIS[(numero ?? 1) - 1] ?? '';
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${annee}`;
}

/**
 * Un calendrier pour choisir un jour.
 *
 * On voit le mois en entier, donc on voit les week-ends, les jours de
 * fermeture et la place du jour choisi dans la semaine — ce qu'une liste de
 * nombres ne montre jamais. Les jours hors bornes sont là mais éteints : leur
 * absence poserait la question de savoir où ils sont passés.
 *
 * La grille se parcourt aussi aux flèches, `Page` pour changer de mois : en
 * fin de service, la main est sur le clavier, pas sur la souris.
 */
export function Calendrier({ valeur, min, max, plage, etiquette, onChange }: Props) {
  const ancre = valeur ?? borner(max, min, max);
  const [mois, setMois] = useState(ancre.slice(0, 7));
  const [focalise, setFocalise] = useState(ancre);

  /* Le calendrier suit la valeur quand elle change de l'extérieur — passer de
     l'étape « début » à l'étape « fin », par exemple. */
  useEffect(() => {
    setMois(ancre.slice(0, 7));
    setFocalise(ancre);
  }, [ancre]);

  /* Le focus ne se déplace au clavier que si la grille l'avait déjà : sinon
     ouvrir la feuille volerait le focus au premier rendu. */
  const grille = useRef<HTMLTableSectionElement>(null);
  const suitLeFocus = useRef(false);
  useEffect(() => {
    if (!suitLeFocus.current) return;
    grille.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focalise}"]`)
      ?.focus();
  }, [focalise]);

  const moisMin = min.slice(0, 7);
  const moisMax = max.slice(0, 7);
  const [annee, numero] = decouper(`${mois}-01`);

  const allerAu = (date: string) => {
    const cale = borner(date, min, max);
    setFocalise(cale);
    setMois(cale.slice(0, 7));
  };

  const changerDeMois = (pas: number) => {
    const suivant = new Date(Date.UTC(annee, numero - 1 + pas, 1));
    const cible = suivant.toISOString().slice(0, 7);
    const jour = Math.min(
      decouper(focalise)[2],
      joursDuMois(suivant.getUTCFullYear(), suivant.getUTCMonth() + 1),
    );
    allerAu(`${cible}-${String(jour).padStart(2, '0')}`);
  };

  const surTouche = (evenement: React.KeyboardEvent) => {
    const pas =
      evenement.key === 'ArrowLeft'
        ? -1
        : evenement.key === 'ArrowRight'
          ? 1
          : evenement.key === 'ArrowUp'
            ? -7
            : evenement.key === 'ArrowDown'
              ? 7
              : 0;

    if (pas !== 0) {
      evenement.preventDefault();
      allerAu(decalerJours(focalise, pas));
      return;
    }
    if (evenement.key === 'PageUp' || evenement.key === 'PageDown') {
      evenement.preventDefault();
      changerDeMois(evenement.key === 'PageUp' ? -1 : 1);
      return;
    }
    if (evenement.key === 'Home' || evenement.key === 'End') {
      evenement.preventDefault();
      allerAu(evenement.key === 'Home' ? min : max);
    }
  };

  /* Six lignes de sept jours, débordements des mois voisins compris : une
     grille qui change de hauteur d'un mois à l'autre fait sauter le bouton
     qu'on s'apprêtait à cliquer. */
  const premier = `${mois}-01`;
  const depart = decalerJours(premier, -jourSemaine(premier));
  const semaines = Array.from({ length: 6 }, (_, ligne) =>
    Array.from({ length: 7 }, (_, colonne) => decalerJours(depart, ligne * 7 + colonne)),
  );

  return (
    <div className="calendrier">
      <div className="calendrier__barre">
        <button
          type="button"
          className="calendrier__fleche"
          aria-label="Mois précédent"
          disabled={mois <= moisMin}
          onClick={() => changerDeMois(-1)}
        >
          ‹
        </button>
        <strong className="calendrier__mois" aria-live="polite">
          {titreDuMois(mois)}
        </strong>
        <button
          type="button"
          className="calendrier__fleche"
          aria-label="Mois suivant"
          disabled={mois >= moisMax}
          onClick={() => changerDeMois(1)}
        >
          ›
        </button>
      </div>

      <table className="calendrier__grille" role="grid" aria-label={etiquette}>
        <thead>
          <tr>
            {JOURS_COURTS.map((court, index) => (
              <th key={court} scope="col">
                <abbr title={JOURS_LONGS[index]}>{court}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          ref={grille}
          onKeyDown={surTouche}
          onFocus={() => {
            suitLeFocus.current = true;
          }}
          onBlur={() => {
            suitLeFocus.current = false;
          }}
        >
          {semaines.map((semaine) => (
            <tr key={semaine[0]}>
              {semaine.map((date) => {
                const horsBornes = date < min || date > max;
                const autreMois = date.slice(0, 7) !== mois;
                const choisi = date === valeur;
                const dedans =
                  !!plage && date >= plage.debut && date <= plage.fin && !choisi;

                return (
                  <td key={date}>
                    <button
                      type="button"
                      data-date={date}
                      className={`calendrier__jour${autreMois ? ' calendrier__jour--voisin' : ''}${
                        choisi ? ' calendrier__jour--choisi' : ''
                      }${dedans ? ' calendrier__jour--dedans' : ''}`}
                      // Un seul jour est atteignable au tabulateur : la grille
                      // se parcourt aux flèches, pas en quarante tabulations.
                      tabIndex={date === focalise ? 0 : -1}
                      disabled={horsBornes}
                      aria-pressed={choisi}
                      aria-label={`${JOURS_LONGS[jourSemaine(date)]} ${decouper(date)[2]} ${
                        MOIS[decouper(date)[1] - 1]
                      } ${decouper(date)[0]}`}
                      onClick={() => {
                        setFocalise(date);
                        onChange(date);
                      }}
                    >
                      {decouper(date)[2]}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

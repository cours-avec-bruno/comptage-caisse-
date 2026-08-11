import { useState } from 'react';
import { nombreDeJours } from 'caisse-partage';
import { Modale } from './Modale';
import { Tambour, type Cran } from './Tambour';
import { MOIS, dateCourte } from '../format';

interface Props {
  debut: string;
  fin: string;
  /** Première journée qu'il vaut la peine de proposer, en général la plus ancienne validée. */
  min: string;
  /** Dernier jour proposable : toujours aujourd'hui. */
  max: string;
  origine?: { x: number; y: number } | null;
  onFermer: () => void;
  onValider: (debut: string, fin: string) => void;
}

const decouper = (iso: string) => iso.split('-').map(Number) as [number, number, number];

const assembler = (annee: number, mois: number, jour: number) =>
  `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;

/** Longueur d'un mois, bissextiles comprises. */
const joursDuMois = (annee: number, mois: number) =>
  new Date(Date.UTC(annee, mois, 0)).getUTCDate();

const borner = (valeur: number, min: number, max: number) =>
  Math.min(max, Math.max(min, valeur));

const suite = (de: number, a: number, libelle: (valeur: number) => string): Cran[] => {
  const crans: Cran[] = [];
  for (let valeur = de; valeur <= a; valeur += 1) crans.push({ valeur, libelle: libelle(valeur) });
  return crans;
};

/** Les bornes de chaque colonne, une fois les colonnes de gauche fixées. */
function limites(annee: number, mois: number, min: string, max: string) {
  const [anneeMin, moisMin, jourMin] = decouper(min);
  const [anneeMax, moisMax, jourMax] = decouper(max);

  const moisBas = annee === anneeMin ? moisMin : 1;
  const moisHaut = annee === anneeMax ? moisMax : 12;
  const moisCale = borner(mois, moisBas, moisHaut);

  return {
    anneeMin,
    anneeMax,
    moisBas,
    moisHaut,
    moisCale,
    jourBas: annee === anneeMin && moisCale === moisMin ? jourMin : 1,
    jourHaut:
      annee === anneeMax && moisCale === moisMax ? jourMax : joursDuMois(annee, moisCale),
  };
}

/**
 * Ramène une date dans les bornes en calant colonne par colonne, de la plus
 * large à la plus fine. Changer d'année ne doit jamais produire un 31 février
 * ni une date hors de l'historique : c'est ici que ça se rattrape.
 */
function caler(annee: number, mois: number, jour: number, min: string, max: string): string {
  const anneeCale = borner(annee, decouper(min)[0], decouper(max)[0]);
  const bornes = limites(anneeCale, mois, min, max);
  return assembler(
    anneeCale,
    bornes.moisCale,
    borner(jour, bornes.jourBas, bornes.jourHaut),
  );
}

interface PropsDate {
  titre: string;
  valeur: string;
  min: string;
  max: string;
  onChange: (valeur: string) => void;
}

/** Trois tambours pour une date : le jour, le mois, l'année. */
function ChoixDate({ titre, valeur, min, max, onChange }: PropsDate) {
  const [annee, mois, jour] = decouper(valeur);
  const bornes = limites(annee, mois, min, max);

  return (
    <section className="plage__date">
      <span className="etiquette">{titre}</span>

      <div className="plage__tambours">
        <Tambour
          etiquette={`Jour, ${titre.toLowerCase()}`}
          crans={suite(bornes.jourBas, bornes.jourHaut, String)}
          valeur={jour}
          onChange={(choix) => onChange(caler(annee, mois, choix, min, max))}
        />
        <Tambour
          large
          etiquette={`Mois, ${titre.toLowerCase()}`}
          crans={suite(bornes.moisBas, bornes.moisHaut, (m) => MOIS[m - 1] ?? String(m))}
          valeur={bornes.moisCale}
          onChange={(choix) => onChange(caler(annee, choix, jour, min, max))}
        />
        <Tambour
          etiquette={`Année, ${titre.toLowerCase()}`}
          crans={suite(bornes.anneeMin, bornes.anneeMax, String)}
          valeur={annee}
          onChange={(choix) => onChange(caler(choix, mois, jour, min, max))}
        />
      </div>
    </section>
  );
}

/**
 * Choisir la plage des statistiques à la main.
 *
 * Deux dates, six tambours. Les bornes s'emboîtent : le début ne peut pas
 * dépasser la fin, la fin ne peut pas descendre sous le début ni aller
 * au-delà d'aujourd'hui. Aucune combinaison impossible n'est atteignable,
 * donc aucun message d'erreur à lire — le tambour s'arrête, c'est tout.
 */
export function ModalePlage({ debut, fin, min, max, origine, onFermer, onValider }: Props) {
  const [choix, setChoix] = useState({ debut, fin });
  const jours = nombreDeJours(choix.debut, choix.fin);

  return (
    <Modale
      titre="Choisir la période"
      sousTitre="Les statistiques se recalculent sur ces deux dates."
      origine={origine}
      onFermer={onFermer}
      pied={
        <>
          <span className="feuille__total">
            <strong>
              {jours} jour{jours > 1 ? 's' : ''}
            </strong>{' '}
            <span className="plage__resume">
              du {dateCourte(choix.debut)} au {dateCourte(choix.fin)}
            </span>
          </span>
          <div className="feuille__actions">
            <button type="button" className="bouton" onClick={onFermer}>
              Annuler
            </button>
            <button
              type="button"
              className="bouton bouton--principal"
              onClick={() => onValider(choix.debut, choix.fin)}
            >
              Afficher
            </button>
          </div>
        </>
      }
    >
      <div className="plage">
        <ChoixDate
          titre="Début"
          valeur={choix.debut}
          min={min}
          max={choix.fin}
          onChange={(valeur) => setChoix((actuel) => ({ ...actuel, debut: valeur }))}
        />
        <ChoixDate
          titre="Fin"
          valeur={choix.fin}
          min={choix.debut}
          max={max}
          onChange={(valeur) => setChoix((actuel) => ({ ...actuel, fin: valeur }))}
        />
      </div>
    </Modale>
  );
}

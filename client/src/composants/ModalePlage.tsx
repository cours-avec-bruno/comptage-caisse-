import { useState } from 'react';
import { nombreDeJours } from 'caisse-partage';
import { Calendrier } from './Calendrier';
import { Modale } from './Modale';
import { dateCourte, dateLongue } from '../format';

interface Props {
  debut: string;
  fin: string;
  /** Première journée qu'il vaut la peine de proposer : la plus ancienne validée. */
  min: string;
  /** Dernier jour proposable : toujours aujourd'hui. */
  max: string;
  origine?: { x: number; y: number } | null;
  onFermer: () => void;
  onValider: (debut: string, fin: string) => void;
}

type Etape = 'debut' | 'fin';

/** « 13/07/2026 » -> « 2026-07-13 », et rien du tout si la saisie ne tient pas debout. */
function dateDepuisSaisie(saisie: string): string | null {
  const propre = saisie.trim().replace(/[.\-\s]/g, '/');
  const correspondance = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(propre);
  if (!correspondance) return null;

  const [, jour = '', mois = '', annee = ''] = correspondance;
  const iso = `${annee}-${mois.padStart(2, '0')}-${jour.padStart(2, '0')}`;
  // Le 31 février se réécrirait tout seul en 3 mars : on refuse plutôt que de
  // décaler en silence une date que l'agent croit avoir tapée.
  const point = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
  return point.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * Choisir la plage des statistiques, en deux temps : le début, puis la fin.
 *
 * Une seule question à la fois. L'étape franchie reste affichée et se reprend
 * d'un clic, donc on se corrige sans tout recommencer ; et pendant le choix de
 * la fin, les jours déjà compris sont teintés : on voit la période se former
 * au lieu de l'imaginer.
 *
 * Le champ de saisie double le calendrier pour qui connaît sa date : la taper
 * est plus court que de remonter huit mois à la flèche.
 */
export function ModalePlage({ debut, fin, min, max, origine, onFermer, onValider }: Props) {
  const [etape, setEtape] = useState<Etape>('debut');
  const [choixDebut, setChoixDebut] = useState<string | null>(debut);
  const [choixFin, setChoixFin] = useState<string | null>(fin);
  const [saisie, setSaisie] = useState('');
  const [saisieFautive, setSaisieFautive] = useState(false);

  const surDebut = etape === 'debut';
  const valeur = surDebut ? choixDebut : choixFin;
  const borneBasse = surDebut ? min : (choixDebut ?? min);

  const changerEtape = (suivante: Etape) => {
    setEtape(suivante);
    setSaisie('');
    setSaisieFautive(false);
  };

  const choisir = (date: string) => {
    if (surDebut) {
      setChoixDebut(date);
      // Une fin antérieure au nouveau début ne veut plus rien dire : on la
      // repose plutôt que de la traîner, et l'étape suivante la redemande.
      if (choixFin && choixFin < date) setChoixFin(null);
      changerEtape('fin');
      return;
    }
    setChoixFin(date);
    setSaisie('');
    setSaisieFautive(false);
  };

  const validerLaSaisie = () => {
    if (saisie.trim() === '') return;
    const date = dateDepuisSaisie(saisie);
    if (!date || date < borneBasse || date > max) {
      setSaisieFautive(true);
      return;
    }
    setSaisieFautive(false);
    choisir(date);
  };

  const complet = choixDebut !== null && choixFin !== null;
  const jours = complet ? nombreDeJours(choixDebut, choixFin) : 0;

  const jeton = (cible: Etape, titre: string, date: string | null) => (
    <button
      type="button"
      className={`etape${etape === cible ? ' etape--active' : ''}`}
      aria-current={etape === cible}
      disabled={cible === 'fin' && choixDebut === null}
      onClick={() => changerEtape(cible)}
    >
      <span className="etape__rang">{cible === 'debut' ? '1' : '2'}</span>
      <span className="etape__nom">{titre}</span>
      <span className="etape__date">{date ? dateCourte(date) : 'à choisir'}</span>
    </button>
  );

  return (
    <Modale
      titre="Choisir la période"
      origine={origine}
      onFermer={onFermer}
      pied={
        <>
          {/* Les deux jetons affichent déjà les dates : les répéter ici ne
              servirait qu'à faire déborder le pied sur un écran étroit. */}
          <span className="feuille__total">
            {complet ? (
              <strong>
                {jours} jour{jours > 1 ? 's' : ''}
              </strong>
            ) : (
              <span className="plage__resume">
                {surDebut ? 'Choisissez le premier jour' : 'Choisissez le dernier jour'}
              </span>
            )}
          </span>
          <div className="feuille__actions">
            <button type="button" className="bouton" onClick={onFermer}>
              Annuler
            </button>
            <button
              type="button"
              className="bouton bouton--principal"
              disabled={!complet}
              onClick={() => complet && onValider(choixDebut, choixFin)}
            >
              Afficher
            </button>
          </div>
        </>
      }
    >
      <div className="plage">
        <div className="etapes" role="group" aria-label="Étapes">
          {jeton('debut', 'Début', choixDebut)}
          {jeton('fin', 'Fin', choixFin)}
        </div>

        <Calendrier
          valeur={valeur}
          min={borneBasse}
          max={max}
          etiquette={surDebut ? 'Premier jour de la période' : 'Dernier jour de la période'}
          plage={
            !surDebut && choixDebut && choixFin
              ? { debut: choixDebut, fin: choixFin }
              : null
          }
          onChange={choisir}
        />

        <div className="plage__saisie">
          <label className="etiquette" htmlFor="plage-saisie">
            {surDebut ? 'Début' : 'Fin'} (jj/mm/aaaa)
          </label>
          <input
            id="plage-saisie"
            className={`champ${saisieFautive ? ' champ--fautif' : ''}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={dateCourte(valeur ?? max)}
            value={saisie}
            aria-invalid={saisieFautive}
            aria-describedby={saisieFautive ? 'plage-saisie-erreur' : undefined}
            onChange={(evenement) => {
              setSaisie(evenement.target.value);
              setSaisieFautive(false);
            }}
            onBlur={validerLaSaisie}
            onKeyDown={(evenement) => {
              if (evenement.key !== 'Enter') return;
              evenement.preventDefault();
              validerLaSaisie();
            }}
          />
          {saisieFautive && (
            <p className="plage__erreur" id="plage-saisie-erreur">
              Tapez une date entre le {dateLongue(borneBasse)} et le {dateLongue(max)}.
            </p>
          )}
        </div>
      </div>
    </Modale>
  );
}

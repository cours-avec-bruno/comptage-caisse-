import { useRef, useState } from 'react';
import { COUPURES_ORDRE_SAISIE } from '../coupures';
import { formaterEuros, quantiteDepuisSaisie } from '../format';
import { Jeton } from './Jeton';

export type Quantites = Record<number, string>;

interface Props {
  quantites: Quantites;
  onChange: (quantites: Quantites) => void;
  /** Stock disponible par coupure : affiché et surligné en cas de dépassement. */
  stock?: Record<number, number>;
  /** Champ à focaliser quand on appuie sur Entrée sur la dernière coupure. */
  refSuivante?: React.RefObject<HTMLInputElement>;
  compact?: boolean;
  autoFocus?: boolean;
}

export const quantitesVides = (): Quantites => ({});

/** Somme en centimes d'une saisie. Entiers uniquement. */
export function totalSaisie(quantites: Quantites): number {
  return Object.entries(quantites).reduce(
    (somme, [coupure, saisie]) => somme + Number(coupure) * quantiteDepuisSaisie(saisie),
    0,
  );
}

/** Nombre total de coupures saisies, toutes valeurs confondues. */
export function nombreCoupures(quantites: Quantites): number {
  return Object.values(quantites).reduce(
    (somme, saisie) => somme + quantiteDepuisSaisie(saisie),
    0,
  );
}

/** Saisie -> détail entier prêt pour l'API, quantités nulles écartées. */
export function detailPourApi(quantites: Quantites): Record<number, number> {
  const detail: Record<number, number> = {};
  for (const [coupure, saisie] of Object.entries(quantites)) {
    const quantite = quantiteDepuisSaisie(saisie);
    if (quantite > 0) detail[Number(coupure)] = quantite;
  }
  return detail;
}

export function GrilleSaisie({
  quantites,
  onChange,
  stock,
  refSuivante,
  compact = false,
  autoFocus = false,
}: Props) {
  const champs = useRef<(HTMLInputElement | null)[]>([]);
  const [ligneActive, setLigneActive] = useState<number | null>(null);

  const total = totalSaisie(quantites);
  const totalCoupures = nombreCoupures(quantites);

  /** Entrée descend d'une ligne ; Maj+Entrée remonte. */
  const surTouche = (evenement: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (evenement.key !== 'Enter') return;
    evenement.preventDefault();

    const pas = evenement.shiftKey ? -1 : 1;
    const suivant = champs.current[index + pas];

    if (suivant) {
      suivant.focus();
      return;
    }
    // Arrivé au bout de la grille, on enchaîne sur le champ qui suit
    // (la CB, ou le motif d'une sortie) plutôt que de perdre le focus.
    if (pas === 1) refSuivante?.current?.focus();
  };

  let index = -1;

  return (
    <div className="carte grille">
      {(['billet', 'piece'] as const).map((type) => (
        <div key={type}>
          <div className="grille__section">{type === 'billet' ? 'Billets' : 'Pièces'}</div>

          {COUPURES_ORDRE_SAISIE.filter((coupure) => coupure.type === type).map(
            (coupure) => {
              index += 1;
              const position = index;
              const saisie = quantites[coupure.valeur] ?? '';
              const quantite = quantiteDepuisSaisie(saisie);
              const valeur = coupure.valeur * quantite;
              const disponible = stock?.[coupure.valeur];
              const depasse = disponible !== undefined && quantite > disponible;

              return (
                <div
                  key={coupure.valeur}
                  className={`grille__ligne${ligneActive === position ? ' grille__ligne--active' : ''}`}
                >
                  <span className="grille__jeton">
                    <Jeton valeur={coupure.valeur} compact={compact} />
                  </span>

                  <label className="grille__nom" htmlFor={`qte-${coupure.valeur}`}>
                    {coupure.libelle}
                    {disponible !== undefined && (
                      <span
                        className={`grille__stock${depasse ? ' grille__stock--depasse' : ''}`}
                      >
                        {depasse
                          ? `au coffre : ${disponible} seulement`
                          : `au coffre : ${disponible}`}
                      </span>
                    )}
                  </label>

                  <input
                    id={`qte-${coupure.valeur}`}
                    ref={(element) => {
                      champs.current[position] = element;
                    }}
                    className={`champ champ--nombre${depasse ? ' champ--erreur' : ''}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    autoFocus={autoFocus && position === 0}
                    value={saisie}
                    aria-invalid={depasse || undefined}
                    // Le champ se sélectionne au focus : on tape par-dessus
                    // sans avoir à effacer ce qu'il y avait.
                    onFocus={(evenement) => {
                      evenement.currentTarget.select();
                      setLigneActive(position);
                    }}
                    onBlur={() => setLigneActive(null)}
                    onKeyDown={(evenement) => surTouche(evenement, position)}
                    onChange={(evenement) => {
                      const brut = evenement.target.value.replace(/\D/g, '');
                      onChange({ ...quantites, [coupure.valeur]: brut });
                    }}
                  />

                  <span
                    className={`grille__valeur${valeur === 0 ? ' grille__valeur--nulle' : ''}`}
                  >
                    {formaterEuros(valeur)}
                  </span>
                </div>
              );
            },
          )}
        </div>
      ))}

      <div className="grille__total">
        <span />
        <span className="grille__total-libelle">
          Total
          {totalCoupures > 0 && (
            <span className="grille__total-quantite">
              {totalCoupures} coupure{totalCoupures > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span />
        <span className="grille__valeur">{formaterEuros(total)}</span>
      </div>

      <p className="grille__aide">
        <kbd>Entrée</kbd> passe à la coupure suivante, <kbd>Maj</kbd>+<kbd>Entrée</kbd>{' '}
        revient en arrière. Le champ se sélectionne tout seul : tapez par-dessus.
      </p>
    </div>
  );
}

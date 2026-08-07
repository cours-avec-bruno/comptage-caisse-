import { forwardRef, useEffect, useState } from 'react';
import { centimesDepuisEuros, eurosDepuisCentimes } from '../format';

interface Props {
  /** Valeur en centimes. Le composant n'expose jamais de flottant. */
  valeur: number;
  onChange: (centimes: number) => void;
  id?: string;
  onKeyDown?: (evenement: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Saisie d'un montant en euros, convertie en centimes entiers.
 * La conversion découpe la chaîne, elle ne multiplie jamais un flottant.
 */
export const ChampEuros = forwardRef<HTMLInputElement, Props>(function ChampEuros(
  { valeur, onChange, id, onKeyDown },
  ref,
) {
  const [saisie, setSaisie] = useState(() => eurosDepuisCentimes(valeur));
  const [enEdition, setEnEdition] = useState(false);

  // Tant qu'on n'édite pas, le champ suit la valeur du parent (remise à zéro
  // après validation, fond par défaut rechargé…).
  useEffect(() => {
    if (!enEdition) setSaisie(eurosDepuisCentimes(valeur));
  }, [valeur, enEdition]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <input
        id={id}
        ref={ref}
        className="champ champ--nombre"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        style={{ paddingRight: 26 }}
        value={saisie}
        onFocus={(evenement) => {
          setEnEdition(true);
          evenement.currentTarget.select();
        }}
        onBlur={() => {
          setEnEdition(false);
          setSaisie(eurosDepuisCentimes(valeur));
        }}
        onKeyDown={onKeyDown}
        onChange={(evenement) => {
          const brut = evenement.target.value;
          setSaisie(brut);
          const centimes = centimesDepuisEuros(brut);
          if (centimes !== null) onChange(centimes);
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 9,
          color: 'var(--encre-effacee)',
          pointerEvents: 'none',
        }}
      >
        €
      </span>
    </div>
  );
});

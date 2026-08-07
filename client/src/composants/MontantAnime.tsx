import { useEffect, useRef, useState } from 'react';
import { formaterEuros } from '../format';

interface Props {
  centimes: number;
  className?: string;
}

/**
 * Montant qui bat brièvement quand il change. Confirme la prise en compte
 * d'une frappe sans détourner l'attention plus longtemps qu'il ne faut.
 */
export function MontantAnime({ centimes, className = '' }: Props) {
  const [anime, setAnime] = useState(false);
  const precedent = useRef(centimes);

  useEffect(() => {
    if (precedent.current === centimes) return;
    precedent.current = centimes;

    setAnime(true);
    const minuterie = window.setTimeout(() => setAnime(false), 340);
    return () => window.clearTimeout(minuterie);
  }, [centimes]);

  return (
    <span
      className={`montant-vedette${anime ? ' montant-vedette--anime' : ''} ${className}`}
    >
      {formaterEuros(centimes)}
    </span>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  titre: string;
  sousTitre?: string;
  onFermer: () => void;
  children: ReactNode;
  pied?: ReactNode;
}

export function Modale({ titre, sousTitre, onFermer, children, pied }: Props) {
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onFermer();
    };
    document.addEventListener('keydown', surTouche);
    // Le fond ne défile pas pendant qu'une modale est ouverte.
    const defilementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = defilementInitial;
    };
  }, [onFermer]);

  return (
    <div
      className="voile"
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer();
      }}
    >
      <div
        className="modale"
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        ref={boite}
      >
        <div className="modale__entete">
          <div>
            <h2>{titre}</h2>
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          <button type="button" className="bouton bouton--discret" onClick={onFermer}>
            Fermer
          </button>
        </div>

        <div className="modale__corps">{children}</div>
        {pied && <div className="modale__pied">{pied}</div>}
      </div>
    </div>
  );
}

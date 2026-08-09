import { useEffect, useState } from 'react';
import { api, MODE_DEMO, type Agent } from '../api';
import { GestionAgents } from '../composants/GestionAgents';
import { Modale } from '../composants/Modale';

interface Props {
  agentConnecte: Agent;
  origine?: { x: number; y: number } | null;
  onFermer: () => void;
}

/**
 * Paramètres : agents, sauvegardes, exports.
 *
 * Il n'y a plus de bouton « Enregistrer » : chaque action de cet écran prend
 * effet immédiatement, et un bouton qui ne ferait que fermer la feuille
 * laisserait croire qu'on peut annuler ce qui est déjà fait.
 *
 * Le fond de caisse, lui, se règle depuis l'écran de comptage — à côté de la
 * ligne qu'il explique.
 */
export function ModaleParametres({ agentConnecte, origine, onFermer }: Props) {
  const [sauvegardes, setSauvegardes] = useState<
    { fichier: string; modifie_le: string }[]
  >([]);
  const [dossier, setDossier] = useState('');

  useEffect(() => {
    api
      .sauvegardes()
      .then((reponse) => {
        setDossier(reponse.dossier);
        setSauvegardes(reponse.fichiers.slice(0, 5));
      })
      .catch(() => undefined);
  }, []);

  return (
    <Modale
      titre="Paramètres"
      origine={origine}
      onFermer={onFermer}
      pied={
        <>
          <span className="feuille__total" />
          <div className="feuille__actions">
            <button type="button" className="bouton bouton--principal" onClick={onFermer}>
              Fermer
            </button>
          </div>
        </>
      }
    >
      <GestionAgents agentConnecte={agentConnecte} />

      <div>
        <span className="etiquette">Sauvegardes automatiques</span>
        <p className="panneau__note" style={{ textAlign: 'left', margin: '0 0 8px' }}>
          {MODE_DEMO ? (
            <>
              Inactives en démonstration : il n'y a pas de base de données à copier.
              Dans l'application installée, une copie est écrite à chaque journée
              validée et les 30 dernières sont conservées.
            </>
          ) : (
            <>
              Une copie de la base est écrite dans <code>{dossier || 'sauvegardes/'}</code>{' '}
              à chaque journée validée. Les 30 dernières sont conservées.
            </>
          )}
        </p>
        {MODE_DEMO ? null : sauvegardes.length === 0 ? (
          <p className="panneau__note" style={{ textAlign: 'left' }}>
            Aucune copie pour le moment.
          </p>
        ) : (
          <ul className="liste-fichiers">
            {sauvegardes.map((fichier) => (
              <li key={fichier.fichier}>{fichier.fichier}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['comptages', 'mouvements', 'inventaire'] as const).map((nom) => (
          <button
            key={nom}
            type="button"
            className="bouton"
            onClick={() => void api.exporter(nom)}
          >
            Export {nom === 'comptages' ? 'journal' : nom}
          </button>
        ))}
      </div>
    </Modale>
  );
}

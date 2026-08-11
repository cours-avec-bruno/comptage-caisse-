import { useEffect, useState } from 'react';
import { api, type Agent } from '../api';
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
        {/* Le seul renseignement qui serve : où les trouver. */}
        <p className="chemin-dossier">
          <code>{dossier || 'sauvegardes/'}</code>
        </p>
        {sauvegardes.length === 0 ? (
          <p className="panneau__note panneau__note--gauche">
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

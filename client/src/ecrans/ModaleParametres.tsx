import { useEffect, useState } from 'react';
import { api, ErreurApi, MODE_DEMO, type Agent } from '../api';
import { formaterEuros } from '../format';
import { GestionAgents } from '../composants/GestionAgents';
import {
  GrilleSaisie,
  detailPourApi,
  totalSaisie,
  type Quantites,
} from '../composants/GrilleSaisie';
import { Modale } from '../composants/Modale';

interface Props {
  fondComposition: Record<number, number>;
  agentConnecte: Agent;
  origine?: { x: number; y: number } | null;
  onFermer: () => void;
  onEnregistre: () => void;
}

export function ModaleParametres({
  fondComposition,
  agentConnecte,
  origine,
  onFermer,
  onEnregistre,
}: Props) {
  const [fond, setFond] = useState<Quantites>(() =>
    Object.fromEntries(
      Object.entries(fondComposition).map(([coupure, quantite]) => [
        coupure,
        String(quantite),
      ]),
    ),
  );
  const [sauvegardes, setSauvegardes] = useState<
    { fichier: string; modifie_le: string }[]
  >([]);
  const [dossier, setDossier] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api
      .sauvegardes()
      .then((reponse) => {
        setDossier(reponse.dossier);
        setSauvegardes(reponse.fichiers.slice(0, 5));
      })
      .catch(() => undefined);
  }, []);

  const enregistrer = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await api.enregistrerParametres({ fond_composition: detailPourApi(fond) });
      onEnregistre();
      onFermer();
    } catch (probleme) {
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modale
      titre="Paramètres"
      origine={origine}
      onFermer={onFermer}
      pied={
        <>
          <span className="feuille__total" />
          <div className="feuille__actions">
            <button type="button" className="bouton" onClick={onFermer}>
              Annuler
            </button>
            <button
              type="button"
              className="bouton bouton--principal"
              disabled={enCours}
              onClick={enregistrer}
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      }
    >
      {erreur && <div className="message message--erreur">{erreur}</div>}

      <div>
        <span className="etiquette">
          Fond de caisse — {formaterEuros(totalSaisie(fond))}
        </span>
        <p className="panneau__note panneau__note--gauche" style={{ marginBottom: 12 }}>
          Ces quantités restent dans le tiroir chaque soir et sont retirées du
          versement au coffre, coupure par coupure. Le montant se déduit de la
          composition : il n'est pas saisi.
        </p>
        <GrilleSaisie quantites={fond} onChange={setFond} compact />
      </div>

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

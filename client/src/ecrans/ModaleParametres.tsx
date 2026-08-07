import { useEffect, useState } from 'react';
import { api, ErreurApi } from '../api';
import { ChampEuros } from '../composants/ChampEuros';
import { Modale } from '../composants/Modale';

interface Props {
  fondDefautCentimes: number;
  agents: string[];
  onFermer: () => void;
  onEnregistre: () => void;
}

export function ModaleParametres({
  fondDefautCentimes,
  agents,
  onFermer,
  onEnregistre,
}: Props) {
  const [fond, setFond] = useState(fondDefautCentimes);
  const [listeAgents, setListeAgents] = useState(agents.join(', '));
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
      await api.enregistrerParametres({
        fond_defaut_centimes: fond,
        agents: listeAgents
          .split(',')
          .map((initiales) => initiales.trim())
          .filter(Boolean),
      });
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
      onFermer={onFermer}
      pied={
        <>
          <span className="modale__total" />
          <div className="modale__actions">
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
        <label className="etiquette" htmlFor="fond-defaut">
          Fond de caisse par défaut
        </label>
        <ChampEuros id="fond-defaut" valeur={fond} onChange={setFond} />
        <p className="panneau__note" style={{ textAlign: 'left', marginTop: 6 }}>
          Valeur proposée chaque soir sur l'écran de comptage. Elle reste modifiable
          journée par journée.
        </p>
      </div>

      <div>
        <label className="etiquette" htmlFor="agents">
          Initiales des agents d'accueil
        </label>
        <input
          id="agents"
          className="champ"
          type="text"
          autoComplete="off"
          placeholder="BR, ML, JD"
          value={listeAgents}
          onChange={(evenement) => setListeAgents(evenement.target.value)}
        />
        <p className="panneau__note" style={{ textAlign: 'left', marginTop: 6 }}>
          Séparées par des virgules. Elles alimentent le sélecteur de la barre du haut.
        </p>
      </div>

      <div>
        <span className="etiquette">Sauvegardes automatiques</span>
        <p className="panneau__note" style={{ textAlign: 'left', margin: '0 0 8px' }}>
          Une copie de la base est écrite dans <code>{dossier || 'sauvegardes/'}</code> à
          chaque journée validée. Les 30 dernières sont conservées.
        </p>
        {sauvegardes.length === 0 ? (
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
        <a className="bouton" href="/api/export/comptages.csv" download>
          Export journal
        </a>
        <a className="bouton" href="/api/export/mouvements.csv" download>
          Export mouvements
        </a>
        <a className="bouton" href="/api/export/inventaire.csv" download>
          Export inventaire
        </a>
      </div>
    </Modale>
  );
}

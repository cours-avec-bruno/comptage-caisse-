import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ErreurApi,
  MODE_DEMO,
  type EtatCoffre,
  type Journal,
  type Parametres,
} from './api';
import { EcranCoffre } from './ecrans/EcranCoffre';
import { EcranComptage } from './ecrans/EcranComptage';
import { EcranJournal } from './ecrans/EcranJournal';
import { ModaleParametres } from './ecrans/ModaleParametres';
import { dateLongue } from './format';

type Onglet = 'comptage' | 'coffre' | 'journal';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'comptage', libelle: 'Comptage du jour' },
  { cle: 'coffre', libelle: 'Coffre' },
  { cle: 'journal', libelle: 'Journal' },
];

/** Les initiales choisies restent sur ce poste d'un soir à l'autre. */
const CLE_AGENT = 'caisse.agent';

export function App() {
  const [onglet, setOnglet] = useState<Onglet>('comptage');
  const [parametres, setParametres] = useState<Parametres | null>(null);
  const [coffre, setCoffre] = useState<EtatCoffre | null>(null);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [agent, setAgent] = useState(() => localStorage.getItem(CLE_AGENT) ?? '');
  const [origineParametres, setOrigineParametres] = useState<
    { x: number; y: number } | null
  >(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [nouveauxParametres, nouveauCoffre, nouveauJournal] = await Promise.all([
        api.parametres(),
        api.coffre(),
        api.journal(),
      ]);
      setParametres(nouveauxParametres);
      setCoffre(nouveauCoffre);
      setJournal(nouveauJournal);
      setErreur(null);

      // Des initiales retirées des paramètres ne doivent pas rester actives.
      setAgent((actuel) =>
        actuel && nouveauxParametres.agents.includes(actuel) ? actuel : '',
      );
    } catch (probleme) {
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    if (agent) localStorage.setItem(CLE_AGENT, agent);
    else localStorage.removeItem(CLE_AGENT);
  }, [agent]);

  if (erreur && !parametres) {
    return (
      <div className="contenu">
        <div className="message message--erreur">{erreur}</div>
      </div>
    );
  }

  if (!parametres || !coffre || !journal) {
    return <div className="chargement">Chargement…</div>;
  }

  return (
    <div className="app">
      {MODE_DEMO && (
        <div className="bandeau-demo">
          <strong>Démonstration</strong>
          <span>
            Chiffres inventés, rien n'est enregistré : tout repart à zéro au
            rechargement de la page. Ce n'est pas la caisse de la piscine.
          </span>
        </div>
      )}

      <header className="barre">
        <div className="barre__marque">
          Caisse <span>accueil piscine</span>
        </div>

        <nav className="barre__nav">
          {ONGLETS.map(({ cle, libelle }) => (
            <button
              key={cle}
              type="button"
              className="onglet"
              aria-current={onglet === cle ? 'page' : undefined}
              onClick={() => setOnglet(cle)}
            >
              {libelle}
            </button>
          ))}
        </nav>

        <div className="barre__droite">
          <span className="barre__date">{dateLongue(parametres.date_du_jour)}</span>

          <div className={`selecteur-agent${agent ? '' : ' selecteur-agent--vide'}`}>
            <label htmlFor="agent">Agent</label>
            <select
              id="agent"
              value={agent}
              onChange={(evenement) => setAgent(evenement.target.value)}
            >
              <option value="">— choisir —</option>
              {parametres.agents.map((initiales) => (
                <option key={initiales} value={initiales}>
                  {initiales}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="bouton bouton--discret"
            onClick={(evenement) => {
              const rect = evenement.currentTarget.getBoundingClientRect();
              setOrigineParametres({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
            }}
          >
            Paramètres
          </button>
        </div>
      </header>

      <main className="contenu">
        {erreur && (
          <div
            className="message message--erreur"
            style={{ marginBottom: 'var(--gouttiere)' }}
          >
            {erreur}
          </div>
        )}

        {onglet === 'comptage' && (
          <EcranComptage
            date={parametres.date_du_jour}
            agent={agent}
            fondDefautCentimes={parametres.fond_defaut_centimes}
            onVersement={charger}
          />
        )}

        {onglet === 'coffre' && (
          <EcranCoffre
            coffre={coffre}
            date={parametres.date_du_jour}
            agent={agent}
            onChangement={charger}
          />
        )}

        {onglet === 'journal' && <EcranJournal journal={journal} />}
      </main>

      {origineParametres && (
        <ModaleParametres
          fondDefautCentimes={parametres.fond_defaut_centimes}
          agents={parametres.agents}
          origine={origineParametres}
          onFermer={() => setOrigineParametres(null)}
          onEnregistre={charger}
        />
      )}
    </div>
  );
}

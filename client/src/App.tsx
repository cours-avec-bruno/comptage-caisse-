import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ErreurApi,
  MODE_DEMO,
  type Agent,
  type EtatCoffre,
  type Journal,
  type Parametres,
} from './api';
import { EcranConnexion } from './ecrans/EcranConnexion';
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

export function App() {
  const [onglet, setOnglet] = useState<Onglet>('comptage');
  const [parametres, setParametres] = useState<Parametres | null>(null);
  const [coffre, setCoffre] = useState<EtatCoffre | null>(null);
  const [journal, setJournal] = useState<Journal | null>(null);
  // `undefined` = on ne sait pas encore ; `null` = personne n'est connecté.
  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
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
    } catch (probleme) {
      // Une session expirée en cours de service renvoie à la connexion
      // plutôt que d'afficher une erreur qu'on ne peut pas corriger.
      if (probleme instanceof ErreurApi && /session/i.test(probleme.message)) {
        setAgent(null);
        return;
      }
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
    }
  }, []);

  // Au démarrage : qui est connecté sur ce poste ?
  useEffect(() => {
    api
      .session()
      .then(({ agent: connecte }) => setAgent(connecte))
      .catch(() => setAgent(null));
  }, []);

  useEffect(() => {
    if (agent) void charger();
  }, [agent, charger]);

  const deconnecter = async () => {
    await api.deconnexion().catch(() => undefined);
    setAgent(null);
    // Le poste est rendu au suivant : il doit retrouver l'écran de comptage,
    // pas l'onglet où le précédent s'était arrêté.
    setOnglet('comptage');
    setParametres(null);
    setCoffre(null);
    setJournal(null);
  };

  if (agent === undefined) {
    return <div className="chargement">Chargement…</div>;
  }

  if (agent === null) {
    return <EcranConnexion onConnecte={setAgent} />;
  }

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

          <div className="agent-connecte" title={`${agent.prenom} ${agent.nom}`}>
            <span className="badge-agent">{agent.initiales}</span>
            <span className="agent-connecte__prenom">{agent.prenom}</span>
          </div>

          <button type="button" className="bouton bouton--discret" onClick={deconnecter}>
            Déconnexion
          </button>

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
            agent={agent.initiales}
            fondDefautCentimes={parametres.fond_defaut_centimes}
            onVersement={charger}
          />
        )}

        {onglet === 'coffre' && (
          <EcranCoffre
            coffre={coffre}
            date={parametres.date_du_jour}
            agent={agent.initiales}
            onChangement={charger}
          />
        )}

        {onglet === 'journal' && <EcranJournal journal={journal} />}
      </main>

      {origineParametres && (
        <ModaleParametres
          fondDefautCentimes={parametres.fond_defaut_centimes}
          agentConnecte={agent}
          origine={origineParametres}
          onFermer={() => setOrigineParametres(null)}
          onEnregistre={charger}
        />
      )}
    </div>
  );
}

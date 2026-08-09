import { useEffect, useRef, useState } from 'react';
import { api, ErreurApi, MODE_DEMO, type Agent } from '../api';

interface Props {
  onConnecte: (agent: Agent) => void;
}

/**
 * Page de connexion.
 *
 * On liste les agents plutôt que de faire taper des initiales : ils sont deux
 * ou trois, tout le monde se connaît, et un clic sur son prénom fait gagner
 * une frappe. Le mot de passe reste à saisir.
 */
export function EcranConnexion({ onConnecte }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [initiales, setInitiales] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const champMotDePasse = useRef<HTMLInputElement>(null);

  // La liste des agents est publique : elle ne dit rien de plus que le
  // trombinoscope affiché derrière le comptoir.
  useEffect(() => {
    api
      .agentsPourConnexion()
      .then(({ agents: liste }) => {
        setAgents(liste);
        if (liste.length > 0) setInitiales(liste[0]!.initiales);
      })
      .catch(() => setAgents([]));
  }, []);

  const connecter = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const { agent } = await api.connexion(initiales, motDePasse);
      onConnecte(agent);
    } catch (probleme) {
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
      // On ne vide pas le champ : effacer après coup entre en course avec la
      // frappe suivante, et retaper un mot de passe entier pour une lettre
      // fautive est pénible. On le sélectionne, la frappe le remplace.
      champMotDePasse.current?.focus();
      champMotDePasse.current?.select();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="connexion">
      <form className="carte connexion__carte" onSubmit={connecter}>
        <div className="connexion__entete">
          <div className="connexion__marque">
            Caisse <span>accueil piscine</span>
          </div>
          <h1>Qui compte ce soir ?</h1>
        </div>

        {erreur && <div className="message message--erreur">{erreur}</div>}

        <div className="connexion__agents">
          {agents.map((agent) => {
            const choisi = agent.initiales === initiales;
            return (
              <button
                key={agent.id}
                type="button"
                className={`carte-agent${choisi ? ' carte-agent--choisi' : ''}`}
                aria-pressed={choisi}
                onClick={() => {
                  setInitiales(agent.initiales);
                  setErreur(null);
                  champMotDePasse.current?.focus();
                }}
              >
                <span className="carte-agent__initiales">{agent.initiales}</span>
                <span className="carte-agent__nom">
                  {agent.prenom}
                  <small>{agent.nom}</small>
                </span>
              </button>
            );
          })}

          {agents.length === 0 && (
            <p className="panneau__note">
              Aucun agent n'est enregistré. Redémarrez l'application : elle en crée
              deux au premier lancement.
            </p>
          )}
        </div>

        <div>
          <label className="etiquette" htmlFor="mot-de-passe">
            Mot de passe
          </label>
          <input
            id="mot-de-passe"
            ref={champMotDePasse}
            className="champ"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
          />
          <p className="connexion__aide">
            Par défaut, c'est votre prénom en majuscules. Il se change dans les
            paramètres, une fois connecté.
          </p>
        </div>

        <button
          type="submit"
          className="bouton bouton--valider"
          disabled={enCours || !initiales || !motDePasse}
        >
          {enCours ? 'Connexion…' : 'Entrer'}
        </button>

        {MODE_DEMO && (
          <p className="connexion__demo">
            Démonstration : choisissez un agent, le mot de passe est son prénom en
            majuscules — <strong>BRUNO</strong> ou <strong>MARIE</strong>.
          </p>
        )}
      </form>
    </div>
  );
}

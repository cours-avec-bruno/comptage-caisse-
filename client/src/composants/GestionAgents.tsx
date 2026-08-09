import { useEffect, useState } from 'react';
import { api, ErreurApi, type Agent } from '../api';

interface Props {
  /** L'agent connecté : on ne se désactive pas soi-même. */
  agentConnecte: Agent;
}

/**
 * Ajout d'agents, changement de mot de passe, désactivation.
 *
 * Tout agent connecté peut gérer les autres : l'équipe fait trois personnes
 * autour du même comptoir, et une hiérarchie de rôles coûterait plus qu'elle
 * ne protégerait.
 */
export function GestionAgents({ agentConnecte }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [ancien, setAncien] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = () =>
    api
      .agents()
      .then(({ agents: liste }) => setAgents(liste))
      .catch((probleme) =>
        setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.'),
      );

  useEffect(() => {
    void charger();
  }, []);

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    setMessage(null);
    setEnCours(true);
    try {
      await action();
      await charger();
    } catch (probleme) {
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
    } finally {
      setEnCours(false);
    }
  };

  const ajouter = () =>
    agir(async () => {
      const { agent } = await api.creerAgent({ prenom, nom });
      setMessage(
        `${agent.prenom} ${agent.nom} ajouté — initiales ${agent.initiales}, mot de passe ${agent.prenom.toUpperCase()}.`,
      );
      setPrenom('');
      setNom('');
    });

  const fermerPanneau = () => {
    setOuvert(null);
    setAncien('');
    setMotDePasse('');
  };

  const enregistrerMotDePasse = () =>
    agir(async () => {
      await api.changerMotDePasse(agentConnecte.id, ancien, motDePasse);
      setMessage('Votre mot de passe est modifié.');
      fermerPanneau();
    });

  const reinitialiser = (agent: Agent) =>
    agir(async () => {
      const { mot_de_passe } = await api.reinitialiserMotDePasse(agent.id, ancien);
      setMessage(
        `Mot de passe de ${agent.prenom} remis à « ${mot_de_passe} ». À changer à la prochaine connexion.`,
      );
      fermerPanneau();
    });

  const basculerActif = (agent: Agent) =>
    agir(async () => {
      await api.modifierAgent(agent.id, { actif: !agent.actif });
      setMessage(
        agent.actif
          ? `${agent.prenom} ne peut plus se connecter.`
          : `${agent.prenom} peut de nouveau se connecter.`,
      );
    });

  return (
    <div className="agents">
      <span className="etiquette">Agents d'accueil</span>

      {erreur && <div className="message message--erreur">{erreur}</div>}
      {message && <div className="message message--succes">{message}</div>}

      <ul className="agents__liste">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className={`agents__ligne${agent.actif ? '' : ' agents__ligne--inactif'}`}
          >
            <div className="agents__identite">
              <span className="badge-agent">{agent.initiales}</span>
              <span>
                {agent.prenom} {agent.nom}
                {agent.id === agentConnecte.id && (
                  <small className="agents__vous"> — vous</small>
                )}
                {!agent.actif && <small className="agents__vous"> — désactivé</small>}
              </span>
            </div>

            <div className="agents__actions">
              <button
                type="button"
                className="bouton bouton--discret"
                onClick={() => {
                  if (ouvert === agent.id) {
                    fermerPanneau();
                  } else {
                    setOuvert(agent.id);
                    setAncien('');
                    setMotDePasse('');
                  }
                  setMessage(null);
                }}
              >
                {agent.id === agentConnecte.id ? 'Mon mot de passe' : 'Réinitialiser'}
              </button>
              {agent.id !== agentConnecte.id && (
                <button
                  type="button"
                  className={`bouton bouton--discret${agent.actif ? ' bouton--danger' : ''}`}
                  disabled={enCours}
                  onClick={() => basculerActif(agent)}
                >
                  {agent.actif ? 'Désactiver' : 'Réactiver'}
                </button>
              )}
            </div>

            {ouvert === agent.id &&
              (agent.id === agentConnecte.id ? (
                <div className="agents__mdp">
                  <input
                    className="champ"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    placeholder="Mot de passe actuel"
                    value={ancien}
                    onChange={(evenement) => setAncien(evenement.target.value)}
                  />
                  <input
                    className="champ"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Nouveau mot de passe"
                    value={motDePasse}
                    onChange={(evenement) => setMotDePasse(evenement.target.value)}
                    onKeyDown={(evenement) => {
                      if (evenement.key === 'Enter' && ancien && motDePasse.length >= 3) {
                        evenement.preventDefault();
                        void enregistrerMotDePasse();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="bouton bouton--principal"
                    disabled={enCours || !ancien || motDePasse.length < 3}
                    onClick={enregistrerMotDePasse}
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <div className="agents__mdp">
                  <p className="agents__explication">
                    Le mot de passe de {agent.prenom} redeviendra{' '}
                    <strong>{agent.prenom.toUpperCase()}</strong>, à changer ensuite
                    depuis ce même écran. Confirmez avec <em>votre</em> mot de passe.
                  </p>
                  <input
                    className="champ"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    placeholder="Votre mot de passe"
                    value={ancien}
                    onChange={(evenement) => setAncien(evenement.target.value)}
                    onKeyDown={(evenement) => {
                      if (evenement.key === 'Enter' && ancien) {
                        evenement.preventDefault();
                        void reinitialiser(agent);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="bouton bouton--principal"
                    disabled={enCours || !ancien}
                    onClick={() => reinitialiser(agent)}
                  >
                    Réinitialiser
                  </button>
                </div>
              ))}
          </li>
        ))}
      </ul>

      <div className="agents__ajout">
        <input
          className="champ"
          placeholder="Prénom"
          autoComplete="off"
          value={prenom}
          onChange={(evenement) => setPrenom(evenement.target.value)}
        />
        <input
          className="champ"
          placeholder="Nom"
          autoComplete="off"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
        />
        <button
          type="button"
          className="bouton bouton--principal"
          disabled={enCours || !prenom.trim() || !nom.trim()}
          onClick={ajouter}
        >
          Ajouter
        </button>
      </div>

      <p className="panneau__note panneau__note--gauche">
        Un nouvel agent reçoit son prénom en majuscules comme mot de passe, et ses
        initiales sont déduites de son nom. On ne choisit jamais le mot de passe
        d'un collègue : on le remet à son prénom, et la personne le change
        ensuite. Un agent désactivé ne peut plus se connecter, mais son nom reste
        dans l'historique déjà écrit.
      </p>
    </div>
  );
}

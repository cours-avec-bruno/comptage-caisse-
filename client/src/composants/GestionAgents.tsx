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

  const enregistrerMotDePasse = (agent: Agent) =>
    agir(async () => {
      await api.changerMotDePasse(agent.id, motDePasse);
      setMessage(`Mot de passe de ${agent.prenom} modifié.`);
      setMotDePasse('');
      setOuvert(null);
    });

  const reinitialiser = (agent: Agent) =>
    agir(async () => {
      const { mot_de_passe } = await api.reinitialiserMotDePasse(agent.id);
      setMessage(`Mot de passe de ${agent.prenom} remis à « ${mot_de_passe} ».`);
      setOuvert(null);
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
                  setOuvert(ouvert === agent.id ? null : agent.id);
                  setMotDePasse('');
                  setMessage(null);
                }}
              >
                Mot de passe
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

            {ouvert === agent.id && (
              <div className="agents__mdp">
                <input
                  className="champ"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  placeholder="Nouveau mot de passe"
                  value={motDePasse}
                  onChange={(evenement) => setMotDePasse(evenement.target.value)}
                  onKeyDown={(evenement) => {
                    if (evenement.key === 'Enter' && motDePasse.length >= 3) {
                      evenement.preventDefault();
                      void enregistrerMotDePasse(agent);
                    }
                  }}
                />
                <button
                  type="button"
                  className="bouton bouton--principal"
                  disabled={enCours || motDePasse.length < 3}
                  onClick={() => enregistrerMotDePasse(agent)}
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  className="bouton"
                  disabled={enCours}
                  title={`Remettre le mot de passe à ${agent.prenom.toUpperCase()}`}
                  onClick={() => reinitialiser(agent)}
                >
                  Réinitialiser
                </button>
              </div>
            )}
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
        initiales sont déduites de son nom. Un agent désactivé ne peut plus se
        connecter, mais son nom reste dans l'historique déjà écrit.
      </p>
    </div>
  );
}

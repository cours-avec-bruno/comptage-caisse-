import { useEffect, useState } from 'react';
import { api, ErreurApi, type Agent } from '../api';

interface Props {
  /** L'agent connecté : on ne se désactive pas soi-même. */
  agentConnecte: Agent;
}

/**
 * Ajout d'agents, désactivation, suppression, et changement de son propre mot
 * de passe.
 *
 * Supprimer se confirme par le mot de passe de la session qui le demande, pas
 * par celui de l'agent visé : le poste reste ouvert entre deux passages, et
 * ce mot de passe est la seule chose qui distingue « c'est bien moi qui le
 * décide » de « quelqu'un est passé derrière le comptoir ».
 *
 * Personne ne peut toucher au mot de passe d'un autre — pas même le remettre
 * au prénom : un mot de passe qu'un collègue peut remettre à une valeur qu'il
 * connaît n'est plus un mot de passe. Chacun change le sien depuis sa propre
 * session, en donnant l'ancien et en tapant le nouveau deux fois.
 */
export function GestionAgents({ agentConnecte }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [aSupprimer, setASupprimer] = useState<Agent | null>(null);
  const [mdpSuppression, setMdpSuppression] = useState('');
  const [ancien, setAncien] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
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
    setConfirmation('');
  };

  // La double saisie se vérifie ici aussi, pour le dire avant l'envoi plutôt
  // qu'après un aller-retour.
  const discordance = confirmation.length > 0 && confirmation !== motDePasse;
  const complet =
    ancien.length > 0 && motDePasse.length >= 3 && confirmation === motDePasse;

  const enregistrerMotDePasse = () =>
    agir(async () => {
      await api.changerMotDePasse(agentConnecte.id, ancien, motDePasse, confirmation);
      setMessage('Votre mot de passe est modifié.');
      fermerPanneau();
    });

  const fermerSuppression = () => {
    setASupprimer(null);
    setMdpSuppression('');
  };

  const supprimer = () => {
    const cible = aSupprimer;
    if (!cible) return;
    return agir(async () => {
      await api.supprimerAgent(cible.id, mdpSuppression);
      // « Le compte de X » plutôt que « X est supprimé » : on ne connaît pas
      // le genre des agents, et l'accord se poserait à chaque fois.
      setMessage(
        `Le compte de ${cible.prenom} ${cible.nom} est supprimé. Les lignes signées ${cible.initiales} restent au journal.`,
      );
      fermerSuppression();
    });
  };

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
              {agent.id === agentConnecte.id && (
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
                      setConfirmation('');
                    }
                    setMessage(null);
                  }}
                >
                  Mon mot de passe
                </button>
              )}
              {agent.id !== agentConnecte.id && (
                <>
                  <button
                    type="button"
                    className={`bouton bouton--discret${agent.actif ? ' bouton--danger' : ''}`}
                    disabled={enCours}
                    onClick={() => basculerActif(agent)}
                  >
                    {agent.actif ? 'Désactiver' : 'Réactiver'}
                  </button>
                  <button
                    type="button"
                    className="bouton bouton--discret bouton--danger"
                    disabled={enCours}
                    onClick={() => {
                      setMessage(null);
                      setErreur(null);
                      if (aSupprimer?.id === agent.id) {
                        fermerSuppression();
                      } else {
                        setASupprimer(agent);
                        setMdpSuppression('');
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </>
              )}
            </div>

            {aSupprimer?.id === agent.id && (
              <div className="agents__suppression">
                <p className="agents__avertissement">
                  <strong>
                    Supprimer {agent.prenom} {agent.nom} ({agent.initiales}) ?
                  </strong>{' '}
                  C'est définitif : le compte disparaît et ne se récupère pas.
                  Les comptages et les mouvements du coffre signés{' '}
                  {agent.initiales} restent au journal, et ces initiales ne
                  seront jamais redonnées à quelqu'un d'autre.
                </p>

                <label className="etiquette" htmlFor={`mdp-suppression-${agent.id}`}>
                  Votre mot de passe, {agentConnecte.prenom}
                </label>
                <div className="agents__suppression-saisie">
                  <input
                    id={`mdp-suppression-${agent.id}`}
                    className="champ"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    placeholder="Le vôtre, pas le sien"
                    value={mdpSuppression}
                    onChange={(evenement) => setMdpSuppression(evenement.target.value)}
                    onKeyDown={(evenement) => {
                      if (evenement.key === 'Enter' && mdpSuppression.length > 0) {
                        evenement.preventDefault();
                        void supprimer();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="bouton"
                    disabled={enCours}
                    onClick={fermerSuppression}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="bouton bouton--danger-plein"
                    disabled={enCours || mdpSuppression.length === 0}
                    onClick={supprimer}
                  >
                    Supprimer définitivement
                  </button>
                </div>
              </div>
            )}

            {ouvert === agent.id && (
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
                />
                <input
                  className={`champ${discordance ? ' champ--erreur' : ''}`}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Le nouveau, encore"
                  aria-invalid={discordance || undefined}
                  value={confirmation}
                  onChange={(evenement) => setConfirmation(evenement.target.value)}
                  onKeyDown={(evenement) => {
                    if (evenement.key === 'Enter' && complet) {
                      evenement.preventDefault();
                      void enregistrerMotDePasse();
                    }
                  }}
                />
                <button
                  type="button"
                  className="bouton bouton--principal"
                  disabled={enCours || !complet}
                  onClick={enregistrerMotDePasse}
                >
                  Changer
                </button>

                {discordance && (
                  <p className="agents__discordance">
                    Les deux nouveaux mots de passe ne sont pas identiques.
                  </p>
                )}
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
    </div>
  );
}

import { useMemo, useState } from 'react';
import { PERIODES, statistiques, type SeauRecette } from 'caisse-partage';
import type { Journal } from '../api';
import { dateCourte, dateLongue, formaterEuros } from '../format';

interface Props {
  journal: Journal;
  /** La date du serveur, jamais celle du poste : elle fait foi partout ailleurs. */
  date: string;
}

/** Les trois moyens de paiement, dans l'ordre où ils s'empilent. */
const MOYENS = [
  { cle: 'especes', libelle: 'Espèces' },
  { cle: 'cb', libelle: 'Carte bancaire' },
  { cle: 'cheques', libelle: 'Chèques' },
] as const;

const MOIS_COURTS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/** « 09/08 » pour un jour, « sem. 03/08 » pour une semaine, « août » pour un mois. */
function etiquetteSeau(seau: SeauRecette, granularite: string): string {
  const [annee = '', mois = '', jour = ''] = seau.cle.split('-');
  if (granularite === 'mois') {
    return `${MOIS_COURTS[Number(mois) - 1] ?? mois} ${annee.slice(2)}`;
  }
  return granularite === 'semaine' ? `sem. ${jour}/${mois}` : `${jour}/${mois}`;
}

function periodeDuSeau(seau: SeauRecette, granularite: string): string {
  if (granularite === 'jour') return dateLongue(seau.debut);
  return `du ${dateCourte(seau.debut)} au ${dateCourte(seau.fin)}`;
}

export function EcranStatistiques({ journal, date }: Props) {
  const [periode, setPeriode] = useState(PERIODES[1]);

  const stat = useMemo(
    () => statistiques(journal.lignes, date, periode.jours),
    [journal.lignes, date, periode],
  );

  const montants = {
    especes: stat.totaux.especes_centimes,
    cb: stat.totaux.cb_centimes,
    cheques: stat.totaux.cheques_centimes,
  };

  const maximum = Math.max(1, ...stat.seaux.map((seau) => seau.recette_centimes));
  // Au-delà d'une dizaine de colonnes, les dates se chevauchent : on n'en
  // garde qu'une sur N, en gardant toujours la plus récente.
  const pasEtiquettes = Math.max(1, Math.ceil(stat.seaux.length / 10));

  const titreEvolution =
    stat.granularite === 'mois'
      ? 'Mois par mois'
      : stat.granularite === 'semaine'
        ? 'Semaine par semaine'
        : 'Jour par jour';

  return (
    <>
      <div className="entete-ecran">
        <div>
          <h1>Statistiques</h1>
          <p>Ce que la caisse a encaissé, et par quel moyen.</p>
        </div>

        <div className="entete-ecran__actions" role="group" aria-label="Période">
          {PERIODES.map((choix) => (
            <button
              key={choix.cle}
              type="button"
              className="bouton bouton--onglet"
              aria-pressed={choix.cle === periode.cle}
              onClick={() => setPeriode(choix)}
            >
              {choix.libelle}
            </button>
          ))}
        </div>
      </div>

      {stat.journees === 0 ? (
        <div className="carte stats__vide">
          <p>Aucune journée validée sur cette période.</p>
          <p className="panneau__note">
            Les statistiques se remplissent toutes seules à mesure que les journées
            sont validées.
          </p>
        </div>
      ) : (
        <>
          <div className="stats">
            <section className="carte stats__vedette">
              <span className="etiquette">
                Recette du {dateCourte(stat.debut)} au {dateCourte(stat.fin)}
              </span>
              <span className="stats__montant">
                {formaterEuros(stat.totaux.recette_centimes)}
              </span>

              <p className="stats__meta">
                {stat.journees} journée{stat.journees > 1 ? 's' : ''} validée
                {stat.journees > 1 ? 's' : ''}
                {stat.evolution_pourcent !== null && (
                  <>
                    {' · '}
                    <span
                      className={`stats__evolution stats__evolution--${
                        stat.evolution_pourcent > 0
                          ? 'hausse'
                          : stat.evolution_pourcent < 0
                            ? 'baisse'
                            : 'stable'
                      }`}
                    >
                      {stat.evolution_pourcent > 0 ? '+' : ''}
                      {stat.evolution_pourcent} %
                    </span>{' '}
                    par rapport aux {stat.etendue_jours} jours précédents
                  </>
                )}
              </p>

              {/* La barre est décorative : les chiffres sont juste en dessous. */}
              <div
                className="barre-parts"
                role="img"
                aria-label={MOYENS.map(
                  ({ cle, libelle }) =>
                    `${libelle} ${stat.parts[cle]} %`,
                ).join(', ')}
              >
                {MOYENS.map(({ cle, libelle }) => (
                  <span
                    key={cle}
                    className={`barre-parts__part barre-parts__part--${cle}`}
                    style={{ flexGrow: Math.max(0, montants[cle]) }}
                    title={`${libelle} : ${formaterEuros(montants[cle])} (${stat.parts[cle]} %)`}
                  />
                ))}
              </div>

              <ul className="legende">
                {MOYENS.map(({ cle, libelle }) => (
                  <li key={cle} className="legende__ligne">
                    <span
                      className={`legende__pastille legende__pastille--${cle}`}
                      aria-hidden="true"
                    />
                    <span className="legende__nom">{libelle}</span>
                    <span className="legende__montant">
                      {formaterEuros(montants[cle])}
                    </span>
                    <span className="legende__part">{stat.parts[cle]} %</span>
                  </li>
                ))}
              </ul>

              {montants.especes < 0 && (
                <p className="panneau__note panneau__note--manque">
                  La recette espèces est négative sur la période : il manque de
                  l'argent par rapport au fond de caisse. Sa part est comptée à zéro.
                </p>
              )}
            </section>

            <section className="carte stats__chiffres">
              <div className="stats__chiffre">
                <span className="etiquette">Moyenne par journée</span>
                <strong>{formaterEuros(stat.moyenne_par_journee)}</strong>
                <span className="stats__appoint">
                  sur les journées travaillées, pas sur les jours du calendrier
                </span>
              </div>

              {stat.meilleure && (
                <div className="stats__chiffre">
                  <span className="etiquette">Meilleure journée</span>
                  <strong>{formaterEuros(stat.meilleure.recette_centimes)}</strong>
                  <span className="stats__appoint">
                    {dateLongue(stat.meilleure.date)}
                  </span>
                </div>
              )}

              <div className="stats__chiffre">
                <span className="etiquette">Part encaissée en espèces</span>
                <strong>{stat.parts.especes} %</strong>
                <span className="stats__appoint">
                  le reste passe par la carte et les chèques
                </span>
              </div>
            </section>
          </div>

          <section className="carte stats__histogramme">
            <header className="stats__entete">
              <div>
                <h2>{titreEvolution}</h2>
                <p>
                  Chaque barre est une recette, découpée par moyen de paiement.
                  Passez dessus pour le détail.
                </p>
              </div>

              {/* Sans repère, une barre ne dit que « plus » ou « moins ».
                  Celui-ci suffit : la plus haute vaut ce montant. */}
              <span className="stats__echelle">
                Plus haute barre
                <strong>{formaterEuros(maximum)}</strong>
              </span>
            </header>

            <div
              className="histogramme"
              role="img"
              aria-label={`Recette ${titreEvolution.toLowerCase()}, du ${dateCourte(stat.debut)} au ${dateCourte(stat.fin)}. Le détail chiffré est dans le journal.`}
            >
              {stat.seaux.map((seau, index) => {
                const depuisLaFin = stat.seaux.length - 1 - index;
                return (
                  <div key={seau.cle} className="histogramme__colonne">
                    <div className="histogramme__piste">
                      <div
                        className="histogramme__barre"
                        style={{
                          height: `${Math.max(2, (seau.recette_centimes * 100) / maximum)}%`,
                        }}
                        title={`${periodeDuSeau(seau, stat.granularite)}\n${formaterEuros(seau.recette_centimes)} au total\nEspèces ${formaterEuros(seau.especes_centimes)}\nCarte ${formaterEuros(seau.cb_centimes)}\nChèques ${formaterEuros(seau.cheques_centimes)}`}
                      >
                        {MOYENS.map(({ cle }) => {
                          const valeur = Math.max(
                            0,
                            cle === 'especes'
                              ? seau.especes_centimes
                              : cle === 'cb'
                                ? seau.cb_centimes
                                : seau.cheques_centimes,
                          );
                          if (valeur === 0) return null;
                          return (
                            <span
                              key={cle}
                              className={`histogramme__part histogramme__part--${cle}`}
                              style={{ flexGrow: valeur }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <span className="histogramme__etiquette">
                      {depuisLaFin % pasEtiquettes === 0
                        ? etiquetteSeau(seau, stat.granularite)
                        : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}

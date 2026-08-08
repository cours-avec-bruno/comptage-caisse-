import { useEffect, useRef, useState } from 'react';
import { api, ErreurApi, type ComptageDuJour } from '../api';
import { ChampEuros } from '../composants/ChampEuros';
import {
  GrilleSaisie,
  detailPourApi,
  nombreCoupures,
  quantitesVides,
  totalSaisie,
  type Quantites,
} from '../composants/GrilleSaisie';
import { MontantAnime } from '../composants/MontantAnime';
import { dateLongue, formaterEuros } from '../format';

interface Props {
  date: string;
  agent: string;
  fondDefautCentimes: number;
  onVersement: () => void;
}

export function EcranComptage({ date, agent, fondDefautCentimes, onVersement }: Props) {
  const [quantites, setQuantites] = useState<Quantites>(quantitesVides);
  const [cbCentimes, setCbCentimes] = useState(0);
  const [chequesNombre, setChequesNombre] = useState(0);
  const [chequesCentimes, setChequesCentimes] = useState(0);
  const [fondCentimes, setFondCentimes] = useState(fondDefautCentimes);
  const [dejaValides, setDejaValides] = useState<ComptageDuJour[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const champCb = useRef<HTMLInputElement>(null);

  useEffect(() => setFondCentimes(fondDefautCentimes), [fondDefautCentimes]);

  const rechargerJournee = () => {
    api
      .comptagesDuJour(date)
      .then((reponse) => setDejaValides(reponse.comptages))
      .catch(() => setDejaValides([]));
  };

  useEffect(rechargerJournee, [date]);

  const especesCentimes = totalSaisie(quantites);
  const recetteEspeces = especesCentimes - fondCentimes;
  const recetteJour = recetteEspeces + cbCentimes + chequesCentimes;
  const rienASaisir =
    especesCentimes === 0 && cbCentimes === 0 && chequesCentimes === 0;

  // Un nombre sans montant, ou l'inverse, est une saisie en cours d'écriture.
  const chequesIncomplets =
    (chequesNombre === 0) !== (chequesCentimes === 0);

  // Ce qui monte au coffre : les espèces et les chèques. Jamais la CB.
  const versementCentimes = especesCentimes + chequesCentimes;

  const valider = async () => {
    setErreur(null);
    setSucces(null);
    setEnCours(true);

    try {
      const reponse = await api.validerJournee({
        date,
        agent,
        detail: detailPourApi(quantites),
        cb_centimes: cbCentimes,
        fond_centimes: fondCentimes,
        cheques_nombre: chequesNombre,
        cheques_centimes: chequesCentimes,
      });

      const verse =
        reponse.comptage.especes_centimes + reponse.comptage.cheques_centimes;
      setSucces(
        verse > 0
          ? `Journée validée. ${formaterEuros(verse)} versés au coffre.`
          : 'Journée validée. Rien à verser au coffre.',
      );
      if (reponse.erreur_sauvegarde) {
        setErreur(
          `Le comptage est enregistré, mais la copie de sauvegarde a échoué : ${reponse.erreur_sauvegarde}`,
        );
      }

      setQuantites(quantitesVides());
      setCbCentimes(0);
      setChequesNombre(0);
      setChequesCentimes(0);
      setFondCentimes(fondDefautCentimes);
      rechargerJournee();
      onVersement();
    } catch (probleme) {
      setErreur(
        probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.',
      );
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <div className="entete-ecran">
        <div>
          <h1>Comptage du jour</h1>
          <p>{dateLongue(date)}</p>
        </div>
      </div>

      <div className="comptage">
        <div className="pile">
          {dejaValides.length > 0 && (
            <div className="message message--attention">
              <span>
                <strong>
                  {dejaValides.length === 1
                    ? 'Une journée a déjà été validée pour cette date'
                    : `${dejaValides.length} comptages ont déjà été validés pour cette date`}
                </strong>{' '}
                ({dejaValides.map((c) => c.agent).join(', ')}). Une ligne validée ne se
                modifie pas : si c'est une correction, saisissez seulement la différence,
                elle s'ajoutera à l'historique.
              </span>
            </div>
          )}

          {succes && <div className="message message--succes">{succes}</div>}
          {erreur && <div className="message message--erreur">{erreur}</div>}

          <GrilleSaisie
            quantites={quantites}
            onChange={setQuantites}
            refSuivante={champCb}
            autoFocus
          />
        </div>

        <aside className="carte panneau">
          <div className="panneau__vedette">
            <span className="etiquette">Espèces comptées</span>
            <MontantAnime centimes={especesCentimes} />
            <span className="ligne-calcul__libelle">
              {nombreCoupures(quantites)} coupures comptées
            </span>
          </div>

          <div className="ligne-calcul ligne-calcul--saisie">
            <label className="ligne-calcul__libelle" htmlFor="fond">
              Fond de caisse
            </label>
            <ChampEuros id="fond" valeur={fondCentimes} onChange={setFondCentimes} />
          </div>

          <div
            className={`ligne-calcul${recetteEspeces < 0 ? ' ligne-calcul--negatif' : ''}`}
          >
            <span className="ligne-calcul__libelle">Recette espèces</span>
            <span className="ligne-calcul__valeur">{formaterEuros(recetteEspeces)}</span>
          </div>

          <div className="ligne-calcul ligne-calcul--saisie">
            <label className="ligne-calcul__libelle" htmlFor="cb">
              Recette CB
            </label>
            <ChampEuros
              id="cb"
              ref={champCb}
              valeur={cbCentimes}
              onChange={setCbCentimes}
            />
          </div>

          <div className="ligne-calcul ligne-calcul--saisie">
            <label className="ligne-calcul__libelle" htmlFor="cheques-montant">
              Chèques
            </label>
            <div className="saisie-cheques">
              <input
                id="cheques-nombre"
                className="champ champ--nombre saisie-cheques__nombre"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Nombre de chèques"
                placeholder="0"
                value={chequesNombre === 0 ? '' : String(chequesNombre)}
                onFocus={(evenement) => evenement.currentTarget.select()}
                onChange={(evenement) =>
                  setChequesNombre(
                    Number(evenement.target.value.replace(/\D/g, '') || 0),
                  )
                }
              />
              <span className="saisie-cheques__pour">pour</span>
              <ChampEuros
                id="cheques-montant"
                valeur={chequesCentimes}
                onChange={setChequesCentimes}
              />
            </div>
          </div>

          {chequesIncomplets && (
            <p className="panneau__note panneau__note--alerte">
              {chequesNombre === 0
                ? 'Indiquez combien de chèques composent ce montant.'
                : 'Indiquez le montant total des chèques.'}
            </p>
          )}

          <div
            className={`ligne-calcul ligne-calcul--totale${recetteJour < 0 ? ' ligne-calcul--negatif' : ''}`}
          >
            <span className="ligne-calcul__libelle">Recette du jour</span>
            <span className="ligne-calcul__valeur">{formaterEuros(recetteJour)}</span>
          </div>

          <div className="panneau__pied">
            <button
              type="button"
              className="bouton bouton--valider"
              disabled={enCours || rienASaisir || chequesIncomplets || !agent}
              onClick={valider}
            >
              {enCours ? 'Enregistrement…' : 'Valider et verser au coffre'}
            </button>

            <p className="panneau__note">
              {!agent
                ? 'Sélectionnez vos initiales en haut à droite.'
                : rienASaisir
                  ? 'Comptez au moins une coupure ou saisissez la recette CB.'
                  : chequesIncomplets
                    ? 'Complétez la ligne des chèques.'
                    : `${formaterEuros(versementCentimes)} monteront au coffre${chequesCentimes > 0 ? ' (espèces et chèques)' : ''}. La CB n'y entre jamais.`}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

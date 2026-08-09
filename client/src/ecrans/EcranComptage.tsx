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
import { ModaleFondDeCaisse } from './ModaleFondDeCaisse';
import { dateLongue, formaterEuros } from '../format';

interface Props {
  date: string;
  agent: string;
  fondDefautCentimes: number;
  fondComposition: Record<number, number>;
  onVersement: () => void;
}

export function EcranComptage({
  date,
  agent,
  fondDefautCentimes,
  fondComposition,
  onVersement,
}: Props) {
  const [quantites, setQuantites] = useState<Quantites>(quantitesVides);
  const [cbCentimes, setCbCentimes] = useState(0);
  const [chequesCentimes, setChequesCentimes] = useState(0);
  const [dejaValides, setDejaValides] = useState<ComptageDuJour[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const champCb = useRef<HTMLInputElement>(null);

  // La feuille du fond s'ouvre depuis son bouton et y retourne.
  const [origineFond, setOrigineFond] = useState<{ x: number; y: number } | null>(
    null,
  );

  const rechargerJournee = () => {
    api
      .comptagesDuJour(date)
      .then((reponse) => setDejaValides(reponse.comptages))
      .catch(() => setDejaValides([]));
  };

  useEffect(rechargerJournee, [date]);

  const especesCentimes = totalSaisie(quantites);
  const coupuresComptees = nombreCoupures(quantites);
  // Le fond est fixe : il vient des paramètres, pas de la saisie du soir.
  const recetteEspeces = especesCentimes - fondDefautCentimes;
  const recetteJour = recetteEspeces + cbCentimes + chequesCentimes;
  const rienASaisir =
    especesCentimes === 0 && cbCentimes === 0 && chequesCentimes === 0;

  // Tant que le tiroir n'a pas été compté, retrancher le fond revient à le
  // soustraire de rien : l'écran annonçait « − 100,00 € » en rouge à l'agent
  // qui n'avait encore rien saisi, alors qu'il ne manquait rien du tout.
  // On n'affiche pas un chiffre qui n'existe pas encore.
  const enAttenteDuComptage = fondDefautCentimes > 0 && coupuresComptees === 0;
  // Un vrai manque, lui, se dit — et se chiffre.
  const manqueCentimes = Math.max(0, -recetteEspeces);

  // Ce qui monte au coffre : les espèces moins le fond, plus les chèques.
  // Jamais la CB, jamais le fond.
  const versementCentimes = Math.max(0, especesCentimes - fondDefautCentimes) + chequesCentimes;

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
        cheques_centimes: chequesCentimes,
      });

      const verse = reponse.comptage.verse_centimes;
      setSucces(
        verse > 0
          ? `Journée validée. ${formaterEuros(verse)} versés au coffre, le fond reste dans le tiroir.`
          : 'Journée validée. Rien à verser au coffre.',
      );
      if (reponse.erreur_sauvegarde) {
        setErreur(
          `Le comptage est enregistré, mais la copie de sauvegarde a échoué : ${reponse.erreur_sauvegarde}`,
        );
      }

      setQuantites(quantitesVides());
      setCbCentimes(0);
      setChequesCentimes(0);
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
              {coupuresComptees} {coupuresComptees < 2 ? 'coupure comptée' : 'coupures comptées'}
            </span>
          </div>

          <div className="ligne-calcul">
            <span className="ligne-calcul__libelle">
              <span className="ligne-calcul__avec-action">
                Fond de caisse
                <button
                  type="button"
                  className="bouton-icone"
                  aria-label="Modifier la composition du fond de caisse"
                  title="Modifier la composition du fond de caisse"
                  onClick={(evenement) => {
                    const rect = evenement.currentTarget.getBoundingClientRect();
                    setOrigineFond({
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    });
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                    <path d="M14.5 6.5 17.5 9.5" />
                  </svg>
                </button>
              </span>
              <span className="ligne-calcul__appoint">laissé dans le tiroir</span>
            </span>
            <span className="ligne-calcul__valeur">
              − {formaterEuros(fondDefautCentimes)}
            </span>
          </div>

          <div
            className={`ligne-calcul${
              enAttenteDuComptage
                ? ' ligne-calcul--attente'
                : recetteEspeces < 0
                  ? ' ligne-calcul--negatif'
                  : ''
            }`}
          >
            <span className="ligne-calcul__libelle">
              Recette espèces
              {enAttenteDuComptage && (
                <span className="ligne-calcul__appoint">une fois le tiroir compté</span>
              )}
            </span>
            <span className="ligne-calcul__valeur">
              {enAttenteDuComptage ? '—' : formaterEuros(recetteEspeces)}
            </span>
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
            <label className="ligne-calcul__libelle" htmlFor="cheques">
              Chèques
            </label>
            <ChampEuros
              id="cheques"
              valeur={chequesCentimes}
              onChange={setChequesCentimes}
            />
          </div>

          <div
            className={`ligne-calcul ligne-calcul--totale${
              enAttenteDuComptage
                ? ' ligne-calcul--attente'
                : recetteJour < 0
                  ? ' ligne-calcul--negatif'
                  : ''
            }`}
          >
            <span className="ligne-calcul__libelle">Recette du jour</span>
            <span className="ligne-calcul__valeur">
              {enAttenteDuComptage ? '—' : formaterEuros(recetteJour)}
            </span>
          </div>

          <div className="panneau__pied">
            <button
              type="button"
              className="bouton bouton--valider"
              disabled={enCours || rienASaisir || enAttenteDuComptage || !agent}
              onClick={valider}
            >
              {enCours ? 'Enregistrement…' : 'Valider et verser au coffre'}
            </button>

            <p
              className={`panneau__note${
                !enAttenteDuComptage && manqueCentimes > 0
                  ? ' panneau__note--manque'
                  : ''
              }`}
            >
              {!agent
                ? 'Sélectionnez vos initiales en haut à droite.'
                : enAttenteDuComptage
                  ? `Comptez le tiroir pour voir la recette. Le fond de caisse (${formaterEuros(fondDefautCentimes)}) doit s'y retrouver : il reste sur place.`
                  : rienASaisir
                    ? 'Comptez au moins une coupure ou saisissez la recette CB.'
                    : manqueCentimes > 0
                      ? `Il manque ${formaterEuros(manqueCentimes)} pour reconstituer le fond de caisse. Recomptez avant de valider.`
                      : `${formaterEuros(versementCentimes)} monteront au coffre. Le fond reste dans le tiroir, la CB n'y entre jamais.`}
            </p>
          </div>
        </aside>
      </div>

      {origineFond && (
        <ModaleFondDeCaisse
          composition={fondComposition}
          origine={origineFond}
          onFermer={() => setOrigineFond(null)}
          onEnregistre={onVersement}
        />
      )}
    </>
  );
}

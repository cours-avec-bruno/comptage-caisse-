import { useRef, useState } from 'react';
import { api, ErreurApi, type Cheques, type LigneInventaire } from '../api';
import {
  GrilleSaisie,
  detailPourApi,
  quantitesVides,
  totalSaisie,
  type Quantites,
} from '../composants/GrilleSaisie';
import { ChampEuros } from '../composants/ChampEuros';
import { Modale } from '../composants/Modale';
import { formaterEuros } from '../format';
import { libelleCourt } from '../coupures';

interface Props {
  date: string;
  agent: string;
  inventaire: LigneInventaire[];
  cheques: Cheques;
  origine?: { x: number; y: number } | null;
  onFermer: () => void;
  onEnregistree: (montantCentimes: number) => void;
}

const MOTIFS_COURANTS = ['Remise en banque', 'Appro monnaie', 'Achat'];

/**
 * Sortie du coffre. Elle se saisit par coupures, jamais par montant :
 * un montant global rendrait l'inventaire faux dès la première remise
 * en banque.
 */
export function ModaleSortie({
  date,
  agent,
  inventaire,
  cheques,
  origine,
  onFermer,
  onEnregistree,
}: Props) {
  const [quantites, setQuantites] = useState<Quantites>(quantitesVides);
  const [chequesCentimes, setChequesCentimes] = useState(0);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const champMotif = useRef<HTMLInputElement>(null);

  const stock = Object.fromEntries(
    inventaire.map((ligne) => [ligne.coupure_centimes, ligne.quantite]),
  ) as Record<number, number>;

  const detail = detailPourApi(quantites);
  const total = totalSaisie(quantites) + chequesCentimes;

  const depassements = Object.entries(detail)
    .filter(([coupure, quantite]) => quantite > (stock[Number(coupure)] ?? 0))
    .map(([coupure]) => Number(coupure))
    .sort((a, b) => a - b);

  const motifRenseigne = motif.trim().length > 0;
  const chequesTropEleves = chequesCentimes > cheques.centimes;

  const bloque =
    enCours ||
    total === 0 ||
    depassements.length > 0 ||
    chequesTropEleves ||
    !motifRenseigne ||
    !agent;

  const enregistrer = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await api.sortieCoffre({
        date,
        agent,
        motif: motif.trim(),
        detail,
        cheques_centimes: chequesCentimes,
      });
      onEnregistree(reponse.sortie.montant_centimes);
    } catch (probleme) {
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modale
      titre="Sortie du coffre"
      sousTitre="Saisissez les coupures réellement retirées, pas un montant."
      origine={origine}
      onFermer={onFermer}
      pied={
        <>
          <span className="feuille__total">
            À retirer <strong>{formaterEuros(total)}</strong>
          </span>
          <div className="feuille__actions">
            <button type="button" className="bouton" onClick={onFermer}>
              Annuler
            </button>
            <button
              type="button"
              className="bouton bouton--principal"
              disabled={bloque}
              onClick={enregistrer}
            >
              {enCours ? 'Enregistrement…' : 'Confirmer la sortie'}
            </button>
          </div>
        </>
      }
    >
      {erreur && <div className="message message--erreur">{erreur}</div>}

      {depassements.length > 0 && (
        <div className="message message--erreur">
          <span>
            Le coffre ne contient pas autant de{' '}
            <strong>{depassements.map(libelleCourt).join(', ')}</strong>. Corrigez ces
            lignes avant de confirmer.
          </span>
        </div>
      )}

      {chequesTropEleves && (
        <div className="message message--erreur">
          <span>
            Le coffre ne contient que <strong>{formaterEuros(cheques.centimes)}</strong>{' '}
            de chèques.
          </span>
        </div>
      )}

      <div>
        <label className="etiquette" htmlFor="motif">
          Motif de la sortie (obligatoire)
        </label>
        <input
          id="motif"
          ref={champMotif}
          className="champ"
          type="text"
          autoComplete="off"
          list="motifs-courants"
          placeholder="Remise en banque, appro monnaie, achat…"
          value={motif}
          onChange={(evenement) => setMotif(evenement.target.value)}
        />
        <datalist id="motifs-courants">
          {MOTIFS_COURANTS.map((valeur) => (
            <option key={valeur} value={valeur} />
          ))}
        </datalist>
      </div>

      <GrilleSaisie
        quantites={quantites}
        onChange={setQuantites}
        stock={stock}
        refSuivante={champMotif}
        compact
        autoFocus
      />

      {cheques.centimes > 0 && (
        <div className="sortie-cheques">
          <div>
            <label className="etiquette" htmlFor="sortie-cheques">
              Chèques à sortir
            </label>
            <p className="sortie-cheques__stock">
              Au coffre : {formaterEuros(cheques.centimes)}
            </p>
          </div>

          <ChampEuros
            id="sortie-cheques"
            valeur={chequesCentimes}
            onChange={setChequesCentimes}
          />

          <button
            type="button"
            className="bouton bouton--discret"
            onClick={() => setChequesCentimes(cheques.centimes)}
          >
            Tout sortir
          </button>
        </div>
      )}
    </Modale>
  );
}

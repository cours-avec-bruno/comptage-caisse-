import { useRef, useState } from 'react';
import { api, ErreurApi, type LigneInventaire } from '../api';
import {
  GrilleSaisie,
  detailPourApi,
  quantitesVides,
  totalSaisie,
  type Quantites,
} from '../composants/GrilleSaisie';
import { Modale } from '../composants/Modale';
import { formaterEuros } from '../format';
import { libelleCourt } from '../coupures';

interface Props {
  date: string;
  agent: string;
  inventaire: LigneInventaire[];
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
  onFermer,
  onEnregistree,
}: Props) {
  const [quantites, setQuantites] = useState<Quantites>(quantitesVides);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const champMotif = useRef<HTMLInputElement>(null);

  const stock = Object.fromEntries(
    inventaire.map((ligne) => [ligne.coupure_centimes, ligne.quantite]),
  ) as Record<number, number>;

  const detail = detailPourApi(quantites);
  const total = totalSaisie(quantites);

  const depassements = Object.entries(detail)
    .filter(([coupure, quantite]) => quantite > (stock[Number(coupure)] ?? 0))
    .map(([coupure]) => Number(coupure))
    .sort((a, b) => a - b);

  const motifRenseigne = motif.trim().length > 0;
  const bloque =
    enCours || total === 0 || depassements.length > 0 || !motifRenseigne || !agent;

  const enregistrer = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await api.sortieCoffre({
        date,
        agent,
        motif: motif.trim(),
        detail,
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
      onFermer={onFermer}
      pied={
        <>
          <span className="modale__total">
            À retirer <strong>{formaterEuros(total)}</strong>
          </span>
          <div className="modale__actions">
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
    </Modale>
  );
}

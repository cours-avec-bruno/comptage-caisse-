import { useState } from 'react';
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
  origine?: { x: number; y: number } | null;
  onFermer: () => void;
  onEnregistre: (montantCentimes: number) => void;
}

const MOTIFS_COURANTS = [
  'Monnaie sur un billet de 50',
  'Monnaie pour le tiroir',
  'Regroupement en liasses',
];

/**
 * Faire la monnaie sur le coffre.
 *
 * On donne des coupures, on en reprend pour le même montant : le solde ne
 * bouge pas, seule la composition change. Les deux colonnes se saisissent
 * comme le comptage, et l'écart entre elles est affiché en permanence — c'est
 * la seule chose à surveiller pendant la saisie.
 */
export function ModaleChange({
  date,
  agent,
  inventaire,
  origine,
  onFermer,
  onEnregistre,
}: Props) {
  const [entrantes, setEntrantes] = useState<Quantites>(quantitesVides);
  const [sortantes, setSortantes] = useState<Quantites>(quantitesVides);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const stock = Object.fromEntries(
    inventaire.map((ligne) => [ligne.coupure_centimes, ligne.quantite]),
  ) as Record<number, number>;

  const donne = totalSaisie(entrantes);
  const repris = totalSaisie(sortantes);
  const ecart = donne - repris;

  const detailEntrantes = detailPourApi(entrantes);
  const detailSortantes = detailPourApi(sortantes);

  // Ce que le coffre perd réellement : la reprise moins ce qu'on lui redonne
  // de la même coupure. Sans cette compensation, échanger 3 × 10 € contre
  // 1 × 20 € + 1 × 10 € se plaindrait d'un manque de billets de 10 alors que
  // l'un d'eux revient aussitôt.
  const depassements = Object.entries(detailSortantes)
    .map(([coupure, quantite]) => ({
      coupure: Number(coupure),
      net: quantite - (detailEntrantes[Number(coupure)] ?? 0),
    }))
    .filter(({ coupure, net }) => net > (stock[coupure] ?? 0))
    .map(({ coupure }) => coupure)
    .sort((a, b) => a - b);

  const rienASaisir = donne === 0 && repris === 0;
  const identique =
    !rienASaisir &&
    ecart === 0 &&
    Object.keys({ ...detailEntrantes, ...detailSortantes }).every(
      (coupure) =>
        (detailEntrantes[Number(coupure)] ?? 0) ===
        (detailSortantes[Number(coupure)] ?? 0),
    );

  const bloque =
    enCours || rienASaisir || ecart !== 0 || identique || depassements.length > 0 || !agent;

  const enregistrer = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await api.changeCoffre({
        date,
        agent,
        motif: motif.trim(),
        entrantes: detailEntrantes,
        sortantes: detailSortantes,
      });
      onEnregistre(reponse.change.montant_centimes);
    } catch (probleme) {
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modale
      titre="Faire la monnaie"
      sousTitre="Le solde du coffre ne bouge pas : seules les coupures changent."
      origine={origine}
      large
      onFermer={onFermer}
      pied={
        <>
          <span
            className={`feuille__total${ecart !== 0 && !rienASaisir ? ' feuille__total--manque' : ''}`}
          >
            {rienASaisir ? (
              'Rien à échanger'
            ) : ecart === 0 ? (
              <>
                Échange <strong>{formaterEuros(donne)}</strong>
              </>
            ) : (
              <>
                {ecart > 0 ? 'À reprendre encore' : 'À donner encore'}{' '}
                <strong>{formaterEuros(Math.abs(ecart))}</strong>
              </>
            )}
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
              {enCours ? 'Enregistrement…' : 'Confirmer le change'}
            </button>
          </div>
        </>
      }
    >
      {erreur && <div className="message message--erreur">{erreur}</div>}

      {depassements.length > 0 && (
        <div className="message message--erreur">
          <span>
            Le coffre n'a pas assez de{' '}
            <strong>{depassements.map(libelleCourt).join(', ')}</strong> pour rendre
            cette monnaie.
          </span>
        </div>
      )}

      {identique && (
        <div className="message message--attention">
          <span>
            Vous donnez et vous reprenez exactement les mêmes coupures : ce change ne
            changerait rien.
          </span>
        </div>
      )}

      <div className="change">
        <section className="change__cote">
          <header className="change__entete">
            <span className="etiquette">Vous donnez au coffre</span>
          </header>
          <GrilleSaisie
            quantites={entrantes}
            onChange={setEntrantes}
            prefixeId="change-donne"
            compact
            serree
            autoFocus
          />
        </section>

        <section className="change__cote">
          <header className="change__entete">
            <span className="etiquette">Vous reprenez</span>
          </header>
          <GrilleSaisie
            quantites={sortantes}
            onChange={setSortantes}
            stock={stock}
            prefixeId="change-reprend"
            compact
            serree
          />
        </section>
      </div>

      <div>
        <label className="etiquette" htmlFor="motif-change">
          Motif (facultatif)
        </label>
        <input
          id="motif-change"
          className="champ"
          type="text"
          autoComplete="off"
          list="motifs-change"
          placeholder="Monnaie"
          value={motif}
          onChange={(evenement) => setMotif(evenement.target.value)}
        />
        <datalist id="motifs-change">
          {MOTIFS_COURANTS.map((valeur) => (
            <option key={valeur} value={valeur} />
          ))}
        </datalist>
      </div>
    </Modale>
  );
}

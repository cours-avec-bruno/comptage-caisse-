import { useState } from 'react';
import type { EtatCoffre } from '../api';
import { Jeton } from '../composants/Jeton';
import { COUPURES } from '../coupures';
import { dateLongue, formaterEuros } from '../format';
import { ModaleSortie } from './ModaleSortie';

interface Props {
  coffre: EtatCoffre;
  date: string;
  agent: string;
  onChangement: () => void;
}

const libelleDe = (centimes: number) =>
  COUPURES.find((coupure) => coupure.valeur === centimes)?.libelle ??
  `${centimes} centimes`;

export function EcranCoffre({ coffre, date, agent, onChangement }: Props) {
  // Un seul chiffre par défaut : le détail ne s'affiche jamais d'office.
  const [detailVisible, setDetailVisible] = useState(false);
  const [sortieOuverte, setSortieOuverte] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const coffreVide = coffre.solde_centimes === 0;

  return (
    <>
      <div className="entete-ecran">
        <div>
          <h1>Coffre</h1>
          <p>Ce chiffre doit correspondre à ce qu'on trouve en ouvrant la porte.</p>
        </div>
      </div>

      {message && (
        <div className="message message--succes" style={{ marginBottom: 'var(--gouttiere)' }}>
          {message}
        </div>
      )}

      <div className="carte coffre-solde">
        <div>
          <span className="etiquette">Solde du coffre</span>
          <span className="coffre-solde__chiffre">
            {formaterEuros(coffre.solde_centimes)}
          </span>
          <p className="coffre-solde__meta">
            {coffre.dernier_versement
              ? `Dernier versement le ${dateLongue(coffre.dernier_versement.date)} par ${coffre.dernier_versement.agent}`
              : 'Aucun versement enregistré pour le moment'}
          </p>
        </div>

        <div className="coffre-solde__actions">
          <button
            type="button"
            className="bouton"
            aria-expanded={detailVisible}
            onClick={() => setDetailVisible((visible) => !visible)}
          >
            {detailVisible ? 'Masquer le détail' : 'Voir le détail'}
          </button>
          <button
            type="button"
            className="bouton bouton--principal"
            disabled={coffreVide || !agent}
            title={
              coffreVide
                ? 'Le coffre est vide'
                : !agent
                  ? 'Sélectionnez vos initiales en haut à droite'
                  : undefined
            }
            onClick={() => {
              setMessage(null);
              setSortieOuverte(true);
            }}
          >
            Sortie du coffre
          </button>
        </div>
      </div>

      {detailVisible && (
        <div className="carte coffre-detail">
          <table className="tableau">
            <thead>
              <tr>
                <th>Coupure</th>
                <th className="col-nombre">Quantité</th>
                <th className="col-nombre">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {coffre.inventaire.map((ligne) => (
                <tr
                  key={ligne.coupure_centimes}
                  className={ligne.quantite === 0 ? 'ligne-absente' : undefined}
                >
                  <td>
                    <span className="cellule-coupure">
                      <Jeton valeur={ligne.coupure_centimes} compact />
                      <span className="cellule-coupure__nom">
                        {libelleDe(ligne.coupure_centimes)}
                      </span>
                    </span>
                  </td>
                  <td className="col-nombre">{ligne.quantite}</td>
                  <td className="col-nombre">{formaterEuros(ligne.valeur_centimes)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="col-nombre">
                  {coffre.inventaire.reduce((somme, l) => somme + l.quantite, 0)}
                </td>
                <td className="col-nombre">{formaterEuros(coffre.solde_centimes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {sortieOuverte && (
        <ModaleSortie
          date={date}
          agent={agent}
          inventaire={coffre.inventaire}
          onFermer={() => setSortieOuverte(false)}
          onEnregistree={(montant) => {
            setSortieOuverte(false);
            setMessage(`Sortie enregistrée : ${formaterEuros(montant)} retirés du coffre.`);
            onChangement();
          }}
        />
      )}
    </>
  );
}

import { useState } from 'react';
import type { EtatCoffre, LigneCaisse } from '../api';
import { Jeton } from '../composants/Jeton';
import { COUPURES } from '../coupures';
import { dateLongue, formaterEuros } from '../format';
import { ModaleChange } from './ModaleChange';
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

/** Une caisse dépliée : ce qui doit s'y trouver, coupure par coupure. */
function TableauCaisse({
  lignes,
  vide,
  libelleTotal = 'Total',
}: {
  lignes: (LigneCaisse & { liasses?: number })[];
  vide: string;
  /** En caisse rouge, les chèques sont comptés à part : le pied ne
      totalise que les coupures, et il doit le dire. */
  libelleTotal?: string;
}) {
  const total = lignes.reduce((somme, l) => somme + l.valeur_centimes, 0);
  const aQuelqueChose = lignes.some((l) => l.quantite > 0);

  if (!aQuelqueChose) {
    return <p className="caisse__vide">{vide}</p>;
  }

  return (
    <table className="tableau">
      <thead>
        <tr>
          <th>Coupure</th>
          <th className="col-nombre">Quantité</th>
          <th className="col-nombre">Valeur</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((ligne) => (
          <tr
            key={ligne.coupure_centimes}
            className={ligne.quantite === 0 ? 'ligne-absente' : undefined}
          >
            <td>
              <span className="cellule-coupure">
                <Jeton valeur={ligne.coupure_centimes} compact />
                <span className="cellule-coupure__nom">
                  {libelleDe(ligne.coupure_centimes)}
                  {ligne.liasses ? (
                    <span className="cellule-coupure__liasses">
                      {ligne.liasses} liasse{ligne.liasses > 1 ? 's' : ''} de 10
                    </span>
                  ) : null}
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
          <td>{libelleTotal}</td>
          <td className="col-nombre">
            {lignes.reduce((somme, l) => somme + l.quantite, 0)}
          </td>
          <td className="col-nombre">{formaterEuros(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function EcranCoffre({ coffre, date, agent, onChangement }: Props) {
  // Un seul chiffre par défaut : le détail ne s'affiche jamais d'office.
  const [detailVisible, setDetailVisible] = useState(false);
  // On retient d'où la feuille a été ouverte : elle en émerge et y retourne.
  const [origineSortie, setOrigineSortie] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [origineChange, setOrigineChange] = useState<{ x: number; y: number } | null>(
    null,
  );

  const depuisLeBouton = (evenement: React.MouseEvent<HTMLButtonElement>) => {
    const rect = evenement.currentTarget.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const [message, setMessage] = useState<string | null>(null);

  const coffreVide = coffre.solde_centimes === 0;
  const { grise, rouge } = coffre.repartition;

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

          {/* Les deux caisses restent en second plan : le chiffre du dessus
              est celui qu'on vérifie, ceux-ci disent seulement où c'est rangé. */}
          <div className="coffre-solde__caisses">
            <span className="pastille-caisse pastille-caisse--grise">
              Caisse grise <strong>{formaterEuros(grise.total_centimes)}</strong>
            </span>
            <span className="pastille-caisse pastille-caisse--rouge">
              Caisse rouge <strong>{formaterEuros(rouge.total_centimes)}</strong>
            </span>
            {rouge.cheques.centimes > 0 && (
              <span className="coffre-solde__cheques">
                dont {formaterEuros(rouge.cheques.centimes)} de chèques
              </span>
            )}
          </div>

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
            className="bouton"
            disabled={coffreVide || !agent}
            title={
              coffreVide
                ? 'Le coffre est vide'
                : !agent
                  ? 'Sélectionnez vos initiales en haut à droite'
                  : 'Échanger des coupures sans toucher au solde'
            }
            onClick={(evenement) => {
              setMessage(null);
              setOrigineChange(depuisLeBouton(evenement));
            }}
          >
            Faire la monnaie
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
            onClick={(evenement) => {
              setMessage(null);
              setOrigineSortie(depuisLeBouton(evenement));
            }}
          >
            Sortie du coffre
          </button>
        </div>
      </div>

      {detailVisible && (
        <div className="coffre-caisses">
          <section className="carte caisse caisse--grise">
            <header className="caisse__entete">
              <div>
                <h2>
                  <span className="caisse__puce" aria-hidden="true" />
                  Caisse grise
                </h2>
                <p>Le courant : pièces, et les billets qui ne font pas encore liasse.</p>
              </div>
              <span className="caisse__total">
                {formaterEuros(grise.total_centimes)}
              </span>
            </header>
            <TableauCaisse lignes={grise.lignes} vide="Caisse grise vide." />
          </section>

          <section className="carte caisse caisse--rouge">
            <header className="caisse__entete">
              <div>
                <h2>
                  <span className="caisse__puce" aria-hidden="true" />
                  Caisse rouge
                </h2>
                <p>
                  Les liasses de 10, tous les billets de 50 € et les chèques, quel que
                  soit leur nombre.
                </p>
              </div>
              <span className="caisse__total">
                {formaterEuros(rouge.total_centimes)}
              </span>
            </header>

            {rouge.cheques.centimes > 0 && (
              <div className="caisse__cheques">
                <span>Chèques</span>
                <strong>{formaterEuros(rouge.cheques.centimes)}</strong>
              </div>
            )}

            <TableauCaisse
              lignes={rouge.lignes}
              libelleTotal={
                rouge.cheques.centimes > 0 ? 'Total des billets' : 'Total'
              }
              vide={
                rouge.cheques.centimes > 0
                  ? 'Aucun billet en caisse rouge, seulement des chèques.'
                  : 'Caisse rouge vide.'
              }
            />
          </section>
        </div>
      )}

      {origineChange && (
        <ModaleChange
          date={date}
          agent={agent}
          inventaire={coffre.inventaire}
          origine={origineChange}
          onFermer={() => setOrigineChange(null)}
          onEnregistre={(montant) => {
            setOrigineChange(null);
            setMessage(
              `Change enregistré : ${formaterEuros(montant)} échangés, le solde du coffre est inchangé.`,
            );
            onChangement();
          }}
        />
      )}

      {origineSortie && (
        <ModaleSortie
          date={date}
          agent={agent}
          inventaire={coffre.inventaire}
          cheques={coffre.cheques}
          origine={origineSortie}
          onFermer={() => setOrigineSortie(null)}
          onEnregistree={(montant) => {
            setOrigineSortie(null);
            setMessage(`Sortie enregistrée : ${formaterEuros(montant)} retirés du coffre.`);
            onChangement();
          }}
        />
      )}
    </>
  );
}

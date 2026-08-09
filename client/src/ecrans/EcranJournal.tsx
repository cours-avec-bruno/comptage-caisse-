import { api, type Journal, type MouvementCoffre } from '../api';
import { libelleCourt } from '../coupures';
import { dateCourte, formaterEuros } from '../format';

interface Props {
  journal: Journal;
  mouvements: MouvementCoffre[];
}

const LIBELLE_MOUVEMENT = {
  versement: 'Versement',
  sortie: 'Sortie',
  change: 'Change',
} as const;

/**
 * Le détail d'un mouvement, coupure par coupure : « + 1 × 50 €, − 5 × 10 € ».
 * C'est ce qui rend un change lisible — le montant, lui, est nul par
 * construction.
 */
function DetailMouvement({ mouvement }: { mouvement: MouvementCoffre }) {
  const morceaux = mouvement.detail
    .filter((ligne) => ligne.quantite !== 0)
    .sort((a, b) => b.coupure_centimes - a.coupure_centimes);

  if (morceaux.length === 0 && mouvement.cheques_centimes === 0) {
    return <span className="montant-nul">—</span>;
  }

  return (
    <span className="detail-mouvement">
      {morceaux.map((ligne) => (
        <span
          key={ligne.coupure_centimes}
          className={`detail-mouvement__part${ligne.quantite < 0 ? ' detail-mouvement__part--sortante' : ''}`}
        >
          {ligne.quantite > 0 ? '+' : '−'} {Math.abs(ligne.quantite)} ×{' '}
          {libelleCourt(ligne.coupure_centimes)}
        </span>
      ))}
      {mouvement.cheques_centimes !== 0 && (
        <span
          className={`detail-mouvement__part${mouvement.cheques_centimes < 0 ? ' detail-mouvement__part--sortante' : ''}`}
        >
          {mouvement.cheques_centimes > 0 ? '+' : '−'}{' '}
          {formaterEuros(Math.abs(mouvement.cheques_centimes))} de chèques
        </span>
      )}
    </span>
  );
}

const montant = (centimes: number) => (
  <span className={centimes < 0 ? 'montant-negatif' : undefined}>
    {formaterEuros(centimes)}
  </span>
);

export function EcranJournal({ journal, mouvements }: Props) {
  const { lignes, cumul } = journal;

  return (
    <>
      <div className="entete-ecran">
        <div>
          <h1>Journal</h1>
          <p>
            {lignes.length === 0
              ? 'Aucune journée validée pour le moment.'
              : `${lignes.length} journée${lignes.length > 1 ? 's' : ''} validée${lignes.length > 1 ? 's' : ''}, de la plus récente à la plus ancienne.`}
          </p>
        </div>

        <div className="entete-ecran__actions">
          <button
            type="button"
            className="bouton"
            onClick={() => void api.exporter('comptages')}
          >
            Exporter le journal (CSV)
          </button>
          <button
            type="button"
            className="bouton"
            onClick={() => void api.exporter('mouvements')}
          >
            Exporter les mouvements (CSV)
          </button>
        </div>
      </div>

      <div className="carte" style={{ overflow: 'hidden' }}>
        <table className="tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th>Agent</th>
              <th className="col-nombre">Espèces</th>
              <th className="col-nombre">Fond</th>
              <th className="col-nombre">Recette espèces</th>
              <th className="col-nombre">CB</th>
              <th className="col-nombre">Chèques</th>
              <th className="col-nombre">Recette du jour</th>
            </tr>
          </thead>

          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td className="tableau__vide" colSpan={8}>
                  Le journal se remplira à la première journée validée.
                </td>
              </tr>
            ) : (
              lignes.map((ligne) => (
                <tr key={ligne.id}>
                  <td>{dateCourte(ligne.date)}</td>
                  <td>
                    <span className="badge-agent">{ligne.agent}</span>
                  </td>
                  <td className="col-nombre">{formaterEuros(ligne.especes_centimes)}</td>
                  <td className="col-nombre">{formaterEuros(ligne.fond_centimes)}</td>
                  <td className="col-nombre">
                    {montant(ligne.recette_especes_centimes)}
                  </td>
                  <td className="col-nombre">{formaterEuros(ligne.cb_centimes)}</td>
                  <td className="col-nombre">
                    {ligne.cheques_centimes > 0 ? (
                      formaterEuros(ligne.cheques_centimes)
                    ) : (
                      <span className="montant-nul">—</span>
                    )}
                  </td>
                  <td className="col-nombre">{montant(ligne.recette_centimes)}</td>
                </tr>
              ))
            )}
          </tbody>

          {lignes.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Cumul</td>
                <td className="col-nombre">{formaterEuros(cumul.especes_centimes)}</td>
                <td className="col-nombre" />
                <td className="col-nombre">
                  {montant(cumul.recette_especes_centimes)}
                </td>
                <td className="col-nombre">{formaterEuros(cumul.cb_centimes)}</td>
                <td className="col-nombre">
                  {formaterEuros(cumul.cheques_centimes)}
                </td>
                <td className="col-nombre">{montant(cumul.recette_centimes)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="entete-ecran entete-ecran--section">
        <div>
          <h2>Mouvements du coffre</h2>
          <p>
            Tout ce qui est entré, sorti ou a été échangé. Un change ne fait pas
            varier le solde : il ne déplace que des coupures.
          </p>
        </div>
      </div>

      <div className="carte" style={{ overflow: 'hidden' }}>
        <table className="tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th>Agent</th>
              <th>Mouvement</th>
              <th>Motif</th>
              <th>Détail</th>
              <th className="col-nombre">Effet sur le solde</th>
            </tr>
          </thead>

          <tbody>
            {mouvements.length === 0 ? (
              <tr>
                <td className="tableau__vide" colSpan={6}>
                  Aucun mouvement de coffre pour le moment.
                </td>
              </tr>
            ) : (
              mouvements.map((mouvement) => (
                <tr key={mouvement.id}>
                  <td>{dateCourte(mouvement.date)}</td>
                  <td>
                    <span className="badge-agent">{mouvement.agent}</span>
                  </td>
                  <td>
                    <span
                      className={`pastille-mouvement pastille-mouvement--${mouvement.type}`}
                    >
                      {LIBELLE_MOUVEMENT[mouvement.type]}
                    </span>
                  </td>
                  <td>{mouvement.motif}</td>
                  <td>
                    <DetailMouvement mouvement={mouvement} />
                  </td>
                  <td className="col-nombre">
                    {mouvement.type === 'change' ? (
                      <span
                        className="montant-nul"
                        title={`${formaterEuros(mouvement.entrees_centimes)} échangés, le solde ne bouge pas`}
                      >
                        {formaterEuros(0)}
                      </span>
                    ) : (
                      montant(mouvement.montant_centimes)
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

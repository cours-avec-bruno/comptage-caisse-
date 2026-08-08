import { api, type Journal } from '../api';
import { dateCourte, formaterEuros } from '../format';

interface Props {
  journal: Journal;
}

const montant = (centimes: number) => (
  <span className={centimes < 0 ? 'montant-negatif' : undefined}>
    {formaterEuros(centimes)}
  </span>
);

export function EcranJournal({ journal }: Props) {
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
                    {ligne.cheques_nombre > 0 ? (
                      <>
                        {formaterEuros(ligne.cheques_centimes)}
                        <span className="cellule-appoint">
                          {ligne.cheques_nombre} chq
                        </span>
                      </>
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
                  {cumul.cheques_nombre > 0 && (
                    <span className="cellule-appoint">{cumul.cheques_nombre} chq</span>
                  )}
                </td>
                <td className="col-nombre">{montant(cumul.recette_centimes)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

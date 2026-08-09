import { useState } from 'react';
import { api, ErreurApi } from '../api';
import {
  GrilleSaisie,
  detailPourApi,
  nombreCoupures,
  totalSaisie,
  type Quantites,
} from '../composants/GrilleSaisie';
import { Modale } from '../composants/Modale';
import { formaterEuros } from '../format';

interface Props {
  composition: Record<number, number>;
  origine?: { x: number; y: number } | null;
  onFermer: () => void;
  onEnregistre: () => void;
}

/**
 * Composition du fond de caisse, ouverte depuis l'écran de comptage.
 *
 * Elle vit à côté de la ligne qu'elle explique, et non dans les paramètres :
 * c'est en comptant qu'on s'aperçoit que le fond ne colle plus, et il ne faut
 * pas avoir à chercher où le corriger.
 */
export function ModaleFondDeCaisse({
  composition,
  origine,
  onFermer,
  onEnregistre,
}: Props) {
  const [quantites, setQuantites] = useState<Quantites>(() =>
    Object.fromEntries(
      Object.entries(composition).map(([coupure, quantite]) => [
        coupure,
        String(quantite),
      ]),
    ),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const total = totalSaisie(quantites);

  const enregistrer = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await api.enregistrerParametres({ fond_composition: detailPourApi(quantites) });
      onEnregistre();
      onFermer();
    } catch (probleme) {
      setErreur(probleme instanceof ErreurApi ? probleme.message : 'Erreur inattendue.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modale
      titre="Fond de caisse"
      sousTitre="Ce qui reste dans le tiroir chaque soir pour rendre la monnaie."
      origine={origine}
      onFermer={onFermer}
      pied={
        <>
          <span className="feuille__total">
            Fond
            <strong>{formaterEuros(total)}</strong>
          </span>
          <div className="feuille__actions">
            <button type="button" className="bouton" onClick={onFermer}>
              Annuler
            </button>
            <button
              type="button"
              className="bouton bouton--principal"
              disabled={enCours}
              onClick={enregistrer}
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      }
    >
      {erreur && <div className="message message--erreur">{erreur}</div>}

      <p className="panneau__note panneau__note--gauche">
        Ces quantités sont retirées du versement au coffre à chaque validation,
        coupure par coupure. Le montant se déduit de la composition : il ne se
        saisit pas. {nombreCoupures(quantites)} coupures pour{' '}
        {formaterEuros(total)}.
      </p>

      <GrilleSaisie quantites={quantites} onChange={setQuantites} compact />
    </Modale>
  );
}

import { COUPURES, VALEURS_COUPURES } from 'caisse-partage';
import type { LigneInventaire, LigneJournal } from '../api-types';

/**
 * Magasin en mémoire de la version de démonstration.
 *
 * Il rejoue les mêmes règles que le vrai serveur — solde recalculé depuis les
 * mouvements, sortie refusée coupure par coupure, historique jamais modifié —
 * pour que la démo montre le comportement réel et pas une façade. Ce qu'il ne
 * fait pas : persister quoi que ce soit. Tout repart à zéro au rechargement.
 */

export interface Mouvement {
  id: number;
  date: string;
  agent: string;
  type: 'versement' | 'sortie';
  motif: string;
  comptage_id: number | null;
  cree_le: string;
  detail: { coupure_centimes: number; quantite: number }[];
  cheques_nombre: number;
  cheques_centimes: number;
}

export interface Comptage extends LigneJournal {
  detail: { coupure_centimes: number; quantite: number }[];
}

const deuxChiffres = (valeur: number) => String(valeur).padStart(2, '0');

export function dateLocale(instant = new Date()): string {
  return `${instant.getFullYear()}-${deuxChiffres(instant.getMonth() + 1)}-${deuxChiffres(instant.getDate())}`;
}

export function horodatage(instant = new Date()): string {
  return `${dateLocale(instant)} ${deuxChiffres(instant.getHours())}:${deuxChiffres(instant.getMinutes())}:${deuxChiffres(instant.getSeconds())}`;
}

/** Décale une date de N jours vers le passé. */
function ilYA(jours: number): string {
  const date = new Date();
  date.setDate(date.getDate() - jours);
  return dateLocale(date);
}

export const libelleCoupure = (centimes: number) =>
  COUPURES.find((c) => c.valeur === centimes)?.libelle ?? `${centimes} centimes`;

export const totalCentimes = (
  detail: { coupure_centimes: number; quantite: number }[],
) => detail.reduce((somme, l) => somme + l.coupure_centimes * l.quantite, 0);

export class MagasinDemo {
  fondDefautCentimes = 10_000;
  agents = ['BR', 'ML', 'JD'];
  comptages: Comptage[] = [];
  mouvements: Mouvement[] = [];

  private prochainComptage = 1;
  private prochainMouvement = 1;

  constructor() {
    this.semer();
  }

  /** Quelques journées plausibles, pour que les écrans ne soient pas vides. */
  private semer() {
    const journees: {
      jours: number;
      agent: string;
      cb: number;
      detail: Record<number, number>;
      cheques?: { nombre: number; centimes: number };
    }[] = [
      { jours: 4, agent: 'ML', cb: 48_250, cheques: { nombre: 2, centimes: 4_400 }, detail: { 5000: 3, 2000: 6, 1000: 4, 500: 7, 200: 22, 100: 31, 50: 14, 20: 25, 10: 18, 5: 12 } },
      { jours: 3, agent: 'BR', cb: 33_900, detail: { 5000: 2, 2000: 4, 1000: 9, 500: 5, 200: 18, 100: 24, 50: 11, 20: 8 } },
      { jours: 2, agent: 'JD', cb: 51_400, cheques: { nombre: 3, centimes: 9_150 }, detail: { 5000: 4, 2000: 7, 1000: 6, 500: 9, 200: 27, 100: 19, 50: 22, 20: 16, 10: 9 } },
      { jours: 1, agent: 'BR', cb: 27_650, detail: { 5000: 1, 2000: 5, 1000: 8, 500: 4, 200: 15, 100: 28, 50: 17, 20: 12, 5: 20 } },
    ];

    for (const journee of journees) {
      this.validerJournee({
        date: ilYA(journee.jours),
        agent: journee.agent,
        detail: journee.detail,
        cb_centimes: journee.cb,
        fond_centimes: this.fondDefautCentimes,
        cheques_centimes: journee.cheques?.centimes ?? 0,
      });
    }

    // Une remise en banque, pour que l'historique du coffre ne soit pas
    // qu'une suite de versements.
    this.enregistrerSortie({
      date: ilYA(2),
      agent: 'ML',
      motif: 'Remise en banque',
      detail: { 5000: 5, 2000: 10 },
      cheques_centimes: 0,
    });
  }

  inventaire(): LigneInventaire[] {
    const cumul = new Map<number, number>(VALEURS_COUPURES.map((v) => [v, 0]));

    for (const mouvement of this.mouvements) {
      for (const ligne of mouvement.detail) {
        cumul.set(
          ligne.coupure_centimes,
          (cumul.get(ligne.coupure_centimes) ?? 0) + ligne.quantite,
        );
      }
    }

    return [...cumul.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([coupure_centimes, quantite]) => ({
        coupure_centimes,
        quantite,
        valeur_centimes: coupure_centimes * quantite,
      }));
  }

  /** Jamais stocké, toujours recalculé — comme sur le vrai serveur. */
  especes(): number {
    return this.inventaire().reduce((somme, l) => somme + l.valeur_centimes, 0);
  }

  cheques(): { nombre: number; centimes: number } {
    return this.mouvements.reduce(
      (somme, m) => ({
        nombre: somme.nombre + m.cheques_nombre,
        centimes: somme.centimes + m.cheques_centimes,
      }),
      { nombre: 0, centimes: 0 },
    );
  }

  /** Les chèques sont physiquement au coffre : ils comptent dans le solde. */
  solde(): number {
    return this.especes() + this.cheques().centimes;
  }

  dernierVersement() {
    for (let i = this.mouvements.length - 1; i >= 0; i -= 1) {
      const mouvement = this.mouvements[i];
      if (mouvement && mouvement.type === 'versement') {
        return {
          date: mouvement.date,
          agent: mouvement.agent,
          cree_le: mouvement.cree_le,
        };
      }
    }
    return null;
  }

  validerJournee(corps: {
    date: string;
    agent: string;
    detail: Record<number, number>;
    cb_centimes: number;
    fond_centimes: number;
    cheques_centimes: number;
  }): Comptage {
    const detail = Object.entries(corps.detail)
      .map(([coupure, quantite]) => ({
        coupure_centimes: Number(coupure),
        quantite: Number(quantite),
      }))
      .filter((l) => l.quantite > 0)
      .sort((a, b) => a.coupure_centimes - b.coupure_centimes);

    const especes = totalCentimes(detail);
    const recetteEspeces = especes - corps.fond_centimes;

    const comptage: Comptage = {
      id: this.prochainComptage,
      date: corps.date,
      agent: corps.agent,
      especes_centimes: especes,
      cb_centimes: corps.cb_centimes,
      fond_centimes: corps.fond_centimes,
      cheques_nombre: 0,
      cheques_centimes: corps.cheques_centimes,
      recette_especes_centimes: recetteEspeces,
      recette_centimes:
        recetteEspeces + corps.cb_centimes + corps.cheques_centimes,
      cree_le: horodatage(),
      detail,
    };
    this.prochainComptage += 1;
    this.comptages.push(comptage);

    if (detail.length > 0 || corps.cheques_centimes > 0) {
      this.mouvements.push({
        id: this.prochainMouvement,
        date: corps.date,
        agent: corps.agent,
        type: 'versement',
        motif: `Versement du comptage du ${corps.date}`,
        comptage_id: comptage.id,
        cree_le: horodatage(),
        detail,
        cheques_nombre: 0,
        cheques_centimes: corps.cheques_centimes,
      });
      this.prochainMouvement += 1;
    }

    return comptage;
  }

  /**
   * Refuse en bloc si une coupure dépasse le stock : le solde global ne suffit
   * pas, on peut avoir 500 € au coffre et pas une pièce de 20 centimes.
   */
  enregistrerSortie(corps: {
    date: string;
    agent: string;
    motif: string;
    detail: Record<number, number>;
    cheques_centimes: number;
  }): { id: number; montant_centimes: number } {
    const stock = new Map(
      this.inventaire().map((l) => [l.coupure_centimes, l.quantite]),
    );

    const demande = Object.entries(corps.detail)
      .map(([coupure, quantite]) => ({
        coupure_centimes: Number(coupure),
        quantite: Number(quantite),
      }))
      .filter((l) => l.quantite > 0)
      .sort((a, b) => a.coupure_centimes - b.coupure_centimes);

    const manquantes = demande
      .filter((l) => l.quantite > (stock.get(l.coupure_centimes) ?? 0))
      .map((l) => ({
        coupure_centimes: l.coupure_centimes,
        demande: l.quantite,
        disponible: stock.get(l.coupure_centimes) ?? 0,
      }));

    if (manquantes.length > 0) {
      const details = manquantes
        .map(
          (m) =>
            `${libelleCoupure(m.coupure_centimes)} (demandé ${m.demande}, disponible ${m.disponible})`,
        )
        .join(', ');
      const erreur = new Error(`Stock insuffisant au coffre : ${details}.`);
      // Même forme que la réponse du vrai serveur.
      (erreur as Error & { details?: unknown }).details = { coupures: manquantes };
      throw erreur;
    }

    const id = this.prochainMouvement;
    this.prochainMouvement += 1;

    this.mouvements.push({
      id,
      date: corps.date,
      agent: corps.agent,
      type: 'sortie',
      motif: corps.motif,
      comptage_id: null,
      cree_le: horodatage(),
      detail: demande.map((l) => ({
        coupure_centimes: l.coupure_centimes,
        quantite: -l.quantite,
      })),
      cheques_nombre: 0,
      cheques_centimes: -corps.cheques_centimes,
    });

    return {
      id,
      montant_centimes: totalCentimes(demande) + corps.cheques_centimes,
    };
  }

  journal() {
    const lignes = [...this.comptages].sort((a, b) =>
      a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date),
    );

    const cumul = lignes.reduce(
      (somme, l) => ({
        especes_centimes: somme.especes_centimes + l.especes_centimes,
        cb_centimes: somme.cb_centimes + l.cb_centimes,
        cheques_nombre: somme.cheques_nombre + l.cheques_nombre,
        cheques_centimes: somme.cheques_centimes + l.cheques_centimes,
        recette_especes_centimes:
          somme.recette_especes_centimes + l.recette_especes_centimes,
        recette_centimes: somme.recette_centimes + l.recette_centimes,
      }),
      {
        especes_centimes: 0,
        cb_centimes: 0,
        cheques_nombre: 0,
        cheques_centimes: 0,
        recette_especes_centimes: 0,
        recette_centimes: 0,
      },
    );

    return { lignes, cumul };
  }
}

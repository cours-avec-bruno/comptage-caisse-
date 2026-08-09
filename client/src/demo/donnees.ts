import { COUPURES, VALEURS_COUPURES, formaterEuros } from 'caisse-partage';
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
  type: 'versement' | 'sortie' | 'change';
  motif: string;
  comptage_id: number | null;
  cree_le: string;
  detail: { coupure_centimes: number; quantite: number }[];
  cheques_nombre: number;
  cheques_centimes: number;
}

export interface Comptage extends LigneJournal {
  detail: { coupure_centimes: number; quantite: number }[];
  /** Ce qui est réellement monté au coffre : le comptage moins le fond. */
  verse_centimes: number;
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

export interface AgentDemo {
  id: number;
  prenom: string;
  nom: string;
  initiales: string;
  actif: boolean;
  cree_le: string;
  /** En démonstration il n'y a rien à protéger : le mot de passe reste en clair. */
  motDePasse: string;
}

export class MagasinDemo {
  /** Ce qui reste dans le tiroir chaque soir. Le montant s'en déduit. */
  fondComposition: Record<number, number> = {
    2000: 2, 1000: 2, 500: 4, 100: 8, 50: 12, 20: 15, 10: 20, 5: 10, 2: 10, 1: 30,
  };

  get fondDefautCentimes(): number {
    return Object.entries(this.fondComposition).reduce(
      (somme, [coupure, quantite]) => somme + Number(coupure) * quantite,
      0,
    );
  }

  agents: AgentDemo[] = [
    { id: 1, prenom: 'Bruno', nom: 'Ricci', initiales: 'BR', actif: true, cree_le: '', motDePasse: 'BRUNO' },
    { id: 2, prenom: 'Marie', nom: 'Lefevre', initiales: 'ML', actif: true, cree_le: '', motDePasse: 'MARIE' },
  ];

  /** L'agent connecté sur ce poste, ou null. */
  connecte: AgentDemo | null = null;

  private prochainAgent = 3;

  /** Prénom en majuscules, sans accent : le mot de passe par défaut. */
  static motDePasseParDefaut(prenom: string): string {
    return prenom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  }

  initialesLibres(base: string): string {
    if (!this.agents.some((a) => a.initiales === base)) return base;
    for (let suffixe = 2; suffixe < 100; suffixe += 1) {
      const candidat = `${base}${suffixe}`;
      if (!this.agents.some((a) => a.initiales === candidat)) return candidat;
    }
    return base;
  }

  ajouterAgent(prenom: string, nom: string): AgentDemo {
    const lettre = (mot: string) =>
      mot.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().charAt(0).toUpperCase();
    const agent: AgentDemo = {
      id: this.prochainAgent,
      prenom: prenom.trim(),
      nom: nom.trim(),
      initiales: this.initialesLibres(`${lettre(prenom)}${lettre(nom)}`),
      actif: true,
      cree_le: horodatage(),
      motDePasse: MagasinDemo.motDePasseParDefaut(prenom),
    };
    this.prochainAgent += 1;
    this.agents.push(agent);
    return agent;
  }
  comptages: Comptage[] = [];
  mouvements: Mouvement[] = [];

  private prochainComptage = 1;
  private prochainMouvement = 1;

  constructor() {
    this.semer();
  }

  /**
   * Trois mois de journées plausibles avant les quatre dernières, pour que
   * l'écran Statistiques ait de quoi montrer.
   *
   * La suite est déterministe : une démonstration doit être la même pour tout
   * le monde, pas une loterie au rechargement.
   */
  private semerHistorique() {
    let graine = 20_260_809;
    const hasard = () => {
      graine = (graine * 1_103_515_245 + 12_345) % 2_147_483_648;
      return graine / 2_147_483_648;
    };

    /** Décompose un montant en coupures, en laissant de la monnaie plausible. */
    const enCoupures = (centimes: number): Record<number, number> => {
      const detail: Record<number, number> = {};
      let reste = centimes;
      for (const valeur of [...VALEURS_COUPURES].reverse()) {
        if (reste <= 0) break;
        let combien = Math.floor(reste / valeur);
        // Une caisse d'accueil n'est pas faite que de gros billets : on n'en
        // prend qu'une partie et le reste descend vers la monnaie.
        if (valeur >= 500 && combien > 1) {
          combien = Math.max(1, Math.round(combien * (0.45 + hasard() * 0.4)));
        }
        if (combien > 0) {
          detail[valeur] = combien;
          reste -= combien * valeur;
        }
      }
      return detail;
    };

    for (let jours = 70; jours >= 5; jours -= 1) {
      const date = ilYA(jours);
      const [annee, mois, jour] = date.split('-').map(Number);
      const jourSemaine = new Date(annee ?? 0, (mois ?? 1) - 1, jour ?? 1).getDay();
      if (jourSemaine === 1) continue; // la piscine ferme le lundi

      const weekend = jourSemaine === 0 || jourSemaine === 6;
      const affluence = (weekend ? 1.5 : 1) * (0.78 + hasard() * 0.5);

      this.validerJournee({
        date,
        agent: hasard() < 0.5 ? 'BR' : 'ML',
        // Le détail vaut la recette *plus* le fond, qui reste dans le tiroir.
        detail: enCoupures(Math.round(24_000 * affluence) + this.fondDefautCentimes),
        cb_centimes: Math.round(38_000 * affluence),
        // Le chèque est devenu rare : environ une journée sur quatre.
        cheques_centimes: hasard() < 0.25 ? Math.round(3_500 + hasard() * 9_000) : 0,
      });

      // Une remise en banque tous les quinze jours, sinon le coffre gonflerait
      // jusqu'à l'absurde.
      if (jours % 14 === 0) {
        const gros = this.inventaire().filter(
          (ligne) => ligne.coupure_centimes >= 1000 && ligne.quantite > 2,
        );
        if (gros.length > 0) {
          this.enregistrerSortie({
            date,
            agent: 'BR',
            motif: 'Remise en banque',
            detail: Object.fromEntries(
              gros.map((ligne) => [
                ligne.coupure_centimes,
                Math.floor(ligne.quantite * 0.8),
              ]),
            ),
            cheques_centimes: this.cheques().centimes,
          });
        }
      }
    }
  }

  /** Quelques journées plausibles, pour que les écrans ne soient pas vides. */
  private semer() {
    this.semerHistorique();

    const journees: {
      jours: number;
      agent: string;
      cb: number;
      detail: Record<number, number>;
      cheques?: { nombre: number; centimes: number };
    }[] = [
      { jours: 4, agent: 'ML', cb: 48_250, cheques: { nombre: 2, centimes: 4_400 }, detail: { 5000: 3, 2000: 6, 1000: 4, 500: 7, 200: 22, 100: 31, 50: 14, 20: 25, 10: 18, 5: 12 } },
      { jours: 3, agent: 'BR', cb: 33_900, detail: { 5000: 2, 2000: 4, 1000: 9, 500: 5, 200: 18, 100: 24, 50: 11, 20: 8 } },
      { jours: 2, agent: 'ML', cb: 51_400, cheques: { nombre: 3, centimes: 9_150 }, detail: { 5000: 4, 2000: 7, 1000: 6, 500: 9, 200: 27, 100: 19, 50: 22, 20: 16, 10: 9 } },
      { jours: 1, agent: 'BR', cb: 27_650, detail: { 5000: 1, 2000: 5, 1000: 8, 500: 4, 200: 15, 100: 28, 50: 17, 20: 12, 5: 20 } },
    ];

    for (const journee of journees) {
      this.validerJournee({
        date: ilYA(journee.jours),
        agent: journee.agent,
        detail: journee.detail,
        cb_centimes: journee.cb,
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
    const fondCentimes = this.fondDefautCentimes;
    const recetteEspeces = especes - fondCentimes;

    // Le fond reste dans le tiroir : ce qui monte au coffre est le comptage
    // moins sa composition, coupure par coupure.
    const versement = detail
      .map((l) => ({
        coupure_centimes: l.coupure_centimes,
        quantite: l.quantite - (this.fondComposition[l.coupure_centimes] ?? 0),
      }))
      .filter((l) => l.quantite > 0);

    const comptage: Comptage = {
      id: this.prochainComptage,
      date: corps.date,
      agent: corps.agent,
      especes_centimes: especes,
      cb_centimes: corps.cb_centimes,
      fond_centimes: fondCentimes,
      cheques_nombre: 0,
      cheques_centimes: corps.cheques_centimes,
      verse_centimes: totalCentimes(versement) + corps.cheques_centimes,
      recette_especes_centimes: recetteEspeces,
      recette_centimes:
        recetteEspeces + corps.cb_centimes + corps.cheques_centimes,
      cree_le: horodatage(),
      detail,
    };
    this.prochainComptage += 1;
    this.comptages.push(comptage);

    if (versement.length > 0 || corps.cheques_centimes > 0) {
      this.mouvements.push({
        id: this.prochainMouvement,
        date: corps.date,
        agent: corps.agent,
        type: 'versement',
        motif: `Versement du comptage du ${corps.date}`,
        comptage_id: comptage.id,
        cree_le: horodatage(),
        detail: versement,
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

  /**
   * Change : on remet des coupures au coffre et on en reprend d'autres pour
   * le même montant. Le solde ne bouge pas, seule la composition change —
   * d'où un seul mouvement, et non une sortie suivie d'un versement.
   */
  enregistrerChange(corps: {
    date: string;
    agent: string;
    motif: string;
    entrantes: Record<number, number>;
    sortantes: Record<number, number>;
  }): { id: number; montant_centimes: number } {
    const somme = (cotes: Record<number, number>) =>
      Object.entries(cotes).reduce(
        (total, [coupure, quantite]) => total + Number(coupure) * Number(quantite),
        0,
      );

    const donne = somme(corps.entrantes);
    const repris = somme(corps.sortantes);

    if (donne === 0 && repris === 0) {
      throw new Error('Indiquez ce que vous donnez au coffre et ce que vous y reprenez.');
    }

    if (donne !== repris) {
      const ecart = Math.abs(donne - repris);
      throw new Error(
        `Un change ne fait pas varier le solde du coffre. Vous donnez ${formaterEuros(donne)} et vous reprenez ${formaterEuros(repris)} : il reste ${formaterEuros(ecart)} ${
          donne > repris ? 'à reprendre' : 'à donner'
        }.`,
      );
    }

    const net = new Map<number, number>();
    for (const [coupure, quantite] of Object.entries(corps.entrantes)) {
      net.set(Number(coupure), (net.get(Number(coupure)) ?? 0) + Number(quantite));
    }
    for (const [coupure, quantite] of Object.entries(corps.sortantes)) {
      net.set(Number(coupure), (net.get(Number(coupure)) ?? 0) - Number(quantite));
    }
    for (const [coupure, quantite] of [...net]) {
      if (quantite === 0) net.delete(coupure);
    }

    if (net.size === 0) {
      throw new Error(
        'Ce change ne changerait rien : vous donnez et vous reprenez exactement les mêmes coupures.',
      );
    }

    const stock = new Map(
      this.inventaire().map((l) => [l.coupure_centimes, l.quantite]),
    );

    const manquantes = [...net]
      .filter(([coupure, quantite]) => quantite < 0 && -quantite > (stock.get(coupure) ?? 0))
      .map(([coupure, quantite]) => ({
        coupure_centimes: coupure,
        demande: -quantite,
        disponible: stock.get(coupure) ?? 0,
      }))
      .sort((a, b) => a.coupure_centimes - b.coupure_centimes);

    if (manquantes.length > 0) {
      const details = manquantes
        .map(
          (m) =>
            `${libelleCoupure(m.coupure_centimes)} (demandé ${m.demande}, disponible ${m.disponible})`,
        )
        .join(', ');
      const erreur = new Error(`Le coffre n’a pas la monnaie : ${details}.`);
      (erreur as Error & { details?: unknown }).details = { coupures: manquantes };
      throw erreur;
    }

    const id = this.prochainMouvement;
    this.prochainMouvement += 1;

    this.mouvements.push({
      id,
      date: corps.date,
      agent: corps.agent,
      type: 'change',
      motif: corps.motif,
      comptage_id: null,
      cree_le: horodatage(),
      detail: [...net]
        .sort((a, b) => a[0] - b[0])
        .map(([coupure_centimes, quantite]) => ({ coupure_centimes, quantite })),
      cheques_nombre: 0,
      cheques_centimes: 0,
    });

    return { id, montant_centimes: donne };
  }

  /** L'historique du coffre, du plus récent au plus ancien. */
  historique() {
    return [...this.mouvements]
      .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)))
      .map((mouvement) => {
        const valeur = (signe: number) =>
          mouvement.detail
            .filter((l) => Math.sign(l.quantite) === signe)
            .reduce((somme, l) => somme + l.coupure_centimes * l.quantite, 0);

        return {
          ...mouvement,
          // Effet sur le solde : nul pour un change, c'est tout son intérêt.
          montant_centimes: totalCentimes(mouvement.detail) + mouvement.cheques_centimes,
          entrees_centimes: valeur(1) + Math.max(0, mouvement.cheques_centimes),
          sorties_centimes: -valeur(-1) - Math.min(0, mouvement.cheques_centimes),
        };
      });
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

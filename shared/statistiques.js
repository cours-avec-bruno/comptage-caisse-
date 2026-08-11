/**
 * Agrégation des recettes, pour l'écran Statistiques.
 *
 * Tout reste en centimes entiers. Les seuls nombres non entiers du module sont
 * les pourcentages, et ils ne servent qu'à écrire une part sous une barre —
 * jamais à recalculer un montant.
 *
 * Vit dans le paquet partagé pour être testable avec le reste : découper des
 * dates en semaines et répartir des pourcentages qui tombent juste sont
 * exactement les choses qui se cassent en silence.
 */

/**
 * Décale une date « AAAA-MM-JJ ». En UTC : un décalage local traverserait mal
 * les changements d'heure, et l'application ne travaille qu'en dates civiles.
 * @param {string} date
 * @param {number} jours
 * @returns {string}
 */
export function decalerJours(date, jours) {
  const [annee, mois, jour] = date.split('-').map(Number);
  const point = new Date(Date.UTC(annee, mois - 1, jour));
  point.setUTCDate(point.getUTCDate() + jours);
  return point.toISOString().slice(0, 10);
}

/**
 * Nombre de jours entre deux dates civiles, bornes comprises.
 * @param {string} debut
 * @param {string} fin
 * @returns {number}
 */
export function nombreDeJours(debut, fin) {
  const enJours = (date) => {
    const [annee, mois, jour] = date.split('-').map(Number);
    return Date.UTC(annee, mois - 1, jour) / 86_400_000;
  };
  return enJours(fin) - enJours(debut) + 1;
}

/** Le lundi de la semaine d'une date. */
export function lundiDe(date) {
  const [annee, mois, jour] = date.split('-').map(Number);
  const point = new Date(Date.UTC(annee, mois - 1, jour));
  // getUTCDay : 0 = dimanche. On veut reculer jusqu'au lundi.
  const recul = (point.getUTCDay() + 6) % 7;
  return decalerJours(date, -recul);
}

/**
 * Quel pas de temps pour une fenêtre donnée : un mois de barres quotidiennes
 * se lit encore, un trimestre ne se lit plus.
 * @param {number} jours
 * @returns {'jour'|'semaine'|'mois'}
 */
export function granularitePour(jours) {
  if (jours > 120) return 'mois';
  if (jours > 31) return 'semaine';
  return 'jour';
}

/**
 * Pourcentages entiers dont la somme fait exactement 100.
 *
 * Trois arrondis indépendants donnent 33 + 33 + 33 = 99, et une part qui
 * manque sous une barre pleine se remarque. On distribue donc le reste aux
 * plus fortes décimales.
 *
 * @param {number[]} valeurs négatives comptées comme nulles
 * @returns {number[]}
 */
export function pourcentsEntiers(valeurs) {
  const positives = valeurs.map((valeur) => Math.max(0, valeur));
  const total = positives.reduce((somme, valeur) => somme + valeur, 0);
  if (total <= 0) return valeurs.map(() => 0);

  const exacts = positives.map((valeur) => (valeur * 100) / total);
  const entiers = exacts.map(Math.floor);
  let reste = 100 - entiers.reduce((somme, valeur) => somme + valeur, 0);

  const parDecimale = exacts
    .map((exact, index) => ({ index, decimale: exact - Math.floor(exact) }))
    .sort((a, b) => b.decimale - a.decimale);

  for (const { index } of parDecimale) {
    if (reste <= 0) break;
    entiers[index] += 1;
    reste -= 1;
  }

  return entiers;
}

const cumulVide = () => ({
  especes_centimes: 0,
  cb_centimes: 0,
  cheques_centimes: 0,
  recette_centimes: 0,
});

/**
 * Ajoute une journée à un cumul. `especes` est la recette espèces, fond déjà
 * retiré : c'est elle qui, avec la CB et les chèques, fait la recette du jour.
 */
function cumuler(cumul, ligne) {
  cumul.especes_centimes += ligne.recette_especes_centimes;
  cumul.cb_centimes += ligne.cb_centimes;
  cumul.cheques_centimes += ligne.cheques_centimes;
  cumul.recette_centimes += ligne.recette_centimes;
  return cumul;
}

/** La clé du seau auquel appartient une date, selon le pas de temps. */
function seauDe(date, granularite) {
  if (granularite === 'mois') return date.slice(0, 7);
  if (granularite === 'semaine') return lundiDe(date);
  return date;
}

/**
 * Statistiques d'une fenêtre de temps.
 *
 * @param {{date: string, cb_centimes: number, cheques_centimes: number,
 *          recette_especes_centimes: number, recette_centimes: number}[]} lignes
 *   toutes les journées validées, ordre indifférent
 * @param {string} aujourdHui « AAAA-MM-JJ »
 * @param {number|null|{debut: string, fin: string}} fenetre nombre de jours
 *   comptés jusqu'à aujourd'hui, `null` pour tout l'historique, ou deux dates
 *   choisies à la main — la seule forme dont la fin peut être passée
 */
export function statistiques(lignes, aujourdHui, fenetre) {
  const dates = lignes.map((ligne) => ligne.date).sort();
  const premiere = dates[0] ?? aujourdHui;

  let debut;
  let fin;

  if (fenetre !== null && typeof fenetre === 'object') {
    // Plage choisie à la main. On remet les bornes dans l'ordre plutôt que de
    // rendre une fenêtre vide : deux dates inversées veulent dire la même
    // période, et refuser de compter n'apprendrait rien à personne.
    debut = fenetre.debut <= fenetre.fin ? fenetre.debut : fenetre.fin;
    fin = fenetre.debut <= fenetre.fin ? fenetre.fin : fenetre.debut;
  } else {
    fin = aujourdHui;
    debut =
      fenetre === null
        ? // « Tout » part de la première journée validée, jamais d'une date
          // arbitraire : la période affichée doit correspondre aux données.
          premiere < aujourdHui
          ? premiere
          : aujourdHui
        : decalerJours(aujourdHui, -(fenetre - 1));
  }

  const dansLaFenetre = lignes.filter(
    (ligne) => ligne.date >= debut && ligne.date <= fin,
  );

  const etendue = nombreDeJours(debut, fin);
  const granularite = granularitePour(etendue);

  // --- Cumuls ------------------------------------------------------------
  const totaux = dansLaFenetre.reduce(cumuler, cumulVide());
  const parts = pourcentsEntiers([
    totaux.especes_centimes,
    totaux.cb_centimes,
    totaux.cheques_centimes,
  ]);

  // --- Par journée -------------------------------------------------------
  /** @type {Map<string, ReturnType<typeof cumulVide>>} */
  const parJournee = new Map();
  for (const ligne of dansLaFenetre) {
    if (!parJournee.has(ligne.date)) parJournee.set(ligne.date, cumulVide());
    cumuler(parJournee.get(ligne.date), ligne);
  }

  let meilleure = null;
  for (const [date, cumul] of parJournee) {
    if (!meilleure || cumul.recette_centimes > meilleure.recette_centimes) {
      meilleure = { date, recette_centimes: cumul.recette_centimes };
    }
  }

  // --- Seaux -------------------------------------------------------------
  /** @type {Map<string, {cle: string, debut: string, fin: string} & ReturnType<typeof cumulVide>>} */
  const seaux = new Map();
  for (const [date, cumul] of parJournee) {
    const cle = seauDe(date, granularite);
    if (!seaux.has(cle)) {
      seaux.set(cle, { cle, debut: date, fin: date, ...cumulVide() });
    }
    const seau = seaux.get(cle);
    if (date < seau.debut) seau.debut = date;
    if (date > seau.fin) seau.fin = date;
    seau.especes_centimes += cumul.especes_centimes;
    seau.cb_centimes += cumul.cb_centimes;
    seau.cheques_centimes += cumul.cheques_centimes;
    seau.recette_centimes += cumul.recette_centimes;
  }

  // --- Période précédente, de même longueur ------------------------------
  const finPrecedente = decalerJours(debut, -1);
  const debutPrecedent = decalerJours(finPrecedente, -(etendue - 1));
  const precedentes = lignes.filter(
    (ligne) => ligne.date >= debutPrecedent && ligne.date <= finPrecedente,
  );
  const precedent =
    precedentes.length > 0 ? precedentes.reduce(cumuler, cumulVide()) : null;

  // Une évolution n'a de sens que si la période précédente a rapporté quelque
  // chose : sinon « + 100 % » ne dit rien de plus que « il n'y avait rien ».
  const evolution =
    precedent && precedent.recette_centimes > 0
      ? Math.round(
          ((totaux.recette_centimes - precedent.recette_centimes) * 100) /
            precedent.recette_centimes,
        )
      : null;

  const journees = parJournee.size;

  return {
    debut,
    fin,
    etendue_jours: etendue,
    granularite,
    journees,
    totaux,
    parts: { especes: parts[0], cb: parts[1], cheques: parts[2] },
    // Moyenne sur les journées *travaillées*, pas sur les jours du calendrier :
    // la piscine ferme, et diviser par des jours fermés dirait n'importe quoi.
    moyenne_par_journee:
      journees > 0 ? Math.round(totaux.recette_centimes / journees) : 0,
    meilleure,
    seaux: [...seaux.values()].sort((a, b) => a.cle.localeCompare(b.cle)),
    precedent,
    evolution_pourcent: evolution,
  };
}

/**
 * Ressorts : le moteur d'animation de l'interface.
 *
 * Une animation à durée fixe ne sait pas répondre à une nouvelle intention en
 * cours de route. Un ressort, si : on change sa cible, il continue depuis sa
 * position **et sa vitesse** du moment. C'est ce qui rend une animation
 * interruptible, et l'interruptibilité est le principe qui compte le plus.
 *
 * Deux paramètres, ceux d'Apple, plutôt que le triplet masse/raideur/frottement :
 *  - `amortissement` (ζ) : 1 = pas de dépassement, < 1 = rebond ;
 *  - `reponse` : en secondes, la vivacité. Ce n'est pas une durée — un ressort
 *    n'en a pas, son temps de repos découle des paramètres.
 */

export interface OptionsRessort {
  /** ζ. 1 = amorti critique (défaut). ~0,8 pour un geste qui portait de l'élan. */
  amortissement?: number;
  /** Vivacité en secondes. 0,3–0,4 pour l'interface courante. */
  reponse?: number;
  /** Écart en dessous duquel on considère le ressort au repos. */
  precision?: number;
}

const PAS_MAX = 1 / 240; // sous-pas d'intégration : stable même si une frame saute

export class Ressort {
  valeur: number;
  vitesse = 0;
  cible: number;

  private amortissement: number;
  private reponse: number;
  private precision: number;

  constructor(valeurInitiale = 0, options: OptionsRessort = {}) {
    this.valeur = valeurInitiale;
    this.cible = valeurInitiale;
    this.amortissement = options.amortissement ?? 1;
    this.reponse = options.reponse ?? 0.4;
    this.precision = options.precision ?? 0.001;
  }

  /**
   * Change la cible sans toucher à la vitesse : c'est ce report de vitesse qui
   * évite le « mur » qu'on sent quand une animation en remplace brutalement
   * une autre au moment où un geste s'inverse.
   */
  viser(cible: number, vitesse?: number) {
    this.cible = cible;
    if (vitesse !== undefined) this.vitesse = vitesse;
  }

  /** Repositionne sans animer (montage initial, reset). */
  poser(valeur: number) {
    this.valeur = valeur;
    this.cible = valeur;
    this.vitesse = 0;
  }

  /** Coup de pouce : sert à faire réagir un élément sans déplacer sa cible. */
  impulsion(vitesse: number) {
    this.vitesse += vitesse;
  }

  auRepos(): boolean {
    return (
      Math.abs(this.valeur - this.cible) < this.precision &&
      Math.abs(this.vitesse) < this.precision
    );
  }

  /**
   * Intègre le ressort sur `dt` secondes.
   * @returns true quand il est arrivé au repos.
   */
  avancer(dt: number): boolean {
    // Euler semi-implicite en sous-pas : simple, et stable même à 15 fps.
    const pulsation = (2 * Math.PI) / this.reponse;
    const raideur = pulsation * pulsation;
    const frottement = 2 * this.amortissement * pulsation;

    let restant = Math.min(dt, 0.064); // une frame perdue ne doit pas catapulter l'élément

    while (restant > 0) {
      const pas = Math.min(restant, PAS_MAX);
      const acceleration =
        -raideur * (this.valeur - this.cible) - frottement * this.vitesse;
      this.vitesse += acceleration * pas;
      this.valeur += this.vitesse * pas;
      restant -= pas;
    }

    if (this.auRepos()) {
      this.valeur = this.cible;
      this.vitesse = 0;
      return true;
    }
    return false;
  }
}

/**
 * Boucle d'animation partagée, calée sur l'affichage.
 *
 * Un seul `requestAnimationFrame` pour toute l'application : plusieurs boucles
 * concurrentes se décalent entre elles et donnent des mouvements qui ne sont
 * pas synchrones — or le visuel, le son et le retour haptique doivent tomber
 * sur la même frame.
 */
type Abonne = (dt: number) => boolean;

const abonnes = new Set<Abonne>();
let image = 0;
let dernierInstant = 0;

function tourner(instant: number) {
  const dt = dernierInstant ? (instant - dernierInstant) / 1000 : 1 / 60;
  dernierInstant = instant;

  for (const abonne of [...abonnes]) {
    if (abonne(dt)) abonnes.delete(abonne);
  }

  if (abonnes.size > 0) {
    image = requestAnimationFrame(tourner);
  } else {
    image = 0;
    dernierInstant = 0;
  }
}

/** Inscrit une fonction dans la boucle. Elle en sort en renvoyant `true`. */
export function animer(abonne: Abonne): () => void {
  abonnes.add(abonne);
  if (!image) image = requestAnimationFrame(tourner);
  return () => abonnes.delete(abonne);
}

/**
 * Où un geste finirait s'il décélérait librement.
 *
 * On ne s'accroche pas au point de relâchement mais au point **projeté** :
 * c'est ce qui donne l'impression d'avoir lancé l'élément plutôt que de
 * l'avoir posé. Forme exponentielle, celle d'Apple — pas le v²/2a des manuels.
 */
export function projeter(vitesse: number, decelaration = 0.998): number {
  return ((vitesse / 1000) * decelaration) / (1 - decelaration);
}

/**
 * Résistance progressive au-delà d'une limite. Un arrêt net se lit comme un
 * blocage ; une résistance qui croît se lit comme « ça répond, mais il n'y a
 * rien de plus par là ».
 */
export function elastique(depassement: number, dimension: number, constante = 0.55): number {
  return (
    (depassement * dimension * constante) /
    (dimension + constante * Math.abs(depassement))
  );
}

/** Suit les derniers points d'un geste pour en tirer une vitesse au relâchement. */
export class Velocimetre {
  private points: { valeur: number; instant: number }[] = [];

  ajouter(valeur: number, instant = performance.now()) {
    this.points.push({ valeur, instant });
    // 100 ms d'historique : assez pour lisser, assez court pour rester fidèle
    // à la fin du geste plutôt qu'à sa moyenne.
    while (this.points.length > 2 && instant - this.points[0]!.instant > 100) {
      this.points.shift();
    }
  }

  /** Vitesse en unités par seconde. */
  vitesse(): number {
    if (this.points.length < 2) return 0;
    const premier = this.points[0]!;
    const dernier = this.points[this.points.length - 1]!;
    const duree = (dernier.instant - premier.instant) / 1000;
    if (duree <= 0) return 0;
    return (dernier.valeur - premier.valeur) / duree;
  }

  reinitialiser() {
    this.points = [];
  }
}

/** L'utilisateur a demandé moins d'animation : on remplace, on ne supprime pas. */
export function mouvementReduit(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

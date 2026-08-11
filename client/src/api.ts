/**
 * Point d'entrée de l'API côté front. Choisit l'implémentation selon le mode
 * de compilation, et réexporte les types pour que les écrans n'aient qu'un
 * seul module à importer.
 */

import { apiHttp } from './api-http';
import { apiDemo } from './demo/api-demo';
import type { ClientApi } from './api-types';

export * from './api-types';

/**
 * Version publiée en ligne : pas de serveur, pas de base, un magasin en
 * mémoire qui rejoue les mêmes règles. Le drapeau est fixé à la compilation
 * (`--mode demo`), jamais à l'exécution : l'application installée sur le PC
 * de l'accueil ne peut pas y basculer par accident.
 *
 * Aucun écran ne le consulte : il ne choisit qu'une implémentation. Ce qui
 * s'affiche en ligne est exactement ce que voit un agent devant la caisse.
 */
export const MODE_DEMO = import.meta.env.VITE_DEMO === '1';

export const api: ClientApi = MODE_DEMO ? apiDemo : apiHttp;

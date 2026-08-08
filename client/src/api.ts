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
 * Version publiée en démonstration : pas de serveur, pas de base, données
 * fictives en mémoire. Le drapeau est fixé à la compilation (`--mode demo`),
 * jamais à l'exécution : l'application installée ne peut pas basculer en
 * démonstration par accident.
 *
 * Le module de démonstration reste présent dans le bundle de production (~4 ko,
 * il n'est pas éliminé car il s'initialise à l'import), mais il y est
 * inatteignable.
 */
export const MODE_DEMO = import.meta.env.VITE_DEMO === '1';

export const api: ClientApi = MODE_DEMO ? apiDemo : apiHttp;

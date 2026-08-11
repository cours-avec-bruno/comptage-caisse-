/**
 * Point d'entrée de l'API côté front. Réexporte les types pour que les écrans
 * n'aient qu'un seul module à importer.
 */

import { apiHttp } from './api-http';
import type { ClientApi } from './api-types';

export * from './api-types';

export const api: ClientApi = apiHttp;

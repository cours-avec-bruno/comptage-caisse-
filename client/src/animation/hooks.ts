import { useEffect, useMemo, useRef } from 'react';
import { Ressort, animer, mouvementReduit, type OptionsRessort } from './ressort';

/**
 * Un ressort dont la valeur est écrite directement dans le DOM.
 *
 * On n'appelle pas `setState` à chaque frame : rendre React 60 fois par
 * seconde pour bouger une transformation coûte des frames, et une frame
 * perdue se voit. On écrit `transform` / `opacity`, les deux seules
 * propriétés que le compositeur sait animer sans repasser par la mise en page.
 */
export function useRessort(
  cible: number,
  appliquer: (valeur: number) => void,
  options: OptionsRessort = {},
) {
  const ressort = useMemo(() => new Ressort(cible, options), []);
  const appliquerRef = useRef(appliquer);
  appliquerRef.current = appliquer;

  useEffect(() => {
    if (mouvementReduit()) {
      // Pas d'animation vestibulaire : on se pose directement sur la cible.
      ressort.poser(cible);
      appliquerRef.current(cible);
      return;
    }

    ressort.viser(cible);
    return animer((dt) => {
      const fini = ressort.avancer(dt);
      appliquerRef.current(ressort.valeur);
      return fini;
    });
  }, [cible, ressort]);

  return ressort;
}

/**
 * Ressort piloté à la main : on récupère l'objet et on l'anime soi-même.
 * Sert aux gestes, où la cible change au fil du doigt.
 */
export function useRessortManuel(
  valeurInitiale: number,
  appliquer: (valeur: number) => void,
  options: OptionsRessort = {},
) {
  const ressort = useMemo(() => new Ressort(valeurInitiale, options), []);
  const appliquerRef = useRef(appliquer);
  appliquerRef.current = appliquer;
  const arreter = useRef<(() => void) | null>(null);

  const lancer = useMemo(
    () => () => {
      if (arreter.current) return; // déjà en vol : la boucle suit la nouvelle cible
      arreter.current = animer((dt) => {
        const fini = ressort.avancer(dt);
        appliquerRef.current(ressort.valeur);
        if (fini) arreter.current = null;
        return fini;
      });
    },
    [ressort],
  );

  useEffect(() => () => arreter.current?.(), []);

  return { ressort, lancer };
}

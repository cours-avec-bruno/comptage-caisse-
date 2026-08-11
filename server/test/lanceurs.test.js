/**
 * Les lanceurs Windows ne s'exécutent nulle part dans cette suite : ni Linux
 * ni macOS n'ont d'hôte de script. Leurs défauts ne se voient donc qu'au
 * moment où quelqu'un double-clique sur l'icône du poste de l'accueil — le
 * pire moment possible.
 *
 * Ces vérifications-là tiennent lieu d'exécution. Elles ne disent pas que les
 * scripts font ce qu'il faut ; elles disent qu'ils se compileront.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SCRIPTS_VBS = ['demarrer-caisse.vbs', 'scripts/poser-raccourci.vbs'];
const SCRIPTS_BAT = [
  'demarrer-caisse.bat',
  'arreter-caisse.bat',
  'installer-raccourci.bat',
];

const lire = (nom) => fs.readFileSync(path.join(RACINE, nom));

describe('lanceurs Windows', () => {
  for (const nom of SCRIPTS_VBS) {
    describe(nom, () => {
      it('n’a pas de marque d’ordre des octets', () => {
        const octets = lire(nom);
        // L'hôte de script de Windows ne reconnaît que le BOM UTF-16. Un BOM
        // UTF-8 lui arrive comme trois caractères, et il refuse de compiler
        // dès la colonne 1 : « Caractère incorrect ».
        assert.notDeepEqual(
          [...octets.subarray(0, 3)],
          [0xef, 0xbb, 0xbf],
          'BOM UTF-8 en tête : le script ne compilera pas',
        );
      });

      it('est en ASCII pur', () => {
        const octets = lire(nom);
        // Sans BOM, l'hôte lit le fichier dans la page de code du système.
        // Un octet UTF-8 d'accent y devient un caractère de la page 1252 —
        // parfois un caractère qu'elle ne définit pas. On s'épargne le pari.
        const fautif = octets.findIndex((octet) => octet > 127);
        assert.equal(
          fautif,
          -1,
          fautif === -1
            ? ''
            : `octet ${octets[fautif]} à la position ${fautif} : écrire ce script sans accent`,
        );
      });

      it('a des fins de ligne Windows', () => {
        const texte = lire(nom).toString('latin1');
        assert.equal(texte.includes('\n'), true);
        assert.equal(/[^\r]\n/.test(texte), false, 'une fin de ligne sans CR');
      });
    });
  }

  for (const nom of SCRIPTS_BAT) {
    it(`${nom} est en ASCII avec des fins de ligne Windows`, () => {
      const octets = lire(nom);
      assert.equal(
        octets.findIndex((octet) => octet > 127),
        -1,
        'cmd.exe et les pages de code : ce fichier s’écrit sans accent',
      );
      const texte = octets.toString('latin1');
      assert.equal(/[^\r]\n/.test(texte), false, 'une fin de ligne sans CR');
    });
  }

  it('l’icône du raccourci existe et est un vrai .ico', () => {
    const octets = lire('caisse.ico');
    // En-tête ICONDIR : réservé 0, type 1, puis le nombre d'images.
    assert.deepEqual([...octets.subarray(0, 4)], [0, 0, 1, 0]);
    assert.ok(octets.readUInt16LE(4) > 0, 'aucune image dans le fichier');
  });

  it('le lanceur et le poseur de raccourci se répondent', () => {
    const raccourci = lire('scripts/poser-raccourci.vbs').toString('ascii');
    // Le raccourci pointe vers le lanceur : si l'un est renommé sans l'autre,
    // l'icône du Bureau ouvre une boîte d'erreur.
    assert.match(raccourci, /demarrer-caisse\.vbs/);
    assert.match(raccourci, /caisse\.ico/);
    assert.ok(fs.existsSync(path.join(RACINE, 'demarrer-caisse.vbs')));
  });
});

#!/usr/bin/env python3
"""
Fabrique `caisse.ico` : le raccourci Windows a besoin d'une icône, et on ne
va pas ajouter une bibliothèque d'images pour dessiner un rond et deux barres.

Le dessin reprend la favicon de l'application — carré arrondi bleu-canard,
euro blanc — pour que l'onglet du navigateur et l'icône du bureau soient la
même chose. L'euro est dessiné pour ce qu'il est : un C, et deux barres.

Sortie : un .ico multi-tailles (16, 32, 48, 64, 128, 256), les petites en
bitmap et la grande en PNG, comme le veut le format.
"""

import math
import struct
import zlib
from pathlib import Path

FOND = (0x0B, 0x72, 0x85)   # même bleu que la favicon
TRAIT = (0xFF, 0xFF, 0xFF)

SUPER = 4  # sous-échantillonnage : 16 mesures par pixel, assez pour lisser


def couverture(x, y):
    """Part d'encre au point (x, y), en coordonnées 0..1. Renvoie (fond, trait)."""
    # --- Carré arrondi ----------------------------------------------------
    rayon = 0.22
    dx = max(rayon - x, x - (1 - rayon), 0.0)
    dy = max(rayon - y, y - (1 - rayon), 0.0)
    dans_le_carre = math.hypot(dx, dy) <= rayon

    # --- L'euro : un anneau ouvert à droite, et deux barres ---------------
    cx, cy = 0.535, 0.5
    r_ext, epaisseur = 0.285, 0.082
    d = math.hypot(x - cx, y - cy)
    sur_anneau = r_ext - epaisseur <= d <= r_ext

    # L'ouverture du C : on retire un coin à droite, entre -48° et +48°.
    angle = math.degrees(math.atan2(y - cy, x - cx))
    if sur_anneau and abs(angle) < 48:
        sur_anneau = False

    demi = epaisseur / 2
    barre_haute = 0.16 <= x <= 0.70 and abs(y - 0.425) <= demi
    barre_basse = 0.16 <= x <= 0.70 and abs(y - 0.575) <= demi

    return dans_le_carre, dans_le_carre and (sur_anneau or barre_haute or barre_basse)


def pixels(taille):
    """Renvoie une image BGRA prémultipliée-non, ligne par ligne, de haut en bas."""
    lignes = []
    for j in range(taille):
        ligne = bytearray()
        for i in range(taille):
            fond = trait = 0
            for sj in range(SUPER):
                for si in range(SUPER):
                    x = (i + (si + 0.5) / SUPER) / taille
                    y = (j + (sj + 0.5) / SUPER) / taille
                    d, t = couverture(x, y)
                    fond += d
                    trait += t
            total = SUPER * SUPER
            alpha = fond / total
            part = trait / total
            if alpha == 0:
                ligne += bytes(4)
                continue
            # Le trait se pose sur le fond, puis le tout sur la transparence.
            melange = [
                round(FOND[c] * (1 - part / alpha) + TRAIT[c] * (part / alpha))
                if alpha > 0 else 0
                for c in range(3)
            ]
            ligne += bytes([melange[2], melange[1], melange[0], round(alpha * 255)])
        lignes.append(bytes(ligne))
    return lignes


def en_bmp(lignes, taille):
    """DIB 32 bits, tel que l'attend un .ico : lignes du bas vers le haut."""
    entete = struct.pack(
        '<IiiHHIIiiII',
        40, taille, taille * 2, 1, 32, 0, taille * taille * 4, 0, 0, 0, 0,
    )
    corps = b''.join(reversed(lignes))
    masque = b'\x00' * (taille * taille // 8)  # tout opaque : l'alpha suffit
    return entete + corps + masque


def en_png(lignes, taille):
    def morceau(nom, donnees):
        bloc = nom + donnees
        return struct.pack('>I', len(donnees)) + bloc + struct.pack('>I', zlib.crc32(bloc))

    brut = b''.join(
        b'\x00' + bytes(
            octet
            for i in range(taille)
            # BGRA -> RGBA
            for octet in (ligne[i * 4 + 2], ligne[i * 4 + 1], ligne[i * 4], ligne[i * 4 + 3])
        )
        for ligne in lignes
    )
    return (
        b'\x89PNG\r\n\x1a\n'
        + morceau(b'IHDR', struct.pack('>IIBBBBB', taille, taille, 8, 6, 0, 0, 0))
        + morceau(b'IDAT', zlib.compress(brut, 9))
        + morceau(b'IEND', b'')
    )


def main():
    tailles = [16, 32, 48, 64, 128, 256]
    images = []
    for taille in tailles:
        lignes = pixels(taille)
        # Au-delà de 64, le format veut du PNG : un bitmap de 256 pèserait 256 Ko.
        images.append(en_png(lignes, taille) if taille > 64 else en_bmp(lignes, taille))

    decalage = 6 + 16 * len(images)
    entree = b''
    corps = b''
    for taille, image in zip(tailles, images):
        entree += struct.pack(
            '<BBBBHHII',
            taille if taille < 256 else 0,
            taille if taille < 256 else 0,
            0, 0, 1, 32, len(image), decalage,
        )
        corps += image
        decalage += len(image)

    Path('caisse.ico').write_bytes(
        struct.pack('<HHH', 0, 1, len(images)) + entree + corps
    )
    print(f'caisse.ico écrit ({Path("caisse.ico").stat().st_size} octets)')


if __name__ == '__main__':
    main()

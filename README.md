# Caisse — accueil piscine

Suivi de caisse et de coffre pour l'accueil de la piscine. Remplace le comptage
sur papier. Deux questions, deux réponses : **combien il y a en caisse
aujourd'hui**, et **combien il y a exactement dans le coffre**, pièce par pièce,
billet par billet.

L'application est sa propre référence : il n'y a pas de logiciel de billetterie
à côté, donc pas de total théorique auquel se comparer.

## Installation, en trois lignes

1. Installer [Node.js](https://nodejs.org) version 20 ou plus récente (choisir
   la version « LTS », accepter toutes les options par défaut).
2. Copier ce dossier sur le PC de l'accueil, par exemple dans `C:\caisse`.
3. Double-cliquer sur **`demarrer-caisse.bat`**. La première fois, l'installation
   prend une minute ; ensuite c'est immédiat.

Le navigateur s'ouvre tout seul sur <http://localhost:4173>. La fenêtre noire
doit rester ouverte tant qu'on utilise l'application : la fermer arrête tout.

> Pour que ce soit plus simple au quotidien : clic droit sur
> `demarrer-caisse.bat` → *Envoyer vers* → *Bureau (créer un raccourci)*.

Sous Linux ou macOS, `./demarrer-caisse.sh` fait la même chose.

## Les trois écrans

**Comptage du jour** — une ligne par coupure, billets puis pièces. On tape la
quantité, `Entrée` passe à la coupure suivante (`Maj`+`Entrée` revient en
arrière), et le champ se sélectionne tout seul : on tape par-dessus sans avoir à
effacer. Après la dernière pièce, `Entrée` tombe sur la recette CB. Le panneau de
droite recalcule tout en direct. *Valider et verser au coffre* enregistre la
journée et fait monter les espèces au coffre.

**Coffre** — un seul chiffre, celui qu'on doit retrouver en ouvrant la porte.
*Voir le détail* déplie l'inventaire coupure par coupure, les coupures épuisées
comprises. *Sortie du coffre* sert à sortir de l'argent : remise en banque, appro
monnaie, achat. La sortie se saisit **par coupures, jamais par montant** ; sinon
l'inventaire devient faux dès la première remise en banque.

**Journal** — une ligne par journée validée, de la plus récente à la plus
ancienne, avec le cumul en bas et les boutons d'export.

## Ce qu'il faut savoir avant de s'en servir

- **On ne modifie ni ne supprime jamais une ligne passée.** Une erreur se corrige
  par un nouveau mouvement daté et motivé. C'est ce qui rend l'historique
  opposable en cas de litige sur un écart. La base elle-même refuse toute
  modification, pas seulement l'interface.
- **La CB n'entre pas dans le coffre.** Elle compte dans la recette et dans le
  journal, jamais dans le solde.
- **Valider une journée verse la totalité du comptage au coffre**, fond de caisse
  compris. *(À confirmer avec le responsable : si le fond reste physiquement dans
  la caisse le soir, il faudra saisir quelles coupures y restent, et la
  validation changera — voir « Points ouverts ».)*
- Chaque opération est enregistrée avec les initiales sélectionnées en haut à
  droite. Il n'y a ni compte ni mot de passe : c'est une signature, pas une
  sécurité.

## Sauvegarde

L'application tourne sur un seul PC, avec toutes les données dans un fichier.
C'est le point faible de l'architecture, et il concerne de l'argent.

- Une **copie horodatée de la base** est écrite dans `sauvegardes/` à **chaque
  journée validée**. Les 30 dernières sont conservées, les plus anciennes sont
  supprimées automatiquement.
- **Export CSV** de tout l'historique depuis l'écran Journal et depuis les
  paramètres : journal des journées, mouvements du coffre, inventaire courant.
  Les fichiers s'ouvrent d'un double-clic dans un tableur français et restent
  lisibles sans l'application.

**À faire en plus, et l'application ne peut pas le faire à votre place :** copier
de temps en temps le dossier `sauvegardes/` sur une clé USB ou un lecteur réseau.
Une sauvegarde qui reste sur le disque qui peut tomber en panne n'est pas une
sauvegarde.

## Pour développer

```sh
npm install        # une seule fois
npm test           # tests de l'arithmétique, du coffre, de l'API, des exports
npm run dev:api    # API sur le port 4173
npm run dev:web    # front sur le port 5173, avec rechargement à chaud
npm run build      # construit le front dans client/dist
npm start          # sert l'API et le front buildé sur le port 4173
```

### Organisation

| Dossier   | Rôle |
| --------- | ---- |
| `shared/` | Les 12 coupures et le formatage euro, partagés par l'API et le front |
| `server/` | Express, SQLite (`better-sqlite3`), calculs, export, sauvegarde |
| `client/` | Vite + React + TypeScript, CSS écrit à la main |

### Règles de code, non négociables

- **Tous les montants sont des entiers en centimes.** Aucun flottant : ni en
  base, ni dans l'état React, ni dans les calculs. La conversion en euros se fait
  uniquement à l'affichage, via `Intl.NumberFormat('fr-FR', …)`. La saisie en
  euros (`centimesDepuisEuros`) découpe la chaîne et assemble deux entiers, elle
  ne multiplie jamais un flottant.
- **Le solde du coffre n'est jamais stocké.** Il se recalcule à chaque appel
  depuis `mouvement_detail`. Un montant stocké finirait par diverger de
  l'inventaire, et c'est l'inventaire qui fait foi.
- Le fichier `.db` et le dossier `sauvegardes/` ne vont pas dans git.

### Modèle de données

`comptages` (une ligne par journée validée) et `comptage_detail` (le détail par
coupure) ; `mouvements_coffre` (`versement` ou `sortie`) et `mouvement_detail`
(quantité positive pour un versement, négative pour une sortie).

L'inventaire du coffre est la somme de `mouvement_detail`. Il n'existe pas
ailleurs.

`mouvements_coffre` porte un `contenant_id` figé à `1`. Il ne sert à rien
aujourd'hui, mais il évite une migration douloureuse le jour où il y aura
plusieurs caisses à compter séparément.

Les migrations sont dans `server/src/db/migrations.js` et s'appliquent au
démarrage. Ajouter une migration = pousser une entrée à la fin du tableau, jamais
modifier une entrée existante.

### Variables d'environnement

| Variable                 | Défaut             | Rôle |
| ------------------------ | ------------------ | ---- |
| `PORT`                   | `4173`             | Port d'écoute |
| `CAISSE_DB`              | `donnees/caisse.db`| Emplacement de la base |
| `CAISSE_SAUVEGARDES`     | `sauvegardes/`     | Dossier des copies |
| `CAISSE_MAX_SAUVEGARDES` | `30`               | Nombre de copies conservées |

## Périmètre

**Dans la v1** : les trois écrans, la validation, la sortie du coffre, l'export,
la sauvegarde automatique.

**Volontairement dehors** : plusieurs contenants, graphiques et statistiques,
comptes utilisateurs, accès depuis un autre poste, application mobile, gestion
des tarifs ou des entrées.

## Points ouverts

1. **Un seul coffre, ou plusieurs caisses à compter séparément ?** La v1 suppose
   un seul coffre. `contenant_id` est déjà en base pour accueillir la suite.
2. **Le fond de caisse reste-t-il dans la caisse le soir, ou tout monte-t-il au
   coffre ?** La v1 fait tout monter. Si le fond reste dans la caisse, il faudra
   saisir quelles coupures y restent : le versement ne sera plus égal au
   comptage, et `validerJournee` (`server/src/domaine/comptages.js`) devra
   soustraire les coupures laissées avant de créer le mouvement. Le reste ne
   bouge pas.

# Caisse — accueil piscine

Suivi de caisse et de coffre pour l'accueil de la piscine. Remplace le comptage
sur papier. Deux questions, deux réponses : **combien il y a en caisse
aujourd'hui**, et **combien il y a exactement dans le coffre**, pièce par pièce,
billet par billet.

L'application est sa propre référence : il n'y a pas de logiciel de billetterie
à côté, donc pas de total théorique auquel se comparer.

## Installation sur le PC de l'accueil

1. Installer [Node.js](https://nodejs.org) version 20 ou plus récente (choisir
   la version « LTS », accepter toutes les options par défaut).
2. Copier ce dossier sur le PC, par exemple dans `C:\caisse`.
3. Double-cliquer une fois sur **`installer-raccourci.bat`**. L'icône
   **Caisse piscine** apparaît sur le Bureau et dans le menu Démarrer.

C'est fini. Ensuite, on double-clique sur l'icône, et l'application s'ouvre
dans sa propre fenêtre : pas de barre d'adresse, pas d'onglets, pas de fenêtre
noire. La première ouverture prend une minute — installation et préparation de
l'affichage —, les suivantes sont immédiates.

**Tout reste sur ce PC.** Il n'y a pas de compte à créer, pas de serveur
ailleurs, aucune connexion sortante. Les données vivent dans `donnees/caisse.db`
et les copies dans `sauvegardes/`, dans ce même dossier. Le serveur n'écoute
que la machine elle-même : un autre poste du réseau ne peut pas l'atteindre.

| Fichier | À quoi il sert |
| ------- | -------------- |
| `installer-raccourci.bat` | Une fois, à l'installation : pose l'icône sur le Bureau |
| `demarrer-caisse.vbs` | Ce que lance l'icône. Se double-clique aussi directement |
| `arreter-caisse.bat` | Arrête le serveur. Utile avant de copier ou de déplacer le dossier |
| `demarrer-caisse.bat` | La même chose, mais avec la fenêtre noire visible : à utiliser quand ça ne démarre pas, pour lire l'erreur |

### Ce qu'il faut savoir

**Fermer la fenêtre n'arrête pas l'application.** Le serveur continue en
arrière-plan, sans fenêtre, et la rouvrir est instantané — c'est ce qui la fait
ressembler à un logiciel installé plutôt qu'à un site. Il s'arrête à l'extinction
du PC, ou avec `arreter-caisse.bat`.

**Relancer l'icône deux fois n'ouvre pas deux caisses.** Le lanceur vérifie
d'abord si elle tourne déjà ; le cas échéant il se contente de rouvrir la
fenêtre. Deux serveurs sur la même base seraient un très mauvais moment à passer.

**Pour qu'elle soit prête dès l'allumage du poste** : copier le raccourci du
Bureau, puis `Windows`+`R`, taper `shell:startup`, `Entrée`, et coller le
raccourci dans le dossier qui s'ouvre.

Sous Linux ou macOS, `./demarrer-caisse.sh` démarre le serveur dans le terminal
et l'application s'ouvre à l'adresse <http://localhost:4173>.

## Se connecter

L'application s'ouvre sur une page de connexion : on clique sur son prénom, on
tape son mot de passe, on entre. La session tient une journée de service large
(14 h) et survit à un redémarrage de l'application — fermer la fenêtre noire ne
déconnecte personne en plein comptage.

**Le mot de passe initial d'un agent est son prénom en majuscules** (`BRUNO`,
`MARIE`). Il se change dans les paramètres, une fois connecté — et il n'y a que
là qu'il se change.

Deux agents existent au premier démarrage : **Bruno Ricci** (`BR`) et
**Marie Lefevre** (`ML`).

### Ajouter, modifier, désactiver, supprimer un agent

Tout se passe dans **Paramètres → Agents d'accueil** :

- **Ajouter** : prénom et nom suffisent. Les initiales se déduisent du nom, et
  le mot de passe initial est le prénom en majuscules. Deux personnes aux mêmes
  initiales sont numérotées entre parenthèses : `ML`, puis `ML(2)`, `ML(3)` —
  et ces initiales-là se tapent telles quelles à la connexion.
- **Mon mot de passe** : chacun change le sien, depuis sa propre session. Il
  faut donner l'ancien — un poste laissé ouvert une minute ne suffit donc pas à
  s'installer sur un compte — et taper le nouveau **deux fois**, parce qu'on ne
  relit pas un mot de passe masqué et qu'une faute de frappe enfermerait dehors.
- **Le mot de passe d'un collègue est hors d'atteinte.** Il n'existe aucun moyen
  de le choisir, ni même de le remettre au prénom : un mot de passe qu'un autre
  poste peut ramener à une valeur connue n'est plus un mot de passe. La
  contrepartie est réelle et il faut la connaître : **un mot de passe oublié est
  perdu**. La seule sortie est de désactiver le compte et d'en créer un autre —
  l'historique déjà écrit garde le nom de l'ancien.
- **Désactiver** : l'agent ne peut plus se connecter, mais son nom reste dans
  l'historique déjà écrit. On ne peut pas se désactiver soi-même, ni désactiver
  le dernier agent actif — plus personne ne pourrait entrer.
- **Supprimer** : le compte disparaît pour de bon. Il faut taper **son propre
  mot de passe**, celui de la session ouverte — pas celui de l'agent supprimé :
  le poste reste ouvert entre deux passages, et ce mot de passe est la seule
  chose qui distingue « c'est bien moi qui le décide » de « quelqu'un est passé
  derrière le comptoir ». On ne peut pas se supprimer soi-même, ni supprimer le
  dernier agent actif.

  **L'historique ne bouge pas.** Les comptages et les mouvements du coffre ne
  connaissent pas les agents par leur identifiant : ils portent leurs initiales,
  écrites une fois pour toutes. Un agent disparaît de la liste, pas du journal —
  et ses initiales ne sont jamais redonnées à quelqu'un d'autre, sans quoi un
  versement de 2026 signé `ML` finirait par désigner deux personnes.

Tout agent connecté peut gérer les autres : l'équipe fait trois personnes autour
du même comptoir, et une hiérarchie de rôles coûterait plus qu'elle ne
protégerait.

### Ce que cette connexion protège, et ce qu'elle ne protège pas

Elle empêche qu'un visiteur passant derrière le comptoir ouvre l'application, et
elle garantit qu'une opération est signée par la personne réellement connectée —
le poste ne peut plus signer au nom d'un collègue. Personne ne peut non plus
toucher au mot de passe d'un autre, à aucun titre : chacun ne peut agir que sur
le sien, et seulement depuis sa propre session.

Elle ne protège pas contre quelqu'un qui connaît l'équipe : **un prénom en
majuscules se devine**. Si l'application doit un jour compter pour un contrôle,
il faut de vrais mots de passe. Le changement se fait dans les paramètres, sans
rien toucher au code.

Côté technique, les mots de passe ne sont **jamais stockés en clair** : ils
passent par `scrypt` avec un sel propre à chaque agent. Le jeton de session vit
dans un cookie `HttpOnly`, hors de portée de tout script de la page.

## Les trois écrans

**Comptage du jour** — une ligne par coupure, billets puis pièces. On tape la
quantité, `Entrée` **ou la flèche du bas** passe à la coupure suivante
(`Maj`+`Entrée` ou la flèche du haut revient en arrière), et le champ se
sélectionne tout seul : on tape par-dessus sans avoir à effacer. Après la
dernière pièce on enchaîne sur la recette CB, puis sur le montant des chèques.
Le panneau de droite recalcule tout en direct.
*Valider et verser au coffre* enregistre la journée et fait monter les espèces
et les chèques au coffre.

**Coffre** — un seul chiffre, celui qu'on doit retrouver en ouvrant la porte.
Dessous, deux pastilles rappellent ce que contient chaque caisse. *Voir le
détail* déplie les deux caisses côte à côte, coupure par coupure, les coupures
épuisées comprises. *Sortie du coffre* sert à sortir de l'argent : remise en
banque, appro monnaie, achat. La sortie se saisit **par coupures, jamais par
montant** ; sinon l'inventaire devient faux dès la première remise en banque.
Les chèques sortent avec, et un bouton *Tout sortir* les prend d'un coup. La
feuille se ferme à `Échap`, au bouton *Annuler*, ou en la tirant vers le bas.

*Faire la monnaie* sert à l'autre besoin : échanger des coupures sans toucher au
solde. Deux colonnes — ce qu'on donne au coffre, ce qu'on y reprend — et le pied
de la feuille affiche en permanence ce qu'il reste à équilibrer. Tant que les
deux côtés ne tombent pas sur le même montant, le bouton reste inerte.

**Journal** — une ligne par journée validée, de la plus récente à la plus
ancienne, avec le cumul en bas et les boutons d'export. Dessous, **l'historique
du coffre** : tout ce qui y est entré, sorti ou a été échangé, coupure par
coupure. Un change y figure avec un effet sur le solde de `0,00 €` — c'est
exactement ce qu'il fait.

**Statistiques** — ce que la caisse a encaissé, et par quel moyen. Une fenêtre
au choix — 7 jours, 30 jours, tout, ou *Personnaliser* qui ouvre un calendrier
où l'on prend le premier jour puis le dernier —, la recette de la période en gros,
puis sa décomposition **espèces / carte / chèques** : une barre pour la
proportion, et juste dessous les montants et les parts en toutes lettres — la
couleur ne porte jamais l'information toute seule. Dessous, l'évolution, dont le
pas s'adapte à la fenêtre : par jour jusqu'à un mois, par semaine jusqu'à quatre,
par mois au-delà.

La moyenne est calculée **sur les journées travaillées**, pas sur les jours du
calendrier : la piscine ferme, et diviser par des jours fermés dirait n'importe
quoi. Rien n'est stocké — tout se recalcule depuis le journal.

Prendre deux fois la même date affiche **cette journée-là** : le titre la nomme
en toutes lettres, la comparaison se fait à la veille, et la moyenne comme
l'histogramme s'effacent — sur un seul jour, ils répéteraient le chiffre déjà
écrit en gros.

**Paramètres** — les agents, les sauvegardes et les exports. Rien à y valider :
chaque action y prend effet immédiatement.

## Ce qu'il faut savoir avant de s'en servir

- **On ne modifie ni ne supprime jamais une ligne passée.** Une erreur se corrige
  par un nouveau mouvement daté et motivé. C'est ce qui rend l'historique
  opposable en cas de litige sur un écart. La base elle-même refuse toute
  modification, pas seulement l'interface.
- **La CB n'entre pas dans le coffre.** Elle compte dans la recette et dans le
  journal, jamais dans le solde. **Les chèques, eux, y entrent** : ils sont
  physiquement au coffre, donc ils comptent dans le solde.
- **Le fond de caisse reste dans le tiroir.** Valider une journée verse au
  coffre le comptage **moins la composition du fond**, coupure par coupure — de
  quoi rendre la monnaie le lendemain sans rouvrir le coffre.
- **Faire la monnaie n'est ni une sortie ni un versement.** C'est un mouvement
  d'un troisième type, qui ne déplace aucune somme : deux lignes — une sortie
  puis un versement — auraient gonflé les totaux du jour et laissé croire à un
  mouvement de fonds qui n'a pas eu lieu.
- Chaque opération est enregistrée avec les initiales de l'agent **connecté**,
  et non avec celles choisies dans un menu : le poste ne peut pas signer au nom
  d'un collègue.

### Le fond de caisse

Le fond n'est pas un montant, c'est une **composition** : tant de billets de 20,
tant de pièces de 50 centimes. Elle se règle **depuis l'écran de comptage**, par
le petit crayon à côté de la ligne « Fond de caisse » — c'est en comptant qu'on
s'aperçoit qu'elle ne colle plus, il ne faut pas avoir à chercher où la
corriger. Ce sont ces quantités qui sont retirées du versement à chaque
validation.

Le montant du fond ne se saisit pas : il se **déduit** de la composition, comme
le solde du coffre se déduit de son inventaire. Un montant mis de côté finirait
par diverger de ce qu'on trouve réellement dans le tiroir.

Si le comptage du soir ne contient pas de quoi laisser le fond — par exemple 3
pièces de 1 € alors que le fond en demande 8 — la validation est **refusée** et
le message nomme les coupures qui manquent. Il faut alors recompter, ou ajuster
la composition du fond.

Au premier démarrage, un fond de 100 € tout fait est proposé.

### Les deux caisses du coffre

Le coffre contient une caisse grise et une caisse rouge. La règle de rangement :

- par défaut, tout va dans la **caisse grise** ;
- dès qu'on a **10 billets d'une même valeur**, on en fait une liasse qui part
  dans la **caisse rouge** — le reste de la pile demeure en grise ;
- les **billets de 50 €** et les **chèques** vont en caisse rouge quel que soit
  leur montant ;
- les **pièces** restent en caisse grise.

L'application **calcule** ce rangement, elle ne le fait pas saisir. C'est la même
raison que pour le solde : un rangement stocké finirait par diverger de
l'inventaire. Un versement ou une sortie réajuste donc le rangement tout seul, et
l'écran Coffre dit ce qui doit se trouver dans chaque caisse.

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
| `shared/` | Les 12 coupures, le formatage euro, la règle de rangement du coffre et l'agrégation des recettes, partagés par l'API et le front |
| `server/src/domaine/agents.js` | Agents, hachage `scrypt`, mots de passe |
| `server/src/domaine/parametres.js` | Composition du fond de caisse |
| `server/src/domaine/sessions.js` | Jetons de session et cookie |
| `server/` | Express, SQLite (`better-sqlite3`), calculs, export, sauvegarde |
| `client/` | Vite + React + TypeScript, CSS écrit à la main |

### Interface

Direction : **doux et spacieux**. Angles très arrondis, beaucoup d'air, ombres
diffuses, contrôles généreux, palette pastel — rien ne doit agresser un agent
qui compte sa caisse en fin de service. Les mécaniques d'interaction suivent les
principes d'Apple (*Designing Fluid Interfaces*), traduits pour le web :

- **Ressorts, pas de durées fixes.** `client/src/animation/ressort.ts` est un
  petit moteur maison (~90 lignes, aucune dépendance) piloté par
  `requestAnimationFrame`. Deux paramètres — amortissement et réponse — plutôt
  que masse/raideur/frottement. Une seule boucle pour toute l'application.
- **Tout est interruptible.** Une animation ne verrouille jamais la saisie, et
  on peut saisir un élément en plein vol : le ressort repart de sa position et
  de sa vitesse réelles, pas de sa cible.
- **La vitesse du geste passe dans l'animation.** Au relâchement, on projette
  où le geste finirait (décroissance exponentielle, `projeter()`) et on décide
  à partir de là — pas depuis le point de relâchement.
- **Résistance progressive aux limites** (`elastique()`) plutôt qu'un arrêt net.
- **Retour visuel à l'appui**, pas au relâchement.
- **Matières translucides** (`backdrop-filter`) pour le chrome, le contenu passe
  dessous. Bord de défilement en dégradé plutôt qu'un filet de 1 px.
- **Les feuilles émergent de leur déclencheur** et y retournent.
- **Tracking et leading par taille**, jamais une valeur unique. Espacements en
  `rem` : agrandir le texte du système agrandit la mise en page.
- **Une seule apparence, claire.** Pas de thème sombre : l'accueil est un lieu
  éclairé, et une seconde palette est une seconde chose à entretenir juste.
- Prise en charge de `prefers-reduced-motion`, `prefers-reduced-transparency`
  et `prefers-contrast`.

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

`agents` (prénom, nom, initiales, empreinte du mot de passe) et `sessions`
(jeton, agent, expiration) : ni l'un ni l'autre n'est de l'historique, tous deux
se modifient et aucun trigger ne les protège.

`comptages` (une ligne par journée validée) et `comptage_detail` (le détail par
coupure) ; `mouvements_coffre` (`versement`, `sortie` ou `change`) et
`mouvement_detail` (quantité positive pour un versement, négative pour une
sortie ; un change porte les deux signes et sa somme vaut zéro).

Les chèques ne sont pas des coupures : `comptages` et `mouvements_coffre` portent
un `cheques_centimes`, signé comme les quantités. Le stock de chèques au coffre est
leur somme — jamais une colonne. (`cheques_nombre` existe encore mais n'est plus
renseigné : les migrations sont append-only et l'historique déjà écrit la porte.)

La répartition entre caisse grise et caisse rouge est une fonction pure de
`shared/index.js` (`repartirCoffre`), partagée par l'API et le front pour que les
deux appliquent exactement la même règle.

L'inventaire du coffre est la somme de `mouvement_detail`. Il n'existe pas
ailleurs.

`mouvements_coffre` porte un `contenant_id` figé à `1`. Il ne désigne pas les
caisses grise et rouge — celles-ci sont un rangement calculé à l'intérieur d'un
même coffre. Il est là pour le jour où il y aura **plusieurs coffres** à compter
séparément, et évite alors une migration douloureuse.

Les migrations sont dans `server/src/db/migrations.js` et s'appliquent au
démarrage. Ajouter une migration = pousser une entrée à la fin du tableau, jamais
modifier une entrée existante.

### Variables d'environnement

| Variable                 | Défaut             | Rôle |
| ------------------------ | ------------------ | ---- |
| `PORT`                   | `4173`             | Port d'écoute |
| `CAISSE_HOTE`            | `127.0.0.1`        | Interface d'écoute. `0.0.0.0` ouvrirait la caisse au réseau — à ne faire qu'en le décidant |
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
2. ~~Le fond de caisse reste-t-il dans la caisse le soir ?~~ **Tranché : il
   reste dans le tiroir.** Sa composition se règle dans les paramètres et ses
   quantités sont retirées du versement à chaque validation.

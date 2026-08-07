# Consignes pour Claude

## Git

**Committer et pousser automatiquement, sans demander.** Dès qu'un morceau de
travail tient debout (les tests passent, le build passe), faire le commit et le
`git push -u origin <branche>` dans la foulée. Ne pas attendre qu'on le demande,
ne pas laisser de travail non poussé en fin de réponse.

- Commits atomiques, messages en français.
- Ne jamais pousser sur la branche par défaut sans autorisation explicite.
- Avant de pousser : `npm test` et `npm run build` doivent passer.

## Règles de code, non négociables

- **Tous les montants sont des entiers en centimes.** Aucun flottant : ni en
  base, ni dans l'état React, ni dans les calculs. La conversion en euros se
  fait uniquement à l'affichage.
- **Le solde du coffre n'est jamais stocké.** Il se recalcule depuis
  `mouvement_detail`. C'est l'inventaire qui fait foi.
- **On ne modifie ni ne supprime jamais une ligne passée.** Une erreur se
  corrige par un nouveau mouvement daté et motivé. Des triggers SQLite le font
  respecter en base.
- Le fichier `.db` et le dossier `sauvegardes/` ne vont pas dans git.
- Demander avant d'ajouter une dépendance.

## Public

L'application est utilisée en fin de service par des agents d'accueil, vite, au
clavier. Personne ne doit avoir à lire une notice. Les libellés et les messages
d'erreur sont en français et disent quoi faire.

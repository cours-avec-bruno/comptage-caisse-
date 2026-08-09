/**
 * Migrations SQLite, appliquées dans l'ordre au démarrage.
 *
 * On s'appuie sur `PRAGMA user_version` : il vaut le nombre de migrations
 * déjà appliquées. Ajouter une migration = pousser une entrée à la fin du
 * tableau, jamais modifier une entrée existante.
 */

/** @type {{nom: string, sql: string}[]} */
export const MIGRATIONS = [
  {
    nom: '001-schema-initial',
    sql: `
      -- Une ligne par journée validée.
      CREATE TABLE comptages (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        date              TEXT    NOT NULL,               -- AAAA-MM-JJ
        agent             TEXT    NOT NULL,
        especes_centimes  INTEGER NOT NULL,
        cb_centimes       INTEGER NOT NULL,
        fond_centimes     INTEGER NOT NULL,
        cree_le           TEXT    NOT NULL
      );

      CREATE INDEX idx_comptages_date ON comptages (date DESC, id DESC);

      -- Détail par coupure du comptage. C'est lui qui fait foi.
      CREATE TABLE comptage_detail (
        comptage_id       INTEGER NOT NULL REFERENCES comptages (id),
        coupure_centimes  INTEGER NOT NULL,
        quantite          INTEGER NOT NULL,
        PRIMARY KEY (comptage_id, coupure_centimes)
      );

      -- Toute entrée ou sortie du coffre.
      -- contenant_id est figé à 1 en v1 : il existe pour accueillir
      -- plusieurs coffres plus tard sans migration douloureuse.
      CREATE TABLE mouvements_coffre (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        contenant_id  INTEGER NOT NULL DEFAULT 1,
        date          TEXT    NOT NULL,
        agent         TEXT    NOT NULL,
        type          TEXT    NOT NULL CHECK (type IN ('versement', 'sortie')),
        motif         TEXT    NOT NULL,
        comptage_id   INTEGER REFERENCES comptages (id),
        cree_le       TEXT    NOT NULL
      );

      CREATE INDEX idx_mouvements_date ON mouvements_coffre (date DESC, id DESC);

      -- Quantité positive pour un versement, négative pour une sortie.
      -- L'inventaire du coffre est la somme de cette table, et rien d'autre.
      CREATE TABLE mouvement_detail (
        mouvement_id      INTEGER NOT NULL REFERENCES mouvements_coffre (id),
        coupure_centimes  INTEGER NOT NULL,
        quantite          INTEGER NOT NULL,
        PRIMARY KEY (mouvement_id, coupure_centimes)
      );

      CREATE TABLE parametres (
        cle    TEXT PRIMARY KEY,
        valeur TEXT NOT NULL
      );

      INSERT INTO parametres (cle, valeur) VALUES
        ('fond_defaut_centimes', '10000'),
        ('agents', 'BR');
    `,
  },
  {
    nom: '002-historique-non-modifiable',
    sql: `
      -- « On ne modifie ni ne supprime jamais une ligne passée. »
      -- La règle est dans le brief ; on la fait appliquer par la base
      -- pour qu'aucun bug applicatif ne puisse la contourner.
      CREATE TRIGGER comptages_pas_de_maj
        BEFORE UPDATE ON comptages
        BEGIN SELECT RAISE(ABORT, 'Un comptage validé ne se modifie pas'); END;

      CREATE TRIGGER comptages_pas_de_suppression
        BEFORE DELETE ON comptages
        BEGIN SELECT RAISE(ABORT, 'Un comptage validé ne se supprime pas'); END;

      CREATE TRIGGER comptage_detail_pas_de_maj
        BEFORE UPDATE ON comptage_detail
        BEGIN SELECT RAISE(ABORT, 'Le détail d''un comptage ne se modifie pas'); END;

      CREATE TRIGGER comptage_detail_pas_de_suppression
        BEFORE DELETE ON comptage_detail
        BEGIN SELECT RAISE(ABORT, 'Le détail d''un comptage ne se supprime pas'); END;

      CREATE TRIGGER mouvements_pas_de_maj
        BEFORE UPDATE ON mouvements_coffre
        BEGIN SELECT RAISE(ABORT, 'Un mouvement de coffre ne se modifie pas'); END;

      CREATE TRIGGER mouvements_pas_de_suppression
        BEFORE DELETE ON mouvements_coffre
        BEGIN SELECT RAISE(ABORT, 'Un mouvement de coffre ne se supprime pas'); END;

      CREATE TRIGGER mouvement_detail_pas_de_maj
        BEFORE UPDATE ON mouvement_detail
        BEGIN SELECT RAISE(ABORT, 'Le détail d''un mouvement ne se modifie pas'); END;

      CREATE TRIGGER mouvement_detail_pas_de_suppression
        BEFORE DELETE ON mouvement_detail
        BEGIN SELECT RAISE(ABORT, 'Le détail d''un mouvement ne se supprime pas'); END;
    `,
  },
  {
    nom: '003-cheques',
    sql: `
      -- Les chèques entrent au coffre (caisse rouge), contrairement à la CB.
      -- Ils ne sont pas des coupures : on garde le nombre et le montant total,
      -- ce qui suffit à vérifier la caisse rouge en ouvrant la porte.
      ALTER TABLE comptages ADD COLUMN cheques_nombre   INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE comptages ADD COLUMN cheques_centimes INTEGER NOT NULL DEFAULT 0;

      -- Signés comme les quantités de coupures : positifs pour un versement,
      -- négatifs pour une sortie. Le stock de chèques se recalcule par somme.
      ALTER TABLE mouvements_coffre ADD COLUMN cheques_nombre   INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE mouvements_coffre ADD COLUMN cheques_centimes INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    nom: '004-agents-et-sessions',
    sql: `
      -- Les agents ne sont pas de l'historique : contrairement aux comptages,
      -- ils se modifient. Aucun trigger ne les protège, et c'est voulu.
      CREATE TABLE agents (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        prenom     TEXT    NOT NULL,
        nom        TEXT    NOT NULL,
        initiales  TEXT    NOT NULL UNIQUE,
        mdp_hash   TEXT    NOT NULL,
        mdp_sel    TEXT    NOT NULL,
        actif      INTEGER NOT NULL DEFAULT 1,
        cree_le    TEXT    NOT NULL
      );

      -- Le jeton de session vit en base plutôt qu'en mémoire : redémarrer
      -- l'application ne doit pas déconnecter l'agent en plein comptage.
      CREATE TABLE sessions (
        jeton     TEXT    PRIMARY KEY,
        agent_id  INTEGER NOT NULL REFERENCES agents (id),
        cree_le   TEXT    NOT NULL,
        expire_le TEXT    NOT NULL
      );

      CREATE INDEX idx_sessions_agent ON sessions (agent_id);

      -- La liste d'initiales vivait dans les paramètres ; elle vit désormais
      -- dans la table agents.
      DELETE FROM parametres WHERE cle = 'agents';
    `,
  },
  {
    nom: '005-fond-par-composition',
    sql: `
      -- Le fond de caisse cesse d'être un montant pour devenir une
      -- composition : tant de billets de 20, tant de pièces de 50 centimes.
      --
      -- Sans elle, retirer le fond enlevait bien le montant de la recette,
      -- mais laissait monter au coffre les pièces qui doivent rester dans le
      -- tiroir pour rendre la monnaie le lendemain.
      --
      -- Le montant du fond n'est plus stocké : il se recalcule depuis la
      -- composition, comme le solde du coffre depuis son inventaire.
      INSERT INTO parametres (cle, valeur) VALUES (
        'fond_composition',
        '{"2000":2,"1000":2,"500":4,"100":8,"50":12,"20":15,"10":20,"5":10,"2":10,"1":30}'
      );

      DELETE FROM parametres WHERE cle = 'fond_defaut_centimes';
    `,
  },
  {
    nom: '006-change-de-monnaie',
    sql: `
      -- Un troisième type de mouvement : le change.
      --
      -- Faire la monnaie sur un billet de 50 ne fait ni entrer ni sortir
      -- d'argent du coffre : le solde ne bouge pas, seule sa composition
      -- change. L'écrire comme une sortie suivie d'un versement aurait menti
      -- deux fois dans l'historique et gonflé les totaux de la journée.
      --
      -- SQLite ne sait pas modifier une contrainte CHECK : la procédure
      -- officielle est de reconstruire la table. Les lignes sont recopiées
      -- telles quelles, identifiant compris — aucune n'est modifiée, aucune
      -- n'est perdue — et les triggers qui interdisent d'y toucher sont
      -- replacés sur la table reconstruite.
      CREATE TABLE mouvements_coffre_nouveau (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        contenant_id     INTEGER NOT NULL DEFAULT 1,
        date             TEXT    NOT NULL,
        agent            TEXT    NOT NULL,
        type             TEXT    NOT NULL
                         CHECK (type IN ('versement', 'sortie', 'change')),
        motif            TEXT    NOT NULL,
        comptage_id      INTEGER REFERENCES comptages (id),
        cree_le          TEXT    NOT NULL,
        cheques_nombre   INTEGER NOT NULL DEFAULT 0,
        cheques_centimes INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO mouvements_coffre_nouveau
        (id, contenant_id, date, agent, type, motif, comptage_id, cree_le,
         cheques_nombre, cheques_centimes)
      SELECT id, contenant_id, date, agent, type, motif, comptage_id, cree_le,
             cheques_nombre, cheques_centimes
        FROM mouvements_coffre;

      DROP TABLE mouvements_coffre;
      ALTER TABLE mouvements_coffre_nouveau RENAME TO mouvements_coffre;

      CREATE INDEX idx_mouvements_date ON mouvements_coffre (date DESC, id DESC);

      CREATE TRIGGER mouvements_pas_de_maj
        BEFORE UPDATE ON mouvements_coffre
        BEGIN SELECT RAISE(ABORT, 'Un mouvement de coffre ne se modifie pas'); END;

      CREATE TRIGGER mouvements_pas_de_suppression
        BEFORE DELETE ON mouvements_coffre
        BEGIN SELECT RAISE(ABORT, 'Un mouvement de coffre ne se supprime pas'); END;
    `,
  },
];

/**
 * Applique les migrations manquantes. Idempotent.
 *
 * Les clés étrangères sont désactivées le temps des migrations : changer une
 * contrainte CHECK oblige SQLite à reconstruire la table, donc à la déposer
 * un instant alors que ses lignes filles existent encore. Le contrôle est
 * remis ensuite, et la base entière est vérifiée avant qu'on la rende — une
 * ligne orpheline ferait échouer l'ouverture plutôt que d'attendre le
 * premier calcul de solde.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]} noms des migrations appliquées lors de cet appel
 */
export function migrer(db) {
  const version = db.pragma('user_version', { simple: true });
  const appliquees = [];
  const clesEtrangeres = db.pragma('foreign_keys', { simple: true });

  // Un PRAGMA n'a aucun effet à l'intérieur d'une transaction : celui-ci se
  // pose ici, avant le premier BEGIN.
  if (clesEtrangeres) db.pragma('foreign_keys = OFF');

  try {
    for (let i = version; i < MIGRATIONS.length; i += 1) {
      const migration = MIGRATIONS[i];
      db.exec('BEGIN');
      try {
        db.exec(migration.sql);
        db.pragma(`user_version = ${i + 1}`);
        db.exec('COMMIT');
      } catch (erreur) {
        db.exec('ROLLBACK');
        throw new Error(
          `Migration « ${migration.nom} » échouée : ${erreur.message}`,
          { cause: erreur },
        );
      }
      appliquees.push(migration.nom);
    }

    const orphelines = db.pragma('foreign_key_check');
    if (orphelines.length > 0) {
      throw new Error(
        `Migration incohérente : ${orphelines.length} ligne(s) sans parent.`,
      );
    }
  } finally {
    if (clesEtrangeres) db.pragma('foreign_keys = ON');
  }

  return appliquees;
}

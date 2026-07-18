import { Umzug, SequelizeStorage } from "umzug";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { connection } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsGlob = path.join(
  path.resolve(),
  "migrations",
  "*.{js,cjs,mjs}"
);

/**
 * Versioned DB migrations via Umzug + SequelizeMeta.
 * Pending migrations are applied once; already-applied names are skipped.
 */
export function createMigrator(sequelize = connection) {
  return new Umzug({
    migrations: {
      glob: migrationsGlob,
      resolve: ({ name, path: migrationPath, context }) => ({
        name,
        up: async () => {
          const mod = await import(pathToFileURL(migrationPath).href);
          return mod.up({ context });
        },
        down: async () => {
          const mod = await import(pathToFileURL(migrationPath).href);
          if (typeof mod.down !== "function") {
            throw new Error(`Migration ${name} has no down()`);
          }
          return mod.down({ context });
        },
      }),
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

/**
 * Acquire a MySQL named lock so only one container applies migrations at a time
 * (safe for docker compose restarts / brief multi-instance overlap).
 */
async function withMigrationLock(sequelize, fn) {
  const lockName = "gloup_schema_migrations";
  const [rows] = await sequelize.query("SELECT GET_LOCK(?, 60) AS acquired", {
    replacements: [lockName],
  });
  const acquired = rows?.[0]?.acquired;
  if (acquired !== 1 && acquired !== "1") {
    throw new Error(
      "Could not acquire DB migration lock (another instance may be migrating)"
    );
  }
  try {
    return await fn();
  } finally {
    await sequelize.query("SELECT RELEASE_LOCK(?)", {
      replacements: [lockName],
    });
  }
}

/** Apply all pending migrations. Returns list of executed migration names. */
export async function runPendingMigrations(sequelize = connection) {
  return withMigrationLock(sequelize, async () => {
    const migrator = createMigrator(sequelize);
    const pending = await migrator.pending();
    if (!pending.length) {
      console.log("[migrate] No pending migrations");
      return [];
    }
    console.log(
      `[migrate] Applying ${pending.length} migration(s):`,
      pending.map((m) => m.name).join(", ")
    );
    const executed = await migrator.up();
    console.log(
      "[migrate] Applied:",
      executed.map((m) => m.name).join(", ") || "(none)"
    );
    return executed;
  });
}

export async function migrationStatus(sequelize = connection) {
  const migrator = createMigrator(sequelize);
  const [executed, pending] = await Promise.all([
    migrator.executed(),
    migrator.pending(),
  ]);
  return {
    executed: executed.map((m) => m.name),
    pending: pending.map((m) => m.name),
  };
}

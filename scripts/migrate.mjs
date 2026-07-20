/**
 * CLI for schema migrations.
 *
 *   node scripts/migrate.mjs            # apply pending (default)
 *   node scripts/migrate.mjs up
 *   node scripts/migrate.mjs status
 *   node scripts/migrate.mjs down       # undo last migration
 *   node scripts/migrate.mjs down 2     # undo last N
 */

import dotenv from "dotenv";
dotenv.config();

import { connection } from "../src/core/database/connection.js";
import {
  createMigrator,
  migrationStatus,
  runPendingMigrations,
} from "../src/core/database/migrator.js";

const [command = "up", arg] = process.argv.slice(2);

async function main() {
  await connection.authenticate();

  if (command === "status") {
    const status = await migrationStatus();
    console.log("Executed:\n ", status.executed.join("\n  ") || "(none)");
    console.log("Pending:\n ", status.pending.join("\n  ") || "(none)");
    return;
  }

  if (command === "up" || command === "migrate") {
    await runPendingMigrations();
    return;
  }

  if (command === "down") {
    const step = Math.max(1, Number(arg) || 1);
    const migrator = createMigrator();
    const executed = await migrator.down({ step });
    console.log(
      "[migrate] Reverted:",
      executed.map((m) => m.name).join(", ") || "(none)"
    );
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error("Usage: node scripts/migrate.mjs [up|status|down [n]]");
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[migrate] failed:", err?.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await connection.close();
    } catch {
      /* ignore */
    }
    // connection.js starts a pool-monitor setInterval that keeps the event
    // loop alive forever; a CLI must exit explicitly or deploys will hang.
    process.exit(process.exitCode || 0);
  });

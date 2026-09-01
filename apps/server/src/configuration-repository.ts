import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { Configuration, ConfigurationSchema } from "@ax/schema";

/**
 * The persistence seam for a Configuration (NIM-53). A configuration is
 * always read and written whole — nothing ever queries into its
 * internals — so this is a document store keyed by normalized URL, not a
 * relational one. Swapping SqliteConfigurationRepository for a Postgres
 * implementation later is a single substitution against this interface
 * (ADR-0007), not a rewrite of every caller.
 */
export interface ConfigurationRepository {
  get(normalizedUrl: string): Configuration | null;
  save(configuration: Configuration): void;
}

/**
 * One JSON document per normalized URL, in SQLite (ADR-0007) — chosen
 * over plain JSON files specifically for atomic writes, and over
 * Postgres/Mongo for needing no running server or setup from whoever
 * runs this project. Node's built-in node:sqlite (stable as of Node 24)
 * means that requirement extends to needing no extra native dependency
 * either — the database is a single file, created on first use.
 */
export class SqliteConfigurationRepository implements ConfigurationRepository {
  private readonly db: DatabaseSync;

  constructor(filePath: string = path.join(__dirname, "..", ".data", "configurations.sqlite")) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS configurations (
        url TEXT PRIMARY KEY,
        document TEXT NOT NULL
      )
    `);
  }

  get(normalizedUrl: string): Configuration | null {
    const row = this.db.prepare("SELECT document FROM configurations WHERE url = ?").get(normalizedUrl) as
      | { document: string }
      | undefined;
    if (!row) return null;
    return ConfigurationSchema.parse(JSON.parse(row.document));
  }

  save(configuration: Configuration): void {
    const validated = ConfigurationSchema.parse(configuration);
    this.db
      .prepare(
        `INSERT INTO configurations (url, document) VALUES (?, ?)
         ON CONFLICT(url) DO UPDATE SET document = excluded.document`,
      )
      .run(validated.url, JSON.stringify(validated));
  }
}

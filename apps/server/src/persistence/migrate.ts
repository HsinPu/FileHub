import { mkdirSync } from 'node:fs';
import { validateDatabaseConfig, type DatabaseConfig } from '../config/index.js';
import { openDatabase } from './database.js';
import { DEFAULT_MIGRATIONS_DIRECTORY, SchemaCompatibilityError } from './migrations.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function migrateDatabase(config: DatabaseConfig, migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY): void {
  config = validateDatabaseConfig(config);
  mkdirSync(config.stateDirectory, { recursive: true, mode: 0o700 });
  const database = openDatabase(config, { create: true, migrationsDirectory });
  try {
    migrate(database.db, { migrationsFolder: migrationsDirectory });
    if (!database.isReady()) throw new SchemaCompatibilityError();
  } finally { database.close(); }
}

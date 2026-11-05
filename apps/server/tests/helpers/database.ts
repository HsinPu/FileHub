import { join } from 'node:path';
import { createTemporaryDirectory } from '../../../../tests/helpers/temporary-directory.js';
import { onTestFinished } from 'vitest';
import { openDatabase, type FileHubDatabase } from '../../src/persistence/database.js';
import { migrateDatabase } from '../../src/persistence/migrate.js';

export async function databaseFixture() {
  const temporary = await createTemporaryDirectory('filehub-p03-');
  const { directory } = temporary;
  const config = { stateDirectory: join(directory, 'state'), sqliteBusyTimeoutMs: 50 };
  const connections: FileHubDatabase[] = [];
  onTestFinished(async () => {
    for (const connection of connections.reverse()) connection.close();
    await temporary.dispose();
  });
  return {
    directory,
    config,
    migrate: () => migrateDatabase(config),
    open: (stateDirectory = config.stateDirectory) => {
      const connection = openDatabase({ ...config, stateDirectory });
      connections.push(connection);
      return connection;
    },
  };
}

import { onTestFinished } from 'vitest';
import { ManagedNode } from '../helpers/node-process.js';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';

export async function temporaryDirectory(): Promise<string> {
  const temporary = await createTemporaryDirectory('filehub-p02-');
  onTestFinished(() => temporary.dispose());
  return temporary.directory;
}

export async function runNode(args: string[], cwd: string, environment: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = new ManagedNode(args, cwd, environment, false);
  try { return { ...(await child.waitForExit()), ...child.output() }; }
  finally { await child.forceStop(); }
}

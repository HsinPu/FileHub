import { parseConfig, parseWorkerConfig, type Environment } from './config/index.js';
import { openDatabase } from './persistence/database.js';
import { isHeartbeatReady, readHeartbeat, readProcessIdentity } from './worker/heartbeat.js';

export async function checkHealth(role: string | undefined, environment: Environment = process.env): Promise<boolean> {
  if (role === 'api') {
    const config = parseConfig(environment);
    const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host === '::' ? '[::1]' : config.host.includes(':') ? `[${config.host}]` : config.host;
    const response = await fetch(`http://${host}:${config.port}/health/ready`, { signal: AbortSignal.timeout(config.readinessTimeoutMs) });
    if (!response.ok) return false;
    const value: unknown = await response.json();
    return !!value && typeof value === 'object' && 'status' in value && value.status === 'ready';
  }
  if (role === 'worker') {
    const config = parseWorkerConfig(environment);
    if (!config.workerHeartbeatFile) return false;
    const snapshot = await readHeartbeat(config.workerHeartbeatFile);
    if (!snapshot || !isHeartbeatReady(snapshot, await readProcessIdentity(snapshot.pid), Date.now(), Math.max(5000, config.workerPollIntervalMs * 3))) return false;
    const database = openDatabase(config);
    try { return database.isReady(); }
    finally { database.close(); }
  }
  return false;
}

if (import.meta.main) {
  void checkHealth(process.argv[2]).then((ready) => { process.exitCode = ready ? 0 : 1; }, () => { process.exitCode = 1; });
}

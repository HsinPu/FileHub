import { randomUUID } from 'node:crypto';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/index.js';
import { installErrorHandlers } from './plugins/errors.js';
import { healthRoutes, type ReadinessProbe } from './plugins/health.js';
import { webRoutes } from './plugins/web.js';
import { identityRoutes } from './modules/identity/routes.js';
import type { IdentityService } from './modules/identity/service.js';
import type { EntryService } from './modules/entries/service.js';
import { entryRoutes } from './modules/entries/routes.js';
import { fileRoutes } from './modules/files/routes.js';
import { trashRoutes } from './modules/trash/routes.js';
import type { TrashService } from './modules/trash/service.js';
import { writeRoutes } from './modules/files/write-routes.js';
import type { MutationService } from './modules/files/mutations.js';
import type { FileService } from './modules/files/service.js';
import { uploadRoutes } from './modules/uploads/routes.js';
import type { UploadService } from './modules/uploads/service.js';
import { SearchService } from './modules/search/service.js';
import { searchRoutes } from './modules/search/routes.js';
import { PreviewService } from './modules/previews/service.js';
import { previewRoutes } from './modules/previews/routes.js';
import { operationRoutes } from './modules/operations/routes.js';
import type { OperationService } from './modules/operations/service.js';
import { artifactRoutes } from './modules/operations/artifact-routes.js';
import type { ArtifactStore } from './modules/operations/artifacts.js';

import type { ShareService } from './modules/shares/service.js';
import { shareRoutes,publicShareRoutes } from './modules/shares/routes.js';

import type { SettingsService } from './modules/settings/service.js';
import { settingsRoutes } from './modules/settings/routes.js';
export interface AppDependencies {
  readonly settings?:SettingsService;
  readonly shares?: ShareService;
  // 呼叫端保有資源 ownership；factory 只借用本次檢查函式。
  readonly readiness?: ReadinessProbe;
  readonly identity?: IdentityService;
  readonly entries?: EntryService;
  readonly files?: FileService;
  readonly mutations?: MutationService;
  readonly trash?: TrashService;
  readonly uploads?: UploadService;
  readonly operations?: OperationService;
  readonly artifacts?: ArtifactStore;
}

export interface AppOptions {
  readonly config: AppConfig;
  readonly dependencies?: AppDependencies;
  readonly webRoot?: string;
}

export function buildApp({ config, dependencies = {}, webRoot }: AppOptions): FastifyInstance {
  if (dependencies.entries && !dependencies.identity) throw new Error('Entry routes require identity');
  if (dependencies.files && (!dependencies.identity || !dependencies.entries)) throw new Error('File routes require identity and entries');
  if (dependencies.mutations && (!dependencies.identity || !dependencies.entries)) throw new Error('Mutation routes require identity and entries');
  if (dependencies.trash && (!dependencies.identity || !dependencies.entries || !dependencies.mutations)) throw new Error('Trash routes require identity, entries and mutations');
  if (dependencies.uploads && (!dependencies.identity || !dependencies.entries)) throw new Error('Upload routes require identity and entries');
  if (dependencies.operations && !dependencies.identity) throw new Error('Operation routes require identity');
  if(dependencies.artifacts&&(!dependencies.identity||!dependencies.entries||!dependencies.files))throw new Error('Artifact routes require identity, entries and files');
  if(dependencies.shares&&!dependencies.identity)throw new Error('Share owner routes require identity');
  if(dependencies.settings&&!dependencies.identity)throw new Error('Settings routes require identity');
  const app = Fastify({
    ajv:{customOptions:{removeAdditional:false}},
    logger: config.logLevel === 'silent' ? false : {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: 1_048_576,
    forceCloseConnections: 'idle',
  });
  const closing = new AbortController();
  app.addHook('preClose', async () => { closing.abort(); });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  installErrorHandlers(app);
  app.register(healthRoutes, {
    readiness: dependencies.readiness ?? (() => false),
    timeoutMs: config.readinessTimeoutMs,
    closing: closing.signal,
  });
  if (webRoot !== undefined) app.register(webRoutes, { webRoot });
  if (dependencies.identity) app.register(identityRoutes, { identity: dependencies.identity, config });
  if (dependencies.entries && dependencies.identity) app.register(entryRoutes, { entries: dependencies.entries, identity: dependencies.identity });
  if (dependencies.files && dependencies.identity) app.register(fileRoutes, { files: dependencies.files, identity: dependencies.identity });
  if (dependencies.entries && dependencies.identity) app.register(searchRoutes, { search: new SearchService(dependencies.entries), identity: dependencies.identity });
  if (dependencies.files && dependencies.identity) app.register(previewRoutes, { previews: new PreviewService(dependencies.files), identity: dependencies.identity });
  if (dependencies.mutations && dependencies.identity) app.register(writeRoutes, { mutations: dependencies.mutations, identity: dependencies.identity, config });
  if (dependencies.trash && dependencies.identity) app.register(trashRoutes, { trash: dependencies.trash, identity: dependencies.identity, config });
  if (dependencies.uploads && dependencies.identity) app.register(uploadRoutes, { uploads: dependencies.uploads, identity: dependencies.identity, config });
  if (dependencies.operations && dependencies.identity) app.register(operationRoutes, { operations: dependencies.operations, identity: dependencies.identity, config });
  if(dependencies.artifacts&&dependencies.identity)app.register(artifactRoutes,{artifacts:dependencies.artifacts,identity:dependencies.identity});
  if(dependencies.shares&&dependencies.identity){app.register(shareRoutes,{shares:dependencies.shares,identity:dependencies.identity,config});app.register(publicShareRoutes,{shares:dependencies.shares,config});}
  if(dependencies.settings&&dependencies.identity)app.register(settingsRoutes,{settings:dependencies.settings,identity:dependencies.identity,config});
  return app;
}

import { OperationCreateSchema, type OperationCreate, type OperationKind } from '@filehub/contracts';
import { Check } from 'typebox/value';
import { PublicError } from '../../plugins/errors.js';
import type { EntryService } from '../entries/service.js';
import type { FileService } from '../files/service.js';
import { parentOf } from '../files/mutations.js';
import { fileName, overlapsPath } from '../../storage/names.js';
import { relativePath } from '../../storage/scoped.js';
import { OperationCatalog, operationResources } from './catalog.js';
import type { Reservation } from '../../storage/reservations.js';

export class OperationService {
  constructor(readonly catalog: OperationCatalog, readonly entries: EntryService, readonly files: FileService, private readonly enabled: ReadonlySet<OperationKind> = new Set()) {}
  capabilities(){this.catalog.ready();return{kinds:process.platform==='linux'?[...this.enabled]:[],maxSources:16};}
  async create(user: string, input: OperationCreate, reauthorize = () => {}) {
    if (!Check(OperationCreateSchema, input)) throw new PublicError('BAD_REQUEST');
    this.entries.list(user);
    const prior = this.catalog.prior(user, input); if (prior) return prior;
    if (process.platform !== 'linux' || !this.enabled.has(input.kind)) throw new PublicError('WRITE_UNSUPPORTED');
    if ((input.kind === 'archive') === !!input.destination) throw new PublicError('BAD_REQUEST');
    if(input.kind==='archive'&&input.conflict!=='stop')throw new PublicError('BAD_REQUEST');
    const resources: Reservation[] = [];
    for (const source of input.sources) {
      relativePath(source.path); if (!source.path) throw new PublicError('BAD_REQUEST');
      const access = this.entries.authorize(user, source.entryId, source.path, 'download');
      if (input.kind === 'move') { this.entries.authorize(user, source.entryId, source.path, 'write'); this.entries.authorize(user, source.entryId, parentOf(source.path), 'write'); if (source.path === access.scope) throw new PublicError('BAD_REQUEST'); }
      if (source.name) fileName(source.name);
      if(input.destination)relativePath([input.destination.path,source.name??source.path.split('/').at(-1)].filter(Boolean).join('/'));
      if (resources.some((other) => other.entryId === source.entryId && overlapsPath(other.path, source.path))) throw new PublicError('BAD_REQUEST');
      const metadata = await this.files.metadata(user, source.entryId, source.path);
      if (metadata.resource.version !== source.version || !['file','directory'].includes(metadata.resource.kind)) throw new PublicError('CONFLICT');
      resources.push({ entryId: source.entryId, path: source.path });
    }
    if (input.destination) {
      const target = input.destination; this.entries.authorize(user, target.entryId, target.path, 'write');
      const directory = await this.files.metadata(user, target.entryId, target.path);
      if (directory.resource.kind !== 'directory' || directory.resource.version !== target.version) throw new PublicError('CONFLICT');
      if (resources.some((source) => source.entryId === target.entryId && (source.path === target.path || target.path.startsWith(`${source.path}/`)))) throw new PublicError('BAD_REQUEST');
      if (input.sources.some((source) => source.entryId === target.entryId && source.path === [target.path, source.name ?? source.path.split('/').at(-1)].filter(Boolean).join('/'))) throw new PublicError('BAD_REQUEST');
      resources.push({ entryId: target.entryId, path: target.path });
    }
    // FS 預檢後再驗權限；short transaction 僅寫 catalog／reservation。
    reauthorize();
    for (const source of input.sources) { this.entries.authorize(user, source.entryId, source.path, 'download'); if (input.kind === 'move') { this.entries.authorize(user, source.entryId, source.path, 'write'); this.entries.authorize(user, source.entryId, parentOf(source.path), 'write'); } }
    if (input.destination) this.entries.authorize(user, input.destination.entryId, input.destination.path, 'write');
    return this.catalog.enqueue(user, input, operationResources(input));
  }
}

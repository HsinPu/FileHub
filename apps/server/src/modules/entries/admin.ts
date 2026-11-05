import { PublicError } from '../../plugins/errors.js';
import type { FileHubDatabase } from '../../persistence/database.js';
import { SettingsService } from '../settings/service.js';
import { IdentityService } from '../identity/service.js';
import { EntryService } from './service.js';

export async function runEntryAdmin(database: FileHubDatabase, args: readonly string[]): Promise<unknown> {
  const [command, ...values] = args;
  const service = new EntryService(database);
  if(command==='entry-offer'&&values.length===3){const [kind,label,path]=values;if((kind!=='managed'&&kind!=='external')||!label||!path)throw new PublicError('BAD_REQUEST');return new SettingsService(database,new IdentityService(database),service).offerEntry(kind,label,path);}
  if (command === 'entry-add' && values.length === 3) {
    const [kind, label, path] = values;
    if ((kind !== 'managed' && kind !== 'external') || !label || !path) throw new PublicError('BAD_REQUEST');
    return service.register(kind, label, path);
  }
  if (command === 'entry-list' && values.length === 0) {
    return database.sqlite.prepare('SELECT id, label, kind, enabled FROM entries ORDER BY label, id').all();
  }
  if (command === 'entry-disable' && values.length === 1 && values[0]) return service.disable(values[0]);
  if (command === 'entry-write' && values.length === 2 && values[0] && ['on', 'off'].includes(values[1] ?? '')) return service.setWritable(values[0], values[1] === 'on');
  if (command === 'entry-grant' && (values.length === 3 || values.length === 4)) {
    const [user, entry, scope, mode = 'download'] = values;
    if (!user || !entry || scope === undefined || !['browse', 'download', 'write'].includes(mode)) throw new PublicError('BAD_REQUEST');
    return service.grant(user, entry, scope === '.' ? '' : scope, mode !== 'browse', mode === 'write');
  }
  if (command === 'entry-revoke' && values.length === 3) {
    const [user, entry, scope] = values;
    if (!user || !entry || scope === undefined) throw new PublicError('BAD_REQUEST');
    return service.revoke(user, entry, scope === '.' ? '' : scope);
  }
  throw new PublicError('BAD_REQUEST');
}

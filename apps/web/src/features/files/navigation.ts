import { useCallback, useEffect, useRef, useState } from 'react';

export type SettingsSection = 'personal' | 'accounts' | 'storage';
export type PrivateView = 'files' | 'settings' | 'shares' | 'trash';
export interface Location { entry: string; path: string; sort: 'name' | 'size' | 'modifiedAt'; direction: 'asc' | 'desc'; page: number; version: string; filter?: string; view?: PrivateView; section?: SettingsSection }
export function parseLocation(search: string): Location {
  const query = new URLSearchParams(search);
  const sort = query.get('sort'), direction = query.get('direction'), version = query.get('version') ?? '', page = Number(query.get('page') ?? 1), section = query.get('section'), view = query.get('view');
  return { entry: query.get('entry') ?? '', path: query.get('path') ?? '', sort: sort === 'size' || sort === 'modifiedAt' ? sort : 'name', direction: direction === 'desc' ? 'desc' : 'asc',
    page: Number.isInteger(page) && page >= 1 && page <= 201 && /^[a-f0-9]{64}$/.test(version) ? page : 1, version, filter: (query.get('filter') ?? '').slice(0, 128),
    view: view === 'settings' || view === 'shares' || view === 'trash' ? view : 'files', section: section === 'accounts' || section === 'storage' ? section : 'personal' };
}
export function href(location: Location): string {
  const query = new URLSearchParams({ entry: location.entry, path: location.path, sort: location.sort, direction: location.direction });
  if (location.view === 'settings') { query.set('view', 'settings'); query.set('section', location.section ?? 'personal'); }
  else if (location.view === 'shares' || location.view === 'trash') query.set('view', location.view);
  if (location.filter) query.set('filter', location.filter);
  if (location.page > 1) { query.set('page', String(location.page)); query.set('version', location.version); }
  return `/?${query.toString()}`;
}
export type NavigationGuard = () => boolean;
export type RegisterNavigationGuard = (guard: NavigationGuard) => () => void;
const indexKey = 'filehubNavigationIndex';
function historyIndex(state: unknown): number | undefined {
  if (!state || typeof state !== 'object' || !(indexKey in state)) return;
  const index: unknown = state[indexKey];
  return typeof index === 'number' && Number.isSafeInteger(index) ? index : undefined;
}
function stamp(index: number) { return { ...(window.history.state && typeof window.history.state === 'object' ? window.history.state as Record<string, unknown> : {}), [indexKey]: index }; }
export function useLocation() {
  const [location, setLocation] = useState(() => parseLocation(window.location.search));
  const current = useRef(location), index = useRef(historyIndex(window.history.state) ?? 0), restoring = useRef<number | undefined>(undefined), guard = useRef<NavigationGuard | undefined>(undefined);
  const registerGuard: RegisterNavigationGuard = useCallback(next => { guard.current = next; return () => { if (guard.current === next) guard.current = undefined; }; }, []);
  const canLeave = useCallback(() => guard.current?.() ?? true, []);
  useEffect(() => {
    window.history.replaceState(stamp(index.current), '', window.location.href);
    const pop = (event: PopStateEvent) => {
      const next = parseLocation(window.location.search), target = historyIndex(event.state);
      // 取消返回只復原一次，不再對復原的 popstate 詢問或重新推入歷史。
      if (restoring.current !== undefined && target === restoring.current) { restoring.current = undefined; return; }
      if (href(next) !== href(current.current) && !canLeave()) {
        if (target !== undefined && target !== index.current) { restoring.current = index.current; window.history.go(index.current - target); }
        else window.history.replaceState(stamp(index.current), '', href(current.current));
        return;
      }
      restoring.current = undefined; index.current = target ?? index.current; current.current = next; setLocation(next);
    };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, [canLeave]);
  const navigate = useCallback((next: Location, replace = false) => {
    const url = href(next);
    if (url === href(current.current)) return true;
    if (restoring.current !== undefined || !canLeave()) return false;
    if (!replace) index.current += 1;
    window.history[replace ? 'replaceState' : 'pushState'](stamp(index.current), '', url);
    current.current = next; setLocation(next); return true;
  }, [canLeave]);
  return { location, navigate, registerGuard, canLeave };
}

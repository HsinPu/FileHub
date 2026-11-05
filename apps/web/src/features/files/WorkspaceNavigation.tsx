import type { MouseEvent } from 'react';
import type { PublicEntry } from '@filehub/contracts';
import { href, type Location, type PrivateView } from './navigation.js';
import { ToolIcon } from '../../app/ToolIcon.js';

export function WorkspaceNavigation({ entries, current, scope, location, page, navigate, files, shares, trash, activate, username }: {
  entries: PublicEntry[]; current: PublicEntry | undefined; scope: string; location: Location; page: PrivateView;
  navigate(next: Location): void; files(): void; shares(): void; trash(): void; activate(action: () => void): void; username: string;
}) {
  const target = (entry: PublicEntry, path: string): Location => ({ ...location, view: 'files', entry: entry.id, path, filter: '', page: 1, version: '' });
  const click = (event: MouseEvent<HTMLAnchorElement>, action: () => void) => { if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); activate(action); };
  return <div className="workspace-navigation">
    <p className="navigation-heading">工作空間</p>
    <nav className="workspace-links" aria-label="主要導覽">
      <a href={href({...location,view:'files'})} className={page === 'files' ? 'active' : ''} aria-current={page === 'files' ? 'page' : undefined} onClick={event => click(event,files)}><ToolIcon name="files"/>檔案</a>
      <a href={href({...location,view:'shares'})} className={page === 'shares' ? 'active' : ''} aria-current={page === 'shares' ? 'page' : undefined} onClick={event => click(event,shares)}><ToolIcon name="share"/>分享管理</a>
      <a href={href({...location,view:'trash'})} className={page === 'trash' ? 'active' : ''} aria-current={page === 'trash' ? 'page' : undefined} onClick={event => click(event,trash)}><ToolIcon name="trash"/>垃圾桶</a>
      <a href={href({...location,view:'settings',section:'personal'})} className={page === 'settings' ? 'active' : ''} aria-current={page === 'settings' ? 'page' : undefined} onClick={event => click(event, () => navigate({...location,view:'settings',section:'personal'}))}><ToolIcon name="settings"/>設定</a>
    </nav>
    <div className="entry-heading">儲存入口</div>
    <nav className="entry-nav" aria-label="儲存入口">{entries.flatMap(entry => entry.scopes.map(item => <div className={`entry-link${page === 'files' && current?.id === entry.id && scope === item.path ? ' active' : ''}`} key={`${entry.id}:${item.path}`}><a href={href(target(entry,item.path))} aria-current={page === 'files' && current?.id === entry.id && scope === item.path ? 'page' : undefined} onClick={event => click(event, () => navigate(target(entry,item.path)))}><ToolIcon name="storage"/><span>{entry.label}<small>{item.path ? `範圍：${item.path}` : entry.kind === 'managed' ? '內建儲存' : '外部資料夾'}</small></span></a></div>))}</nav>
    <div className="sidebar-footer"><a href={href({...location,view:'settings',section:'personal'})} onClick={event => click(event, () => navigate({...location,view:'settings',section:'personal'}))}>{username}</a><span className="version">v{__FILEHUB_VERSION__}</span></div>
  </div>;
}

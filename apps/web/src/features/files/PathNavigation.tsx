import { useRef, useState, type ReactNode } from 'react';
import { Button, Input } from 'antd';
import type { ListingResponse } from '@filehub/contracts';
import { href, type Location } from './navigation.js';
import { ToolIcon } from '../../app/ToolIcon.js';

export function PathNavigation({ value, location, navigate, label, readOnly, summary, actions }: { value: ListingResponse | undefined; location: Location; navigate(next: Location): void; label: string; readOnly: boolean; summary:ReactNode; actions:ReactNode }) {
  const [editing, setEditing] = useState(false), [text, setText] = useState(location.path);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setEditing(false); trigger.current?.focus(); };
  const relative = value?.scope ? value.path.slice(value.scope.length).replace(/^\//, '') : value?.path ?? '';
  const parts = relative ? relative.split('/') : [];
  const target = (path: string): Location => ({ ...location, path, filter: '', page: 1, version: '' });
  const crumbs = value ? [{ name: value.scope ? `授權範圍：${value.scope}` : '入口根目錄', path: value.scope }, ...parts.map((name, index) => ({ name, path: [value.scope, ...parts.slice(0, index + 1)].filter(Boolean).join('/') }))] : [];
  return <div className="path-navigation"><div className="workspace-heading"><div className="workspace-title">
    <div className="path-heading">
      <nav className="file-breadcrumbs" aria-label="目錄層級" aria-description={`目前入口：${label}`}><ol>{crumbs.map((crumb, index) => <li key={crumb.path}>{index > 0 && <ToolIcon name="chevron"/>}<a aria-label={index === 0 ? crumb.name : undefined} title={index === 0 ? crumb.name : undefined} href={href(target(crumb.path))} aria-current={index === crumbs.length - 1 ? 'page' : undefined} onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(target(crumb.path)); }}>{index === 0 ? <ToolIcon name="home"/> : crumb.name}</a></li>)}</ol></nav>
      <Button ref={trigger} type="text" aria-expanded={editing} aria-controls="path-editor" onClick={() => { if (editing) close(); else { setText(location.path); setEditing(true); } }}>前往路徑</Button>
    </div>
    <div className="file-title-line"><h1>{relative.split('/').filter(Boolean).at(-1) || label}</h1>{summary}<span className="entry-access">{readOnly ? '唯讀' : '可寫入'}</span></div>
    </div>{actions}</div>
    {editing && <form id="path-editor" className="path-form" onSubmit={event => { event.preventDefault(); navigate(target(text)); close(); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}><label htmlFor="relative-path">相對路徑</label><Input id="relative-path" autoFocus value={text} maxLength={1024} onChange={event => setText(event.target.value)} placeholder="入口根目錄"/><Button htmlType="submit">前往</Button></form>}
  </div>;
}

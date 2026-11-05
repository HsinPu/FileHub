import { useLayoutEffect, useRef } from 'react';
import { href, type Location, type PrivateView, type SettingsSection } from '../files/navigation.js';

/** 路由連結共用 Workspace 的離頁守衛，不另建分頁狀態。 */
export function ManagementNavigation({ location, administrator, canTrash, navigate }: { location: Location; administrator: boolean; canTrash: boolean; navigate(next: Location): void }) {
  const navigation = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navigation.current, active = nav?.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    if (!nav || !active) return;
    if (active.offsetLeft < nav.scrollLeft) nav.scrollLeft = active.offsetLeft;
    else if (active.offsetLeft + active.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = active.offsetLeft + active.offsetWidth - nav.clientWidth;
  }, [location.view, location.section]);
  const items: { label: string; view: PrivateView; section?: SettingsSection }[] = [
    { label: '個人設定', view: 'settings', section: 'personal' }, { label: '分享管理', view: 'shares' },
    ...(administrator ? [{ label: '帳號管理', view: 'settings' as const, section: 'accounts' as const }, { label: '儲存與授權', view: 'settings' as const, section: 'storage' as const }] : []),
    ...(canTrash ? [{ label: '垃圾桶', view: 'trash' as const }] : []),
  ];
  return <nav ref={navigation} className="settings-navigation" aria-label="管理分類">{items.map(item => {
    const next = { ...location, view: item.view, ...(item.section ? { section: item.section } : {}) }, active = location.view === item.view && (item.view !== 'settings' || (location.section ?? 'personal') === item.section);
    return <a key={item.label} href={href(next)} aria-current={active ? 'page' : undefined} onClick={event => { if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(next); }}>{item.label}</a>;
  })}</nav>;
}

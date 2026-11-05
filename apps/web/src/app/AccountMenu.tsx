import { useRef, useState } from 'react';
import { Button, Dropdown } from 'antd';
import type { SessionResponse } from '@filehub/contracts';

export function AccountMenu({ session, settings, logout, busy }: { session: SessionResponse; settings(): void; logout(): void; busy: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <Dropdown trigger={['click']} open={open} onOpenChange={setOpen} menu={{ items: [
    { key: 'settings', label: '設定', disabled: busy },
    { key: 'status', label: <a href="/?view=status" target="_blank" rel="noopener noreferrer">服務狀態</a> },
    { type: 'divider' }, { key: 'logout', label: '登出', disabled: busy, danger: true },
  ], onClick: ({ key }) => { setOpen(false); if (busy || key === 'status') return; trigger.current?.focus(); if (key === 'settings') settings(); else if (key === 'logout') logout(); } }}>
    <Button type="text" ref={trigger} className="account-menu-trigger" aria-label="帳號選單" aria-haspopup="menu" aria-expanded={open} aria-busy={busy} loading={busy} title={session.user.username}><span className="account-avatar" aria-hidden="true">{session.user.username.slice(0,1).toLocaleUpperCase('zh-TW')}</span></Button>
  </Dropdown>;
}

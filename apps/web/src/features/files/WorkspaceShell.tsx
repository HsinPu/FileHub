import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Drawer } from 'antd';
import { cssVariables } from '../../theme/index.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { WorkspaceHeaderContext } from './WorkspaceHeader.js';

/** 共用殼層只組織版面；私有持續工作與導覽狀態仍由 Workspace 擁有。 */
export function WorkspaceShell({ navigation, brand, header, children, preserveFragment=false, navigationLabel='工作空間導覽' }: { navigation(activate: (action: () => void) => void): ReactNode; brand: ReactNode; header: ReactNode; children: ReactNode; preserveFragment?:boolean; navigationLabel?:string }) {
  const [open, setOpen] = useState(false), pending = useRef<() => void>(undefined);
  const [search, setSearch] = useState<HTMLDivElement | null>(null);
  const [searching,setSearching]=useState(false);
  const slots=useMemo(()=>({search,setSearching,overlayActive:searching||open}),[search,searching,open]);
  useEffect(() => { const screen = window.matchMedia('(min-width:737px)'); const close = () => { if (screen.matches) setOpen(false); }; screen.addEventListener('change', close); return () => screen.removeEventListener('change', close); }, []);
  const activate = (action: () => void) => { if (open) { pending.current = action; setOpen(false); } else action(); };
  return <WorkspaceHeaderContext.Provider value={slots}><div className={`app-shell files-shell${searching?' searching':''}`}>
    <a className="skip-link" href="#main" onClick={event=>{if(preserveFragment){event.preventDefault();document.getElementById('main')?.focus();}}}>跳至主要內容</a>
    <header className="topbar"><Button type="text" className="mobile-navigation-trigger" aria-label="開啟導覽" aria-expanded={open} onClick={() => setOpen(true)}><ToolIcon name="menu"/></Button>{brand}<div className="header-search" ref={setSearch}/>{header}</header>
    <aside className="sidebar" inert={searching} aria-label={navigationLabel}>{navigation(activate)}</aside>
    <div className="workspace">
      <main className="workspace-main" inert={searching} id="main" tabIndex={-1}>{children}</main>
    </div>
    {/* 保持 Drawer mounted，避免進場尚未完成就收合時丟失 afterOpenChange(false) 的導覽。 */}
    <Drawer title={navigationLabel} placement="left" size={256} open={open} closable={false} extra={<Button type="text" aria-label="關閉導覽" onClick={() => { pending.current = undefined; setOpen(false); }}><ToolIcon name="close"/></Button>} rootClassName="workspace-drawer" styles={{ root: cssVariables }} onClose={() => { pending.current = undefined; setOpen(false); }} afterOpenChange={visible => { if (!visible) { const action = pending.current; pending.current = undefined; action?.(); } }}>{navigation(activate)}</Drawer>
  </div></WorkspaceHeaderContext.Provider>;
}

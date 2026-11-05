import { useEffect, useState, type ReactNode } from 'react';
import { ToolIcon, type ToolIconName } from './ToolIcon.js';
import { BrandMark } from './BrandMark.js';

/** 公開殼層只有版面與錨點，不建立私有身份、入口或工作控制器。 */
export function PublicShell({label,children,links=[{name:'登入 FileHub',href:'/',icon:'login'}]}:{label:string;children:ReactNode;links?:readonly {name:string;href:string;icon:ToolIconName}[]}){
  const anchors=links.some(link=>link.href.startsWith('#'));
  const [hash,setHash]=useState(()=>anchors?window.location.hash:'');
  useEffect(()=>{if(!anchors)return;const changed=()=>setHash(window.location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[anchors]);
  return <div className="public-shell">
    <a className="skip-link" href="#main" onClick={event=>{event.preventDefault();document.getElementById('main')?.focus();}}>跳至主要內容</a>
    <header className="topbar public-topbar"><a className="workspace-brand workspace-wordmark" href="/" aria-label="FileHub 首頁"><BrandMark/><strong>FileHub</strong></a><span className="public-page-label">{label}</span>
      <nav className="public-links" aria-label="頁面導覽">{links.map((link,index)=>{const active=link.href.startsWith('#')&&(hash===link.href||!hash&&index===0);return <a className={`nav-item${active?' active':''}`} aria-current={active?'location':undefined} href={link.href} key={link.href} onClick={event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;if(link.href.startsWith('#')){event.preventDefault();window.location.hash=link.href.slice(1);}}}><ToolIcon name={link.icon}/><span>{link.name}</span></a>;})}</nav>
    </header>
    <main className="public-main" id="main" tabIndex={-1}>{children}</main>
    <footer className="public-footer">FileHub {__FILEHUB_VERSION__}</footer>
  </div>;
}

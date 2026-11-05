import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ToolIcon } from '../../app/ToolIcon.js';
import { cssVariables } from '../../theme/index.js';
import type { FileAction } from './actions.js';

export interface MenuPosition { x: number; y: number }
export function ResourceMenu({ position, actions, close }: { position: MenuPosition | undefined; actions: FileAction[]; close(focus: boolean): void }) {
  return position ? createPortal(<MenuPopup position={position} actions={actions} close={close}/>, document.body) : null;
}
function MenuPopup({position,actions,close}:{position:MenuPosition;actions:FileAction[];close(focus:boolean):void}){
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const element=root.current;if(!element)return;const box=element.getBoundingClientRect();
    element.style.left=Math.max(8,Math.min(position.x,window.innerWidth-box.width-8))+'px';
    element.style.top=Math.max(8,Math.min(position.y,window.innerHeight-box.height-8))+'px';
    (element.querySelector<HTMLButtonElement>('button:not(:disabled)')??element).focus({preventScroll:true});
  },[position]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))close(false);};
    const resize=()=>close(false);const scroll=(event:Event)=>{if(!(event.target instanceof Node)||!root.current?.contains(event.target))close(false);};
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);window.addEventListener('scroll',scroll,true);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);window.removeEventListener('scroll',scroll,true);};
  },[close]);
  return <div ref={root} className="resource-menu" role="menu" aria-label="檔案操作" tabIndex={-1} style={{...cssVariables,left:position.x,top:position.y}} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
    if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const items=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);if(!items.length)return;
    const current=items.findIndex(item=>item===document.activeElement),index=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[index]?.focus();
  }}>{actions.map(action=><button role="menuitem" tabIndex={-1} type="button" key={action.key} disabled={action.disabled} className={action.key==='trash'?'danger':undefined} onClick={()=>{close(true);if(!action.disabled)action.run();}}><ToolIcon name={action.icon}/><span>{action.name}</span></button>)}</div>;
}

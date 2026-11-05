import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 殼層只提供呈現位置；搜尋與情境動作仍由 FilePanel 擁有，不移轉控制器生命週期。 */
export const WorkspaceHeaderContext = createContext<{search:HTMLElement|null;setSearching(active:boolean):void;overlayActive:boolean}>({search:null,setSearching:()=>{},overlayActive:false});
export function WorkspaceHeaderSearch({ children }: { children: ReactNode }) {
  const target = useContext(WorkspaceHeaderContext).search;
  return target ? createPortal(children, target) : null;
}

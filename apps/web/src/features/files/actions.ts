import type { ToolIconName } from '../../app/ToolIcon.js';
export interface FileAction { key:string; label:string; name:string; icon:ToolIconName; disabled:boolean; busy?:boolean; run():void }

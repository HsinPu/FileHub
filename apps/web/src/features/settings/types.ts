import type { TSchema } from 'typebox';
export type SaveSetting=(url:string,schema:TSchema,body:unknown,options?:{refresh?:boolean})=>Promise<boolean>;
export type DirtySetting=(key:string,dirty:boolean)=>void;

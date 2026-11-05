import type { DatabaseConfig } from '../config/index.js';
import { acquireStateLock } from '../lifecycle/state-lock.js';
import { openDatabase } from './database.js';
export async function openServiceDatabase(config:DatabaseConfig,mode:'shared'|'exclusive'='shared'){
  const lock=await acquireStateLock(config.stateDirectory,mode);
  try{const database=openDatabase(config);let closing:Promise<void>|undefined;return{database,close:()=>closing??=(async()=>{try{database.close();}finally{await lock.close();}})()};}
  catch(error){await lock.close();throw error;}
}

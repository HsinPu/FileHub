import Database from 'better-sqlite3';
import { assertSQLiteVersion } from '../persistence/database.js';
import { assertMigrationHistory,loadMigrations,SchemaCompatibilityError } from '../persistence/migrations.js';
export function knownDatabase(filename:string,readonly=true):{sqlite:Database.Database;revision:10|11|12|13}{
  const sqlite=new Database(filename,{readonly,fileMustExist:true,timeout:100});
  try{sqlite.pragma('foreign_keys = ON');sqlite.pragma('synchronous = FULL');assertSQLiteVersion(sqlite);assertMigrationHistory(sqlite,loadMigrations(),true);const row=sqlite.prepare<[],{revision:number}>('SELECT revision FROM schema_state WHERE id=1').get();if(!row||![10,11,12,13].includes(row.revision))throw new SchemaCompatibilityError();if(sqlite.pragma('integrity_check',{simple:true})!=='ok'||sqlite.prepare('PRAGMA foreign_key_check').all().length)throw new SchemaCompatibilityError();return{sqlite,revision:row.revision as 10|11|12|13};}catch(error){sqlite.close();throw error;}
}
export function checkKnownDatabase(sqlite:Database.Database){assertSQLiteVersion(sqlite);assertMigrationHistory(sqlite,loadMigrations(),true);if(sqlite.pragma('integrity_check',{simple:true})!=='ok'||sqlite.prepare('PRAGMA foreign_key_check').all().length)throw new SchemaCompatibilityError();}

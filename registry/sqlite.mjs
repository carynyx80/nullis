import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
export function openDatabase(filename=':memory:'){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA journal_mode = WAL');
 sqlite.exec('CREATE TABLE IF NOT EXISTS __nullis_migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
  if(sqlite.prepare('SELECT name FROM __nullis_migrations WHERE name = ?').get(name))continue;
  sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));sqlite.prepare('INSERT INTO __nullis_migrations (name) VALUES (?)').run(name);sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}
 }
 const db={prepare(sql){return {values:[],bind(...values){this.values=values;return this},first(){return sqlite.prepare(sql).get(...this.values)||null},all(){return {results:sqlite.prepare(sql).all(...this.values)}},run(){const result=sqlite.prepare(sql).run(...this.values);return {meta:{changes:Number(result.changes)}}}}},batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}},close(){sqlite.close()}};
 return db;
}

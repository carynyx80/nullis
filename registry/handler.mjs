import Core from '../dist/registry-core.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const tagValid=t=>typeof t==='string'&&/^[0-9a-f]{64}$/.test(t);
export async function handleRegistry(request,env){
 const url=new URL(request.url),path=url.pathname,db=env.DB;
 if(!path.startsWith('/api/usernames/'))return null;
 if(!db)return json({error:'Username database is not configured.'},503);
 try{
  if(path==='/api/usernames/snapshot'&&request.method==='GET'){
   const after=url.searchParams.get('after')||'';if(after&&!tagValid(after))return json({error:'Invalid snapshot cursor.'},400);
   const rows=(await db.prepare('SELECT tag, owner, nonce, expires, domain, signature FROM username_claims WHERE tag > ? ORDER BY tag COLLATE BINARY LIMIT 201').bind(after).all()).results;
   const more=rows.length>200,records=rows.slice(0,200);return json({version:1,caseSensitive:true,records,next:more?records.at(-1).tag:null});
  }
  if(request.method!=='POST'||!['/api/usernames/challenge','/api/usernames/register'].includes(path))return json({error:'Not found.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required.'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
  const text=await request.text();if(text.length>4096)return json({error:'Request too large.'},413);const body=JSON.parse(text);
  if(!tagValid(body.tag)||typeof body.owner!=='string'||Core.decode(body.owner).length!==65)return json({error:'Invalid username claim.'},400);
  await crypto.subtle.importKey('raw',Core.decode(body.owner),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const now=Date.now();
  const ip=request.headers.get('CF-Connecting-IP')||'local';const limiterTag=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+':'+Math.floor(now/60000))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const rate=await db.prepare('INSERT INTO username_limits (id, count, expires) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1 RETURNING count').bind(limiterTag,now+120000).first();if(rate.count>40)return json({error:'Too many requests. Try again in a minute.'},429);
  if(path.endsWith('/challenge')){
   const found=await db.prepare('SELECT owner FROM username_claims WHERE tag = ?').bind(body.tag).first();if(found)return json({registered:true,owned:found.owner===body.owner});
   const nonce=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join(''),expires=now+60000;
   await db.batch([db.prepare('DELETE FROM username_challenges WHERE expires < ?').bind(now),db.prepare('DELETE FROM username_limits WHERE expires < ?').bind(now),db.prepare('INSERT INTO username_challenges (nonce, tag, owner, expires, domain) VALUES (?, ?, ?, ?, ?)').bind(nonce,body.tag,body.owner,expires,url.origin)]);
   return json({registered:false,tag:body.tag,owner:body.owner,nonce,expires,domain:url.origin});
  }
  if(!tagValid(body.nonce)||!Number.isSafeInteger(body.expires)||body.domain!==url.origin||body.expires<=now||!await Core.verifyClaim(url.origin,body,body.signature))return json({error:'Invalid or expired ownership proof.'},401);
  const results=await db.batch([
   db.prepare('INSERT INTO username_claims (tag, owner, nonce, expires, domain, signature) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM username_challenges WHERE nonce = ? AND tag = ? AND owner = ? AND expires = ? AND expires > ? AND domain = ?) ON CONFLICT(tag) DO NOTHING').bind(body.tag,body.owner,body.nonce,body.expires,url.origin,body.signature,body.nonce,body.tag,body.owner,body.expires,now,url.origin),
   db.prepare('DELETE FROM username_challenges WHERE nonce = ? AND tag = ? AND owner = ?').bind(body.nonce,body.tag,body.owner)
  ]);
  if(results[0].meta.changes===1)return json({registered:true,owned:true},201);
  const existing=await db.prepare('SELECT owner FROM username_claims WHERE tag = ?').bind(body.tag).first();
  if(existing?.owner===body.owner)return json({registered:true,owned:true});
  return json({error:existing?'This exact username is already registered.':'Ownership challenge was already used or expired.'},existing?409:401);
 }catch{return json({error:'The username request could not be completed.'},400)}
}

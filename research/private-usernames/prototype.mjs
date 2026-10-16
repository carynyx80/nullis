// Isolated research, not a production protocol. See README.md for attacks/assumptions.
import {Oprf,VOPRFClient,VOPRFServer,randomPrivateKey,generatePublicKey,EvaluationRequest,Evaluation} from '@cloudflare/voprf-ts';
import {createHash,randomBytes,generateKeyPairSync,createPublicKey,createPrivateKey,sign,verify,createCipheriv,createDecipheriv,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{normalize}=require('../../dist/usernames.js');
export const SUITE=Oprf.Suite.P384_SHA384;
const CONTEXT='NULLIS_USERNAME_RESEARCH_V1';
const b64=b=>Buffer.from(b).toString('base64');
function unb64(s,max=16384){if(typeof s!=='string'||s.length>max||!s.length||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('Invalid encoding');return Buffer.from(s,'base64')}
const digest=(...parts)=>createHash('sha256').update(Buffer.concat(parts.map(p=>typeof p==='string'?Buffer.from(p):Buffer.from(p)))).digest();
const pub=k=>b64(k.export({format:'der',type:'spki'}));
function ownerKey(encoded){const k=createPublicKey({key:unb64(encoded,128),format:'der',type:'spki'});if(k.asymmetricKeyType!=='ed25519')throw Error('Invalid ownership key');return k}
function encryption(key,plaintext,aad){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));const body=Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);return {iv:b64(iv),body:b64(body)}}
function decryption(key,value,aad){const iv=unb64(value.iv,16),body=unb64(value.body,32768);if(iv.length!==12||body.length<16)throw Error('Invalid encrypted record');const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(body.subarray(-16));return Buffer.concat([cipher.update(body.subarray(0,-16)),cipher.final()])}
function recordKeys(outputs){if(outputs.length!==2||outputs.some(v=>v.length!==48))throw Error('Two VOPRF results required');return {tag:digest(CONTEXT+':tag:',...outputs).toString('hex'),key:digest(CONTEXT+':record:',...outputs)}}
export async function makeOracle(id,{limit=1000}={}){
 const secret=await randomPrivateKey(SUITE),server=new VOPRFServer(SUITE,secret),publicKey=generatePublicKey(SUITE,secret),transcript=[];let count=0;
 return {id,publicKey:b64(publicKey),transcript,async evaluate(wire){if(++count>limit)throw Error('Oracle quota exceeded');const bytes=unb64(wire,512),request=EvaluationRequest.deserialize(SUITE,bytes);if(request.blinded.length!==1)throw Error('Single input required');transcript.push({operation:'evaluate',blinded:wire});return b64((await server.blindEvaluate(request)).serialize())},
 // Deliberately available only to attack tests: models an operator with its own key.
 async operatorEvaluate(name){return server.evaluate(new TextEncoder().encode(CONTEXT+':name:'+normalize(name)))} };
}
export async function deriveName(name,oracles){
 if(oracles.length!==2||oracles[0].id===oracles[1].id||oracles[0].publicKey===oracles[1].publicKey)throw Error('Independent pinned oracle keys required');
 const input=new TextEncoder().encode(CONTEXT+':name:'+normalize(name)),outputs=[];
 for(const oracle of oracles){const client=new VOPRFClient(SUITE,unb64(oracle.publicKey,256));const [finalization,request]=await client.blind([input]);const response=Evaluation.deserialize(SUITE,unb64(await oracle.evaluate(b64(request.serialize())),1024));const [output]=await client.finalize(finalization,response);outputs.push(output)}
 return recordKeys(outputs);
}
export function makeIdentity(){const owner=generateKeyPairSync('ed25519'),receiving=generateKeyPairSync('x25519');return {ownerPrivate:owner.privateKey,ownerPublic:pub(owner.publicKey),receivingPrivate:receiving.privateKey,receivingPublic:pub(receiving.publicKey)}}
function claimShape(value){if(!value||Object.keys(value).sort().join(',')!=='ciphertext,owner,tag'||!/^[0-9a-f]{64}$/.test(value.tag))throw Error('Invalid claim');ownerKey(value.owner);if(!value.ciphertext||Object.keys(value.ciphertext).sort().join(',')!=='body,iv'||unb64(value.ciphertext.iv,16).length!==12||unb64(value.ciphertext.body,32768).length<16)throw Error('Invalid encrypted record');return {tag:value.tag,owner:value.owner,ciphertext:{iv:value.ciphertext.iv,body:value.ciphertext.body}}}
function message(domain,challenge,claim){return Buffer.from(JSON.stringify({context:CONTEXT,domain,action:'register',nonce:challenge.nonce,expires:challenge.expires,tag:claim.tag,owner:claim.owner,ciphertext:claim.ciphertext}))}
export function makeRegistry({domain='nullis-research-registry',now=()=>Date.now()}={}){
 const records=new Map(),challenges=new Map(),transcript=[];
 return {domain,transcript,
  challenge(input){const claim=claimShape(input);for(const [nonce,c]of challenges)if(c.expires<=now())challenges.delete(nonce);if(challenges.size>=1000)throw Error('Too many pending challenges');const c={nonce:randomBytes(32).toString('hex'),expires:now()+60000};challenges.set(c.nonce,{...c,claim:JSON.stringify(claim)});transcript.push({operation:'challenge',claim});return {...c,domain}},
  register({claim:input,challenge,signature}){const claim=claimShape(input),saved=challenges.get(challenge?.nonce);if(!saved||saved.expires<=now()||saved.expires!==challenge.expires||challenge.domain!==domain||saved.claim!==JSON.stringify(claim))throw Error('Invalid or expired challenge');if(!verify(null,message(domain,challenge,claim),ownerKey(claim.owner),unb64(signature,128)))throw Error('Invalid ownership signature');challenges.delete(challenge.nonce);if(records.has(claim.tag))throw Error('Username already registered');const record=structuredClone({claim,challenge,signature});records.set(claim.tag,record);transcript.push({operation:'register',record});return {registered:true,tag:claim.tag}},
  snapshot(){transcript.push({operation:'snapshot'});return {version:1,domain,records:[...records.values()].sort((a,b)=>a.claim.tag.localeCompare(b.claim.tag)).map(v=>structuredClone(v))}}
 };
}
export async function register(name,identity,oracles,registry){
 const keys=await deriveName(name,oracles);const data={type:'research-receiving-key-only',owner:identity.ownerPublic,receiving:identity.receivingPublic};const claim={tag:keys.tag,owner:identity.ownerPublic,ciphertext:encryption(keys.key,Buffer.from(JSON.stringify(data)),CONTEXT+':'+keys.tag)};
 const challenge=await registry.challenge(claim);if(challenge.domain!==registry.domain||!/^[0-9a-f]{64}$/.test(challenge.nonce)||challenge.expires<=Date.now()||challenge.expires>Date.now()+120000)throw Error('Untrusted registration challenge');
 const signature=b64(sign(null,message(registry.domain,challenge,claim),identity.ownerPrivate));return registry.register({claim,challenge,signature});
}
export async function lookup(name,oracles,registry){
 const keys=await deriveName(name,oracles),snapshot=await registry.snapshot();if(snapshot.version!==1||snapshot.domain!==registry.domain||!Array.isArray(snapshot.records))throw Error('Invalid snapshot');
 const record=snapshot.records.find(r=>r.claim?.tag===keys.tag);if(!record)return null;const claim=claimShape(record.claim);
 if(record.challenge?.domain!==registry.domain||!verify(null,message(registry.domain,record.challenge,claim),ownerKey(claim.owner),unb64(record.signature,128)))throw Error('Invalid directory ownership proof');
 const data=JSON.parse(decryption(keys.key,claim.ciphertext,CONTEXT+':'+keys.tag).toString('utf8'));if(data.type!=='research-receiving-key-only'||data.owner!==claim.owner)throw Error('Invalid recipient descriptor');const key=createPublicKey({key:unb64(data.receiving,128),format:'der',type:'spki'});if(key.asymmetricKeyType!=='x25519')throw Error('Invalid receiving key');return data;
}
export function backup(identity,password){if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('Use a 12–1024 character passphrase');const salt=randomBytes(16),key=scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024});const data={owner:b64(identity.ownerPrivate.export({type:'pkcs8',format:'der'})),receiving:b64(identity.receivingPrivate.export({type:'pkcs8',format:'der'}))};try{return {format:'nullis-research-identity',version:1,kdf:'scrypt-32768-8-1',salt:b64(salt),encrypted:encryption(key,Buffer.from(JSON.stringify(data)),CONTEXT+':backup')}}finally{key.fill(0)}}
export function recover(envelope,password){if(typeof password!=='string'||password.length<12||password.length>1024||envelope?.format!=='nullis-research-identity'||envelope.version!==1||envelope.kdf!=='scrypt-32768-8-1')throw Error('Invalid backup');const salt=unb64(envelope.salt,24);if(salt.length!==16)throw Error('Invalid backup salt');const key=scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024});let data;try{data=JSON.parse(decryption(key,envelope.encrypted,CONTEXT+':backup').toString('utf8'))}finally{key.fill(0)}const ownerPrivate=createPrivateKey({key:unb64(data.owner,256),format:'der',type:'pkcs8'}),receivingPrivate=createPrivateKey({key:unb64(data.receiving,256),format:'der',type:'pkcs8'});if(ownerPrivate.asymmetricKeyType!=='ed25519'||receivingPrivate.asymmetricKeyType!=='x25519')throw Error('Invalid identity key types');return {ownerPrivate,ownerPublic:pub(createPublicKey(ownerPrivate)),receivingPrivate,receivingPublic:pub(createPublicKey(receivingPrivate))}}
// This attack demonstrates why blinding alone does not protect short names from colluding operators.
export async function colludingOperatorsGuess(names,oracles,snapshot){for(const name of names){const outputs=await Promise.all(oracles.map(o=>o.operatorEvaluate(name)));const {tag}=recordKeys(outputs);if(snapshot.records.some(r=>r.claim.tag===tag))return normalize(name)}return null}

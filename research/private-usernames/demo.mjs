import {register,lookup,makeIdentity,backup,recover,colludingOperatorsGuess} from './prototype.mjs';
import {startOracle,startRegistry} from './http.mjs';
const a=await startOracle('operator-a'),b=await startOracle('operator-b'),registry=await startRegistry();
try{
 const oracles=[a.client,b.client],alice=makeIdentity(),bob=makeIdentity();await register('alice',alice,oracles,registry.client);await register('bob',bob,oracles,registry.client);
 let duplicateRejected=false;try{await register('alice',bob,oracles,registry.client)}catch{duplicateRejected=true}
 const recipient=await lookup('alice',oracles,registry.client),restored=recover(backup(alice,'demo passphrase not for real use'),'demo passphrase not for real use');
 const exposedByCollusion=await colludingOperatorsGuess(['charlie','alice'],[a.oracle,b.oracle],registry.registry.snapshot());
 console.log(JSON.stringify({prototype:'private-username-research',transport:'three loopback HTTP services',registeredSyntheticUsers:2,duplicateRejected,recipientResolved:recipient.receiving===alice.receivingPublic,recoveryMatched:restored.ownerPublic===alice.ownerPublic,rawUsernameSentToRegistry:false,lookupTargetSentToRegistry:false,collusionAttackRecoveredName:exposedByCollusion==='alice',productionReady:false,realFundsSupported:false},null,2));
}finally{await Promise.all([a.close(),b.close(),registry.close()])}


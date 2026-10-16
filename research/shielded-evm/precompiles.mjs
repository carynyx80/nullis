// EIP-196/197 public generator vectors; no private key material.
export const FIELD=21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const SCALAR=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const encode=values=>'0x'+values.map(word).join('');
const g2=[11559732032986387107991004021392285783925812861821192530917403151452391805634n,10857046999023057135944570762232829481370756359578518086990519993285655852781n,4082367875863433681332203403145435568316851327593401208105741076214120093531n,8495653923123431417604973247489272438418190587263600148770280649306958101930n];
export const vectors=[
 {name:'BN254 addition',to:'0x0000000000000000000000000000000000000006',data:encode([1,2,0,0]),expected:encode([1,2])},
 {name:'BN254 scalar multiplication',to:'0x0000000000000000000000000000000000000007',data:encode([1,2,1]),expected:encode([1,2])},
 {name:'BN254 pairing identity',to:'0x0000000000000000000000000000000000000008',data:encode([1,2,...g2,1,FIELD-2n,...g2]),expected:encode([1])},
 {name:'BN254 non-identity pairing rejected',to:'0x0000000000000000000000000000000000000008',data:encode([1,2,...g2]),expected:encode([0])}
];
export async function probePrecompiles(request,block='latest'){
 const results=[];for(const vector of vectors){const result=await request('eth_call',[{to:vector.to,data:vector.data,gas:'0x989680'},block]);results.push({name:vector.name,passed:typeof result==='string'&&result.toLowerCase()===vector.expected})}return results;
}

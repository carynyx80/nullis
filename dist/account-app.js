/* Public account controller. Profile encryption is separate from onchain funds. */
(function(){'use strict';
const A=NullispadAccount,E=ethers,C=NullispadAccountConfig,STORE='nullispad.public-account.4663';
const baseRender=render,baseOpen=open;
const F={address:C.defaultAccount||null,provider:null,owner:null,epoch:null,core:null,rows:[],loading:false,busy:false,error:'',quote:null,quoteVersion:0,timer:null,history:[],pending:null};
try{F.address=F.address||localStorage.getItem(STORE)}catch{}
function historyKey(){return STORE+'.transactions.'+(state.address||'').toLowerCase()}
function loadHistory(){try{const items=JSON.parse(localStorage.getItem(historyKey())||'[]');F.history=Array.isArray(items)?items.filter(t=>/^0x[0-9a-f]{64}$/i.test(t.hash)&&typeof t.label==='string').slice(0,30):[]}catch{F.history=[]}F.pending=F.history.find(t=>t.status==='pending')||null}
function saveHistory(){try{localStorage.setItem(historyKey(),JSON.stringify(F.history.slice(0,30)))}catch{}}
function record(tx){if(tx.owner.toLowerCase()!==(state.address||'').toLowerCase())return;const item={...tx,status:tx.status||'pending'};if(item.status==='pending')F.pending=item;else if(F.pending?.hash===tx.hash)F.pending=null;F.history=[item,...F.history.filter(t=>t.hash!==tx.hash)].slice(0,30);saveHistory();draw()}
function finish(receipt){if(!receipt)return;F.history=F.history.map(t=>t.hash===receipt.transactionHash?{...t,status:BigInt(receipt.status)===1n?'confirmed':'reverted'}:t);if(F.pending?.hash===receipt.transactionHash)F.pending=null;saveHistory()}
function link(hash,label){const a=node('a',label||short(hash),'transaction-link');a.href='https://robinhoodchain.blockscout.com/tx/'+hash;a.target='_blank';a.rel='noopener noreferrer';return a}
function status(text){if($('#modal').open&&['deposit','withdraw','swap-review','account-setup'].includes(mode))$('#form-error').textContent=text}
function core(){if(!state.provider)throw Error('Connect your wallet.');if(F.provider!==state.provider){F.provider=state.provider;F.core=new A.Account(state.provider,C,{status,pending:record})}return F.core}
function addressFor(symbol){return symbol==='ETH'?A.ZERO:symbol==='WETH'?C.network.weth:C.network.usd}
function format(row,value){return state.hidden?'••••':E.formatUnits(value,row.decimals)}
function setAddress(address){F.address=address;try{localStorage.setItem(STORE,address)}catch{toast('Account connected for this session. Copy the contract address for recovery.')}}
function draw(){
 $('.network').textContent='ROBINHOOD CHAIN / NULLISPAD';$('footer>span:last-child').textContent='Beta · onchain transactions';
 $('.portfolio-label').firstChild.textContent='ACCOUNT BALANCE ';$('.profile-note').textContent='Only your wallet can spend its credited balance. The new account contract has not had an independent audit.';
 $('#total').replaceChildren(node('span',!state.address?'Connect your wallet':!onChain()?'Switch to Robinhood Chain':!F.address?'Account not deployed':F.loading?'Reading account…':F.error?'Balance unavailable':F.rows.filter(r=>r.balance>0n).length+' assets with a balance'));
 $('#assets').replaceChildren();
 if(F.error)$('#assets').append(node('p',F.error,'empty'));
 else if(!F.address)$('#assets').append(node('p','Deposit opens account setup. You can deploy a contract or connect an existing Nullispad account.','empty'));
 else if(!F.rows.length)$('#assets').append(node('p','Connect your wallet and refresh to read balances.','empty'));
 else for(const row of F.rows){const item=node('div',undefined,'asset'),name=node('div',row.symbol,'asset-name');name.append(node('small','Nullispad account'));const value=node('div',format(row,row.balance),'asset-value');value.append(node('small',format(row,row.wallet)+' in wallet'));item.append(name,value);$('#assets').append(item)}
 $('.assets-heading>span').textContent=F.rows.length?F.rows.length+' supported assets':'ETH · WETH · USDG';
 let refreshButton=$('#account-refresh');if(!refreshButton){refreshButton=button('Refresh account',()=>refreshAccount());refreshButton.id='account-refresh';$('.actions').after(refreshButton)}refreshButton.disabled=F.busy||F.loading||!state.address||!onChain();
 let addressLine=$('#account-address');if(!addressLine){addressLine=node('p',undefined,'wallet-address account-address');addressLine.id='account-address';$('#assets').after(addressLine)}addressLine.replaceChildren();
 if(F.address){const a=node('a','Contract '+short(F.address));a.href='https://robinhoodchain.blockscout.com/address/'+F.address;a.target='_blank';a.rel='noopener noreferrer';addressLine.append(a)}
 $('[data-action="withdraw"]').disabled=F.busy||!state.address||!onChain()||!F.address;
 $('[data-action="deposit"]').disabled=F.busy;
 $('[data-action="withdraw"]').onclick=()=>open('withdraw');
 $('#swap-submit').disabled=F.busy||F.loading;$('#swap-submit').textContent=F.busy?'Wallet action in progress…':!state.address?'Connect wallet':!onChain()?'Switch network':!F.address?'Set up account':F.quote?'Review swap':'Get quote';
 $('.card-foot').textContent='Token pair and amounts are visible onchain. Gas and Uniswap pool fees apply.';
 const sold=F.rows.find(t=>t.symbol===$('#sell-token').value);$('#sell-balance').textContent=sold?'Account: '+format(sold,sold.balance):'Account balance: —';
 $('#buy-amount').value=F.quote?E.formatUnits(F.quote.amountOut,F.quote.decimalsOut):'';
 $('#rate').textContent=F.quote?'Minimum '+E.formatUnits(F.quote.minimum,F.quote.decimalsOut)+' '+F.quote.symbolOut:'Enter an amount for a live Uniswap v3 quote';
 $('.quote>span:last-child').textContent=F.quote?(F.quote.fee?'Pool fee '+(F.quote.fee/10000)+'%':'1:1 wrap / unwrap'):'';
 $('#activity').replaceChildren();if(!F.history.length)$('#activity').append(node('p','No transactions recorded on this device. Balances are recovered directly from the contract.','empty'));
 for(const tx of F.history.slice(0,8)){const row=node('div',undefined,'activity-row');row.append(link(tx.hash,tx.label.replace(/public /gi, String())),node('small',tx.status));$('#activity').append(row)}
 if(F.pending){$('#activity').append(node('p','A transaction is pending. Refresh its status before submitting another action.','wallet-hint'))}
}
render=function(){baseRender();const owner=state.address?.toLowerCase()||null;if(F.owner!==owner||F.epoch!==state.epoch){F.owner=owner;F.epoch=state.epoch;F.quote=null;F.quoteVersion++;F.rows=[];F.error='';loadHistory();if($('#modal').open&&['withdraw','swap-review','account-setup','deposit'].includes(mode))$('#modal').close();queueMicrotask(()=>refreshAccount())}draw()};
async function refreshAccount(){if(!state.address||!onChain()||F.loading)return;const owner=state.address.toLowerCase(),epoch=state.epoch;F.loading=true;F.error='';draw();try{const client=core();
 if(F.pending){const pending=F.pending,receipt=await client.read('eth_getTransactionReceipt',[pending.hash]);if(owner!==state.address?.toLowerCase()||epoch!==state.epoch)return;if(receipt){if(pending.label==='Deploy public account'&&BigInt(receipt.status)===1n){let target=receipt.contractAddress;if(!target&&receipt.to?.toLowerCase()===C.network.deployer)target=client.deploymentPlan().address;const address=await client.verify(target);if(owner!==state.address?.toLowerCase()||epoch!==state.epoch)return;setAddress(address)}finish(receipt)}else if(pending.nonce){const used=await client.read('eth_getTransactionCount',[owner,'latest']);if(owner!==state.address?.toLowerCase()||epoch!==state.epoch)return;if(BigInt(used)>BigInt(pending.nonce)){F.history=F.history.map(t=>t.hash===pending.hash?{...t,status:'replaced; check wallet history'}:t);F.pending=null;saveHistory()}}}
 if(!F.address&&typeof client.findDeployment==='function'){const existing=await client.findDeployment();if(owner!==state.address?.toLowerCase()||epoch!==state.epoch)return;if(existing)setAddress(existing)}
 const result=await client.rows(F.address);if(owner!==state.address?.toLowerCase()||epoch!==state.epoch)return;F.rows=result.rows;
 }catch(e){if(owner===state.address?.toLowerCase()&&epoch===state.epoch)F.error=errorText(e)}finally{F.loading=false;draw()}}
function errorText(e){if(e?.code===4001||e?.code==='ACTION_REJECTED')return 'Declined in your wallet. No new transaction was submitted.';if(e?.code===-32002)return 'Complete the wallet request already open.';const message=e?.shortMessage||e?.message||'The wallet action could not be completed.';return /invalid transaction/i.test(message)&&e.rpcMethod?message+' (Wallet request: '+e.rpcMethod+(e.code?' · '+e.code:'')+')':message}
async function run(action){if(F.busy)return;const owner=state.address?.toLowerCase(),epoch=state.epoch;F.busy=true;F.error='';draw();try{if(F.pending){await refreshAccount();if(F.pending)throw Error('Your earlier transaction is still pending. Check its explorer link before trying again.')}if(owner!==state.address?.toLowerCase()||epoch!==state.epoch)throw Error('Wallet changed. Review the action again.');const receipt=await action();finish(receipt);F.quote=null;F.quoteVersion++;if($('#modal').open)$('#modal').close();await refreshAccount();toast('Confirmed on Robinhood Chain.')}catch(e){if(e.hash&&e.confirmed)finish({transactionHash:e.hash,status:'0x0'});if($('#modal').open){$('#form-error').replaceChildren(node('span',errorText(e)));if(e.hash)$('#form-error').append(link(e.hash,'View transaction'))}else toast(errorText(e))}finally{F.busy=false;$('#confirm-action').disabled=false;draw()}}
function modal(next,title,description){mode=next;$('#modal-title').textContent=title;$('#modal-description').textContent=description;$('#modal-fields').replaceChildren();$('#form-error').textContent='';$('#confirm-action').hidden=true;if(!$('#modal').open)$('#modal').showModal()}
function setup(){modal('account-setup','Set up account','Beta. This contract has no administrator withdrawal or upgrade function. Funds are controlled by your connected wallet; transactions and balances are visible onchain. Deployment costs ETH gas. The contract has not had an independent audit.');
 const fields=$('#modal-fields');fields.append(button('Deploy account · gas fee',()=>run(async()=>{const result=await core().deploy();setAddress(result.address);return result.receipt}),'primary'));
 const label=node('label','Or connect an existing Nullispad contract'),input=document.createElement('input');input.id='existing-account';input.placeholder='0x…';label.append(input);fields.append(label,button('Verify and connect contract',async()=>{try{const owner=state.address.toLowerCase(),address=await core().verify(input.value.trim());if(owner!==state.address?.toLowerCase())return;setAddress(address);$('#modal').close();await refreshAccount();toast('Account connected.')}catch(e){$('#form-error').textContent=errorText(e)}}));
 if(F.pending)fields.append(link(F.pending.hash,'View pending deployment / transaction'));
}
async function movement(next){if(!state.address){baseOpen('wallet');return}if(!onChain()){await switchNetwork();return}if(!F.address){setup();return}
 modal(next,next==='deposit'?'Deposit into account':'Withdraw to your wallet',next==='deposit'?'ETH, WETH and USDG are supported. Deposits are visible onchain. ERC20 deposits may require an exact-amount approval followed by a separate deposit confirmation.':'Withdraw your credited balance to the connected wallet. This transaction is visible onchain. Keep ETH in your wallet for gas.');
 const version=++F.quoteVersion,owner=state.address.toLowerCase(),fields=$('#modal-fields');fields.append(node('p','Reading balances…','wallet-hint'));
 try{const result=await core().rows(F.address);if(version!==F.quoteVersion||owner!==state.address?.toLowerCase()||mode!==next||!$('#modal').open)return;F.rows=result.rows;fields.replaceChildren();
 const label=node('label','Asset'),select=document.createElement('select');select.id='account-asset';for(const row of F.rows){const option=node('option',row.symbol+' — '+format(row,next==='deposit'?row.wallet:row.balance));option.value=row.asset;select.append(option)}label.append(select);
 const amountLabel=node('label','Amount'),input=document.createElement('input');input.id='account-amount';input.type='text';input.inputMode='decimal';input.placeholder='0.00';input.autocomplete='off';amountLabel.append(input);fields.append(label,amountLabel);
 $('#confirm-action').hidden=false;$('#confirm-action').disabled=false;$('#confirm-action').textContent=next==='deposit'?'Deposit · confirm in wallet':'Withdraw · confirm in wallet';draw();
 }catch(e){$('#form-error').textContent=errorText(e)}}
open=function(next){if(next==='deposit'||next==='withdraw')return movement(next);return baseOpen(next)};
const priorSubmit=$('#action-form').onsubmit;$('#action-form').onsubmit=e=>{if(!['deposit','withdraw','swap-review'].includes(mode))return priorSubmit(e);e.preventDefault();if(F.busy)return;$('#confirm-action').disabled=true;
 if(mode==='swap-review'){const quote=F.quote;if(!quote){$('#form-error').textContent='Get a new quote.';return}run(()=>core().swap(quote));return}
 const asset=$('#account-asset')?.value,value=$('#account-amount')?.value.trim(),kind=mode,target=F.address;if(!asset||!value){$('#form-error').textContent='Choose an asset and enter an amount.';$('#confirm-action').disabled=false;return}run(()=>kind==='deposit'?core().deposit(target,asset,value):core().withdraw(target,asset,value));};
async function getQuote(review=false){if(F.busy)return;if(!state.address){baseOpen('wallet');return}if(!onChain()){await switchNetwork();return}if(!F.address){setup();return}
 const version=++F.quoteVersion;F.quote=null;draw();try{const bps=Number($('#slippage').value.replace('%',''))*100;const q=await core().quote(F.address,addressFor($('#sell-token').value),addressFor($('#buy-token').value),$('#sell-amount').value.trim(),bps);if(version!==F.quoteVersion)return;F.quote=q;draw();if(review)reviewSwap()}catch(e){if(version===F.quoteVersion){$('#rate').textContent=errorText(e);if(review)toast(errorText(e))}}}
function reviewSwap(){if(!F.quote||Date.now()-F.quote.createdAt>60000){getQuote(true);return}modal('swap-review','Review swap','This transaction exposes your wallet, token pair and amounts onchain. Slippage protection can cause a stale trade to revert.');const q=F.quote;$('#modal-fields').append(node('p','Pay '+E.formatUnits(q.valueIn,F.rows.find(r=>r.symbol===q.symbolIn)?.decimals||18)+' '+q.symbolIn),node('p','Receive at least '+E.formatUnits(q.minimum,q.decimalsOut)+' '+q.symbolOut),node('p','From your account, plus wallet gas. Quote expires shortly.','wallet-hint'));$('#confirm-action').hidden=false;$('#confirm-action').disabled=false;$('#confirm-action').textContent='Swap · confirm in wallet'}
$('#swap-submit').onclick=()=>F.quote?reviewSwap():getQuote(true);
for(const selector of ['#sell-amount','#sell-token','#buy-token','#slippage'])$(selector).addEventListener(selector==='#sell-amount'?'input':'change',()=>{F.quote=null;F.quoteVersion++;clearTimeout(F.timer);draw();if($('#sell-amount').value.trim())F.timer=setTimeout(()=>getQuote(false),600)});
const reverse=$('#reverse').onclick;$('#reverse').onclick=()=>{reverse();F.quote=null;F.quoteVersion++;getQuote(false)};
$('#modal').addEventListener('close',()=>{if(!F.busy)F.quoteVersion++});
window.addEventListener('focus',()=>refreshAccount());render();
setInterval(()=>{if(!F.busy&&!document.hidden&&state.address&&onChain())refreshAccount()},30000);
})();

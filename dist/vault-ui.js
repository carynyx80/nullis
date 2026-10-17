/* Browser-only encrypted profile persistence and backup/restore. */
const VAULT_STORAGE='nullis.encrypted-profile.v1';let unlockedProfile=null,restoreEnvelope=null,lastProfileOwner=null,vaultGeneration=0,vaultBusy=false,lockTimer;
const draftFields=profileFields,renderDraft=render;
function storedEnvelope(){const raw=localStorage.getItem(VAULT_STORAGE);if(!raw)return null;if(raw.length>1600000)throw Error('Stored profile is too large. Restore a valid backup.');return NullisVault.validate(JSON.parse(raw))}
function profileLock(message){vaultGeneration++;unlockedProfile=null;restoreEnvelope=null;profiles.clear();profileDraft=null;photoVersion++;vaultBusy=false;clearTimeout(lockTimer);if($('#modal').open&&mode==='profile')$('#modal').close();render();if(message)toast(message)}
function touchVault(){clearTimeout(lockTimer);if(unlockedProfile)lockTimer=setTimeout(()=>profileLock('Profile locked after inactivity.'),5*60*1000)}
document.addEventListener('pointerdown',touchVault);document.addEventListener('keydown',touchVault);document.addEventListener('visibilitychange',()=>{if(document.hidden&&unlockedProfile)profileLock()});
render=function(){
 const owner=state.address?.toLowerCase()||null;if(owner!==lastProfileOwner){vaultGeneration++;unlockedProfile=null;restoreEnvelope=null;profiles.clear();profileDraft=null;photoVersion++;vaultBusy=false;lastProfileOwner=owner;clearTimeout(lockTimer);if($('#modal').open&&mode==='profile')$('#modal').close()}
 renderDraft();let hasStored=false;try{hasStored=Boolean(localStorage.getItem(VAULT_STORAGE))}catch{}
 $('#edit-name').textContent=unlockedProfile?'Edit profile':hasStored?'Unlock profile':'Set up profile';
 if(unlockedProfile)$('.identity p').textContent='Encrypted local profile · '+(onChain()?'Robinhood Chain':'Switch network');
};
function passwordField(labelText,id,confirm=false){const label=node('label',labelText),input=document.createElement('input');input.type='password';input.id=id;input.autocomplete=confirm?'new-password':unlockedProfile?'new-password':'current-password';input.minLength=12;input.maxLength=1024;input.required=true;label.append(input);return label}
function recoveryControls(fields){
 const label=node('label','Restore encrypted profile backup'),input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.id='vault-import';label.append(input);fields.append(label);
 input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const generation=vaultGeneration,owner=state.address?.toLowerCase();try{if(file.size>1600000)throw Error('Backup must be smaller than 1.6 MB.');const candidate=NullisVault.validate(JSON.parse(await file.text()));if(generation!==vaultGeneration||owner!==state.address?.toLowerCase()||!$('#modal').open||mode!=='profile')return;restoreEnvelope=candidate;profileDraft=null;profileFields()}catch(e){$('#form-error').textContent=e.message||'Could not read that backup.'}finally{input.value=''}};
}
function exportBackup(){try{const envelope=unlockedProfile?.envelope||storedEnvelope();if(!envelope)throw Error('No profile to back up.');const url=URL.createObjectURL(new Blob([JSON.stringify(envelope,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='nullispad-encrypted-profile.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Encrypted backup downloaded. Keep your passphrase separately.')}catch(e){toast(e.message)}}
profileFields=function(){
 if(!state.address)return;let envelope;try{envelope=restoreEnvelope||storedEnvelope()}catch(e){$('#modal-title').textContent='Profile recovery';$('#modal-description').textContent='The saved profile cannot be opened. Restore an encrypted backup.';$('#modal-fields').replaceChildren();recoveryControls($('#modal-fields'));$('#confirm-action').hidden=true;$('#form-error').textContent=e.message;return}
 if(envelope&&(!unlockedProfile||restoreEnvelope)){
  $('#modal-title').textContent=restoreEnvelope?'Restore your profile':'Unlock your profile';$('#modal-description').textContent='Enter your profile passphrase. Decryption happens in this browser. This profile stores your username and picture; shielded funds and globally unique usernames are not connected.';
  const fields=$('#modal-fields');fields.replaceChildren(passwordField('Passphrase','vault-password'));recoveryControls(fields);fields.append(button('Download encrypted backup',exportBackup));$('#confirm-action').hidden=false;$('#confirm-action').disabled=false;$('#confirm-action').textContent=restoreEnvelope?'Restore profile':'Unlock profile';$('#form-error').textContent='';return;
 }
 draftFields();$('#modal-title').textContent=unlockedProfile?'Edit your profile':'Create your local profile';$('#modal-description').textContent='Your username and picture are encrypted on this device. This is a local profile, not a shielded spending account. Username availability is not registered yet.';
 const fields=$('#modal-fields');if(!unlockedProfile){fields.append(passwordField('Create a passphrase (12+ characters)','vault-password',true),passwordField('Confirm passphrase','vault-confirm',true),node('p','Keep your passphrase and download an encrypted backup after setup. NULLISPAD cannot reset the passphrase or recover an unbacked profile.','wallet-hint'));recoveryControls(fields)}else{fields.append(button('Download encrypted backup',exportBackup),button('Lock profile',()=>profileLock('Profile locked.')))}
 const hint=fields.children[fields.children.length-1];$('#confirm-action').textContent=unlockedProfile?'Save encrypted profile':'Create encrypted profile';
};
$('#action-form').onsubmit=async e=>{
 e.preventDefault();if(mode!=='profile'||!state.address||vaultBusy)return;const owner=state.address.toLowerCase(),generation=vaultGeneration;let envelope;try{envelope=restoreEnvelope||storedEnvelope()}catch(e){$('#form-error').textContent=e.message;return}
 const password=$('#vault-password')?.value||'';const needsUnlock=envelope&&(!unlockedProfile||restoreEnvelope);
 let data;if(!needsUnlock){if(!profileDraft||profileDraft.owner!==owner||profileDraft.loading)return;const username=profileDraft.username.trim();if(!/^[A-Za-z0-9_]{3,20}$/.test(username)){$('#form-error').textContent='Use 3–20 letters, numbers or underscores.';return}if(!unlockedProfile&&password!==$('#vault-confirm')?.value){$('#form-error').textContent='Passphrases do not match.';return}data={...unlockedProfile?.data,type:'profile',owner,username,photo:profileDraft.photo,createdAt:unlockedProfile?.data.createdAt||Date.now()}}
 vaultBusy=true;$('#confirm-action').disabled=true;$('#form-error').textContent='';
 try{
  const opened=needsUnlock?await NullisVault.unlock(envelope,password,owner):unlockedProfile?await NullisVault.update(unlockedProfile,data):await NullisVault.create(password,data);
  if(generation!==vaultGeneration||owner!==state.address?.toLowerCase()||!$('#modal').open||mode!=='profile')return;
  // Persist before exposing the new profile, so quota/private-mode errors don't appear as success.
  localStorage.setItem(VAULT_STORAGE,JSON.stringify(opened.envelope));unlockedProfile=opened;restoreEnvelope=null;profiles.clear();profiles.set(owner,opened.data);profileDraft=null;photoVersion++;$('#modal').close();render();touchVault();toast(needsUnlock?'Profile unlocked on this device.':'Encrypted profile saved. Download a backup from Edit profile.');
 }catch(e){if(generation===vaultGeneration)$('#form-error').textContent=e.name==='QuotaExceededError'?'Device storage is full. Your previous saved profile was kept.':e.message||'Could not save your encrypted profile.'}
 finally{if(generation===vaultGeneration){vaultBusy=false;$('#confirm-action').disabled=false}}
};
$('#modal').addEventListener('close',()=>{vaultGeneration++;vaultBusy=false;$('#modal-fields').replaceChildren();$('#form-error').textContent=''});
render();



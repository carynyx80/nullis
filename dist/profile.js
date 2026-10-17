/* Session-only profile drafts. Nothing is uploaded or registered onchain. */
const profiles=new Map();let profileDraft=null,photoVersion=0;
function currentProfile(){return state.address?profiles.get(state.address.toLowerCase()):null}
function render(){
  renderWallet();
  const profile=currentProfile(),avatar=$('.identity .avatar');
  avatar.replaceChildren();const image=document.createElement('img');
  image.src=profile?.photo||'nullis-logo.png';image.alt=profile?.photo?'Your profile picture':'';
  image.className=profile?.photo?'profile-photo':'supplied-logo';avatar.append(image,node('span'));
  $('#username').textContent=profile?.username?'@'+profile.username:'Your NULLISPAD profile';
  $('#edit-name').textContent=profile?'Edit profile':'Set up profile';$('#edit-name').disabled=!state.address;
  if(profile) $('.identity p').textContent='Profile draft · '+(onChain()?'Robinhood Chain':'Switch network');
  if($('#modal').open&&mode==='profile'){
    if(!state.address){$('#modal').close();profileDraft=null;photoVersion++}
    else if(profileDraft&&profileDraft.owner!==state.address.toLowerCase()){profileDraft=null;photoVersion++;profileFields()}
  }
}
function open(next){
  if(next!=='profile'){profileDraft=null;photoVersion++;openWallet(next);return}
  if(!state.address){openWallet('wallet');return}
  mode='profile';profileDraft=null;photoVersion++;profileFields();if(!$('#modal').open)$('#modal').showModal();
}
function profileFields(){
  if(!state.address)return;
  if(!profileDraft)profileDraft={owner:state.address.toLowerCase(),username:currentProfile()?.username||'',photo:currentProfile()?.photo||''};
  $('#modal-title').textContent=currentProfile()?'Edit your profile':'Make it yours';
  $('#modal-description').textContent='Choose a username and an optional profile picture. This profile draft stays in this tab until you reload. Private account creation and unique username registration are not available yet.';
  $('#confirm-action').hidden=false;$('#confirm-action').disabled=false;$('#confirm-action').textContent='Save profile draft';$('#form-error').textContent='';
  const fields=$('#modal-fields');fields.replaceChildren();
  const upload=node('div',undefined,'photo-picker');const preview=document.createElement('img');preview.id='photo-preview';preview.src=profileDraft.photo||'nullis-logo.png';preview.alt='Profile picture preview';preview.className=profileDraft.photo?'profile-photo':'supplied-logo';
  const file=document.createElement('input');file.id='profile-photo-file';file.type='file';file.accept='image/png,image/jpeg,image/webp';file.className='photo-file';
  const label=node('label','Add profile picture','photo-upload-button');label.htmlFor=file.id;
  const remove=button('Remove picture',()=>{profileDraft.photo='';photoVersion++;profileFields()},'photo-remove');remove.hidden=!profileDraft.photo;
  const controls=node('div');controls.append(label,file,remove,node('p','Optional · PNG, JPG or WebP · up to 3 MB','wallet-hint'));upload.append(preview,controls);fields.append(upload);
  file.onchange=async()=>{
    const selected=file.files?.[0];if(!selected)return;
    const owner=profileDraft.owner,version=++photoVersion;$('#form-error').textContent='';
    if(!['image/png','image/jpeg','image/webp'].includes(selected.type)||selected.size>3*1024*1024){$('#form-error').textContent='Choose a PNG, JPG or WebP image up to 3 MB.';file.value='';return}
    $('#confirm-action').disabled=true;
    try{
      const bitmap=await createImageBitmap(selected);
      try{
        if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('Image too large');
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d');
        const side=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);
        const photo=canvas.toDataURL('image/png');
        if(version!==photoVersion||mode!=='profile'||!$('#modal').open||profileDraft?.owner!==owner||state.address?.toLowerCase()!==owner)return;
        profileDraft.photo=photo;preview.src=photo;preview.className='profile-photo';remove.hidden=false;
      }finally{bitmap.close()}
    }catch{if(version===photoVersion)$('#form-error').textContent='That image could not be opened. Try a different or smaller image.'}
    finally{if(version===photoVersion)$('#confirm-action').disabled=false;file.value=''}
  };
  const usernameLabel=node('label','Username');const input=document.createElement('input');input.id='profile-username';input.placeholder='Choose a username';input.autocomplete='off';input.minLength=3;input.maxLength=20;input.pattern='[a-zA-Z0-9_]{3,20}';input.required=true;input.value=profileDraft.username;input.oninput=()=>profileDraft.username=input.value;usernameLabel.append(input);fields.append(usernameLabel,node('p','3–20 letters, numbers or underscores. Availability is not checked in this draft. Your picture stays local and is resized to remove original image metadata.','wallet-hint'));
}
$('#edit-name').onclick=()=>open('profile');
$('#action-form').onsubmit=e=>{
  e.preventDefault();if(mode!=='profile'||!profileDraft||profileDraft.owner!==state.address?.toLowerCase())return;
  if(profileDraft.loading)return;const username=profileDraft.username.trim();
  if(!/^[A-Za-z0-9_]{3,20}$/.test(username)){$('#form-error').textContent='Use 3–20 letters, numbers or underscores.';return}
  profiles.set(profileDraft.owner,{username,photo:profileDraft.photo});profileDraft=null;photoVersion++;$('#modal').close();render();toast('Profile draft saved in this tab. Username is not registered yet.');
};
$('#modal').addEventListener('close',()=>{profileDraft=null;photoVersion++});
render();




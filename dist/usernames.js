/* Canonical username policy shared by the UI and future registry service. */
(function(root){'use strict';
const RESERVED=new Set(['nullis','admin','administrator','support','security','official','system','moderator','team','help','deposit','withdraw','swap']);
function normalize(value){
 if(typeof value!=='string')throw Error('Enter a username.');
 const name=value.trim().replace(/^@/,'');
 if(!/^[A-Za-z0-9_]{3,20}$/.test(name))throw Error('Use 3–20 letters, numbers or underscores.');
 if(RESERVED.has(name.toLowerCase()))throw Error('This username is reserved. Choose another.');
 return name;
}
const api={normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NullisUsernames=api;
})(globalThis);

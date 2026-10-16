// tsx uses os.userInfo only to name its temp directory. This Windows sandbox
// cannot answer that API; use the existing environment username for that call.
const os=require('node:os'),original=os.userInfo;
os.userInfo=function(...args){try{return original.apply(this,args)}catch(e){if(!process.env.USERNAME)throw e;return {username:process.env.USERNAME,homedir:os.homedir(),uid:-1,gid:-1,shell:null}}};
require(require('node:path').resolve(__dirname,'../node_modules/drizzle-kit/bin.cjs'));

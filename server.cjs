const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'dist');
(async()=>{
 const {openDatabase}=await import('./registry/sqlite.mjs'),{handleRegistry}=await import('./registry/handler.mjs');fs.mkdirSync(path.join(__dirname,'.local'),{recursive:true});const DB=openDatabase(path.join(__dirname,'.local/registry.sqlite'));
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4318');
  if(url.pathname.startsWith('/api/')){
   try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413).end();return}chunks.push(chunk)}const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),response=await handleRegistry(request,{DB});if(!response){res.writeHead(404).end();return}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500).end('Local API unavailable')}return;
  }
  const f=path.join(root,url.pathname==='/'?'index.html':url.pathname);if(!f.startsWith(root+path.sep)||url.pathname.startsWith('/server/')||url.pathname.startsWith('/.openai/')){res.writeHead(403).end();return}
  fs.readFile(f,(err,data)=>{if(err){res.writeHead(404).end('Not found');return}res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'text/plain');res.end(data)});
 }).listen(4318,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4318 (persistent username registry)'));
 process.on('SIGINT',()=>server.close(()=>{DB.close();process.exit(0)}));
})().catch(e=>{console.error(e.message);process.exitCode=1});

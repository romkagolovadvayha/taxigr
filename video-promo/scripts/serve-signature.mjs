import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const directory=path.resolve(import.meta.dirname,'../out/signature');
const server=http.createServer((request,response)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400).end();return;}
  if(pathname==='/')pathname='/index.html';
  const file=path.resolve(directory,`.${pathname}`);
  if(!file.startsWith(directory+path.sep)){response.writeHead(403).end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404).end('Preparing video');return;}
  const size=fs.statSync(file).size;
  const types={'.html':'text/html; charset=utf-8','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
  const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
  const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if(range){
    const start=Number(range[1]),end=range[2]?Math.min(size-1,Number(range[2])):size-1;
    if(start>end||start>=size){response.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
    response.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
    if(request.method==='HEAD')response.end();else fs.createReadStream(file,{start,end}).pipe(response);
  }else{
    response.writeHead(200,{...headers,'Content-Length':size});
    if(request.method==='HEAD')response.end();else fs.createReadStream(file).pipe(response);
  }
});
server.listen(0,'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}/`));

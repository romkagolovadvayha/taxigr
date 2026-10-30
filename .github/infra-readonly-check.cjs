const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsZg7mblPsRDAtchCL5GE\nCzdbgaGtrOsjSrGNfgWpKErJt3NTdwI3WdjzTrGWGRlxHZDOEG2RRro/3lD6sew/\n7KO+aeQCusjgRMqzotT4om+VeuIPlbiPByr4LuF0JZNKJRnwBpFD0K5Iz66IISmn\n4H+WD7OQTUWmOJUWY0J2MtgceDlltcBQhn4jyBiURXTCWARjL9NSp9GFS0pkMytg\nx7uvsxqNS7rcFUqLyCjR8iP+LgjZulODJV/ufP30WSJn6pXzdbefMhZDgeV37dHU\nKCt5DXT+uMlFzFrK4ZUeESsHpA88lGtscSCx5noAoz+btFvJXqRW0ikJZYmmMGcH\ncwIDAQAB\n-----END PUBLIC KEY-----\n";
const out={checkedAt:new Date().toISOString(),readOnly:true};
function command(file,args){try{return execFileSync(file,args,{encoding:'utf8',timeout:15000,maxBuffer:500000,stdio:['ignore','pipe','pipe']}).trim();}catch(e){return {error:e.status??e.code,output:String(e.stdout||'').trim()};}}
async function run(){
 out.host={hostname:os.hostname(),cpu:os.availableParallelism(),uptimeDays:Number((os.uptime()/86400).toFixed(2)),load:os.loadavg(),memory:command('free',['-m']),disk:command('df',['-h','/']),vmstat:command('vmstat',['1','3'])};
 out.services=command('systemctl',['show','taxigr-api.service','nginx.service','mysql.service','-p','Id','-p','ActiveState','-p','SubState','-p','NRestarts','-p','MemoryCurrent','-p','ActiveEnterTimestamp']);
 out.failedUnits=command('systemctl',['--failed','--no-pager','--no-legend']);
 out.kernelErrors=command('journalctl',['-k','--since','7 days ago','--no-pager','--grep','Out of memory|Killed process|I/O error|EXT4-fs error','-n','20']);
 out.lifecycle=command('journalctl',['-u','taxigr-api.service','--since','2026-10-30 19:06:36 UTC','--no-pager','--grep','Starting|Started|Stopping|Stopped|timed out|Failed|shutting down|Server listening','-n','30']);
 out.probes=[];
 for(const target of [{label:'local-ready',url:'http://127.0.0.1:4100/health/ready'},{label:'public-ready',url:'https://api.taxigr.ru/health/ready'},{label:'sms-network',url:'https://one-api.notificore.ru/api/accounts/balance'}]){
  const start=Date.now();try{const r=await fetch(target.url,{signal:AbortSignal.timeout(10000)});out.probes.push({target:target.label,http:r.status,ms:Date.now()-start});await r.body?.cancel();}catch(e){out.probes.push({target:target.label,error:String(e.message),ms:Date.now()-start});}
 }
 const mysql=require(process.cwd()+'/server/node_modules/mysql2/promise');
 const db=await mysql.createConnection({uri:process.env.MYSQL_URL,timezone:'Z'});
 try{await db.query('START TRANSACTION READ ONLY');const [rows]=await db.query('SELECT COUNT(*) AS tables_count, SUM(data_length+index_length) AS bytes FROM information_schema.tables WHERE table_schema=DATABASE()');out.database=rows[0];await db.rollback();}finally{await db.end();}
 out.applicationDisk=command('du',['-sh','/var/www/taxigr']);
 out.finishedAt=new Date().toISOString();
}
function emit(){
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(out)))),cipher.final()]);
 const envelope=Buffer.from(JSON.stringify({key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})).toString('base64');
 for(let i=0;i<envelope.length;i+=10000)console.log('REPORT_CHUNK:'+envelope.slice(i,i+10000));console.log('REPORT_COMPLETE');
}
run().catch(e=>{out.error=String(e.message).replace(/\+?\d{10,15}/g,'[redacted]').slice(0,300);process.exitCode=1;}).finally(emit);

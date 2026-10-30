const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),readline=require('node:readline');
const {spawn}=require('node:child_process');
const mysql=require(process.cwd()+'/server/node_modules/mysql2/promise');
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmHwmXreu6HtxMgjGdLgC\nPkHyZA6nMzI9LBZ4of8HhQTKafMxkgHcq9k0VFSCT8ySZb+oBPlw4sxOM1tzHMOX\ns1b07E63pBwEHWUWuZ0DGYL44mcmomNfsqBO9t0yLIlVUrwF1Z464a3E4lbHw71G\noJHSqADZ9GZ8p1I7Qkir8KlREBWMMEQZllb9QxNIRSiN2+Ydfd5k+4NJzZTHkHIH\nra8a+kNbj2Nc43FFVsomXvROM1/Uua/tpKtj4ar3uSlFWqc8tEwNgOo0ceDp+KVb\nTRG4PQezQQmKpI2+DQaKSgTlu9SJi5kzexsJsJ8EbvS8YRQlXHq8HLv+/UUuBfND\n6wIDAQAB\n-----END PUBLIC KEY-----\n";
const out={sms:[],smsErrors:[],lifecycle:[],warnings:[]};
const clean=v=>String(v||'').replace(/Bearer\s+\S+/gi,'[token]').replace(/([?&](?:token|access_token|code|secret)=)[^&\s]+/gi,'$1[redacted]').slice(0,1200);
(async()=>{
 const db=await mysql.createConnection({uri:process.env.MYSQL_URL,timezone:'Z',dateStrings:true});
 try{
  await db.query('START TRANSACTION READ ONLY');
  const [users]=await db.query('SELECT id,name,phone FROM users WHERE phone IS NOT NULL');
  const matches=new Map(users.map(u=>[crypto.createHmac('sha256',process.env.JWT_SECRET).update('auth-abuse:phone:'+u.phone).digest('hex'),u]));
  const [events]=await db.query("SELECT created_at,phone_fingerprint,phone_mask,request_id,outcome FROM auth_attempt_events WHERE created_at>='2026-10-23 20:00:00' AND outcome='sms_failed' ORDER BY created_at");
  out.sms=events.map(e=>({time:e.created_at,mask:e.phone_mask,requestId:e.request_id,matchedUserId:matches.get(e.phone_fingerprint)?.id||null,matchedName:matches.get(e.phone_fingerprint)?.name||null}));
  await db.rollback();
 }finally{await db.end();}
 const child=spawn('journalctl',['-u','taxigr-api.service','--since','2026-10-23 20:00:00 UTC','-o','json','--no-pager'],{stdio:['ignore','pipe','ignore']});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',c=>c===0?resolve():reject(Error('journal '+c)))});
 for await(const line of readline.createInterface({input:child.stdout,crlfDelay:Infinity})){
  let entry,msg;try{entry=JSON.parse(line)}catch{continue}
  const time=new Date(Number(entry.__REALTIME_TIMESTAMP)/1000).toISOString();
  try{msg=JSON.parse(entry.MESSAGE)}catch{
    if(/Starting|Started|Stopping|Stopped|timed out|Failed|failed|killed|Consumed/.test(String(entry.MESSAGE))) out.lifecycle.push({time,message:clean(entry.MESSAGE)});
    continue;
  }
  if(msg.msg==='phone authentication SMS failed') out.smsErrors.push({time,requestId:msg.reqId,error:clean(typeof msg.error==='string'?msg.error:msg.error?.message||msg.err?.message)});
  if(/shutting down|Server listening|uncaught|unhandled/.test(msg.msg||'')) out.lifecycle.push({time,message:clean(msg.msg),signal:msg.signal});
 }
 await done;
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(out)))),c.final()]);
 const envelope=Buffer.from(JSON.stringify({key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')})).toString('base64');
 for(let i=0;i<envelope.length;i+=10000)console.log('REPORT_CHUNK:'+envelope.slice(i,i+10000));
 console.log('REPORT_COMPLETE:'+JSON.stringify({bytes:envelope.length}));
})().catch(e=>{console.error('Read-only audit failed: '+clean(e.message));process.exitCode=1});

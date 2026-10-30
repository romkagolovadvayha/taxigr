const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),readline=require('node:readline');
const {spawn}=require('node:child_process');
const mysql=require(process.cwd()+'/server/node_modules/mysql2/promise');
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxHqr+RXYglw4cgA9Xwha\n7KGxqnqudBO3VplEm2vO2+5rTtDpojomZLjrLx5dvuU1w9f9sv1FLcbZgesJWLYu\n1rp0yZ7S640jEl+Jcd9VX9A9FJNxCPLg+hfXUCwJeULVyqM696FUQZxKmcXk5NwK\n6tiP2vs0pLkb6PyRBTNGJXxjV9QKERFvPPZGExT3GyK5SMwdEeIw1XHDZ8kLV/VT\n9MfzVDctruBnCnz1zx/oE59bJBGdjGc1/V86dat9331KbA/qEILxypCYuO5v7aG+\nbXzlIj9wOlW7ILswxR0Lti11Xfl2uFPWSFVIsOPan35RY8dq3SYDlggD+601X0hO\n1wIDAQAB\n-----END PUBLIC KEY-----\n";
const out={startedAt:new Date().toISOString(),since:'2026-10-29 20:00:00',warnings:[]};
const clean=v=>String(v||'').replace(/Bearer\s+\S+/gi,'[token]').replace(/([?&](?:token|access_token|code|secret)=)[^&\s]+/gi,'$1[redacted]').replace(/\+?\d{10,15}/g,'[phone]').slice(0,1500);
function json(v){return typeof v==='string'?JSON.parse(v):v;}
async function run(){
 const db=await mysql.createConnection({uri:process.env.MYSQL_URL,timezone:'Z',dateStrings:true});
 try{
  await db.query('SET SESSION MAX_EXECUTION_TIME=15000');await db.query('START TRANSACTION READ ONLY');
  const query=async(name,sql,params=[])=>{try{const [rows]=await db.query(sql,params);out[name]=rows;return rows;}catch(e){out.warnings.push(name+': '+e.code);return [];}};
  await query('events',`SELECT e.external_user_id,e.event_id,e.created_at,e.response_json,a.user_id,u.name,RIGHT(u.phone,4) AS last4 FROM messenger_booking_events e LEFT JOIN user_messenger_accounts a ON a.provider=e.provider AND a.external_user_id=e.external_user_id LEFT JOIN users u ON u.id=a.user_id WHERE e.provider='max' AND e.created_at>=? ORDER BY e.created_at LIMIT 1000`,[out.since]);
  out.events=out.events.map(e=>({...e,response_json:undefined,reply:json(e.response_json)}));
  const drafts=await query('drafts',`SELECT d.external_user_id,d.expires_at,d.draft_json,a.user_id,u.name FROM messenger_booking_drafts d LEFT JOIN user_messenger_accounts a ON a.provider=d.provider AND a.external_user_id=d.external_user_id LEFT JOIN users u ON u.id=a.user_id WHERE d.provider='max'`);
  out.drafts=drafts.map(d=>{const raw=json(d.draft_json);const allowed=['id','stage','pickupRaw','destinationRaw','pickup','destination','selectedPickup','selectedDestination','choice','priceMinor','orderId'];return {...d,draft_json:undefined,draft:Object.fromEntries(allowed.filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]))};});
  await query('orders',`SELECT o.id,o.passenger_id,u.name,RIGHT(u.phone,4) AS last4,o.driver_id,o.status,o.pricing_mode,o.manual_price_set,o.pickup_label,o.pickup_details,o.pickup_lat,o.pickup_lon,o.destination_label,o.destination_details,o.destination_lat,o.destination_lon,o.price_minor,o.comment,o.created_at,o.updated_at FROM orders o JOIN users u ON u.id=o.passenger_id WHERE o.created_at>=? AND o.comment LIKE 'Из max.%' ORDER BY o.created_at LIMIT 100`,[out.since]);
  await query('addressColumns',`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('address_directory','geocoding_cache','remembered_address_points','places') ORDER BY TABLE_NAME,ORDINAL_POSITION`);
  await db.rollback();
 }finally{await db.end();}
 out.errors=[];
 const child=spawn('journalctl',['-u','taxigr-api.service','--since',out.since+' UTC','-o','json','--no-pager'],{stdio:['ignore','pipe','ignore']});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',c=>c===0?resolve():reject(Error('journal '+c)))});
 for await(const line of readline.createInterface({input:child.stdout,crlfDelay:Infinity})){
  let entry,msg;try{entry=JSON.parse(line);msg=JSON.parse(entry.MESSAGE);}catch{continue;}
  if(msg.level>=40&&out.errors.length<300)out.errors.push({time:new Date(Number(entry.__REALTIME_TIMESTAMP)/1000).toISOString(),reqId:msg.reqId,message:clean(msg.msg),error:clean(msg.err?.message||msg.error?.message||msg.error||msg.message),code:msg.code});
 }
 await done;out.finishedAt=new Date().toISOString();
}
function emit(){const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(out)))),cipher.final()]);const e=Buffer.from(JSON.stringify({key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})).toString('base64');for(let i=0;i<e.length;i+=10000)console.log('REPORT_CHUNK:'+e.slice(i,i+10000));console.log('REPORT_COMPLETE');}
run().catch(e=>{out.error=clean(e.message);process.exitCode=1;}).finally(emit);

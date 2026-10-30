const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const mysql=require(process.cwd()+'/server/node_modules/mysql2/promise');
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq5I9c45L/fcpB7p9vTf9\n9yN6aBhLmC5nk0+qxIAdP7WyKMrNQfAAtZYee7v6l4z+X+3oOp2BYpA6vscvDlFr\nA2ER3q2/lb1NBimmRd1x8a4dT/kGbSibiIJbLzGdxXoFxaUKZwCHAPSg7jETaauU\nO7jYfBYqgrocfVxjsgp3xpFlct7hsTyCBefu9kHURTWRrE/Ci0EY45+2xepqT9rl\nthQ9nWm2ZY9T5Awhgt6ZcJ45kxCBRwvuS3WVpSb+1FKPlhZOCBO18Gfg40F56pZM\n80/8KUsq2dK7Eb5r+GvPiz3IjWWCytfOKTyQbAXP+OOrtUl3VaXLtD6Bxm0R1Enh\niwIDAQAB\n-----END PUBLIC KEY-----\n";
const out={startedAt:new Date().toISOString(),recent:[],providerRequests:[],statusChecks:[]};
const lock='/var/tmp/taxigr-sms-check-20261030-a7196.json';
const clean=v=>String(v||'').replace(/Bearer\s+\S+/gi,'[token]').replace(/\+?\d{10,15}/g,'[phone]').slice(0,700);
const originalFetch=globalThis.fetch;
let bearer;
async function readProvider(path){
 const response=await originalFetch('https://one-api.notificore.ru/api'+path,{headers:{Authorization:bearer,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 const body=await response.json().catch(()=>({}));return {httpStatus:response.status,body};
}
async function run(){
 const db=await mysql.createConnection({uri:process.env.MYSQL_URL,timezone:'Z',dateStrings:true});
 let owner;
 try{
  await db.query('START TRANSACTION READ ONLY');
  const [rows]=await db.query("SELECT id,phone FROM users WHERE id=? AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role='admin')",['cc616a7a-0c36-43bd-b80a-dd1cbd578855']);
  owner=rows[0];
  const [events]=await db.query("SELECT created_at,phone_mask,outcome,request_id FROM auth_attempt_events WHERE created_at>='2026-10-30 19:06:36' AND outcome IN ('sms_sent','sms_failed') ORDER BY created_at LIMIT 100");out.recent=events;
  await db.rollback();
 }finally{await db.end();}
 const digits=v=>String(v||'').replace(/\D/g,'');
 if(!owner||!digits(owner.phone).endsWith('9607')||!String(process.env.SUPERADMIN_PHONES||'').split(',').some(p=>digits(p)===digits(owner.phone)))throw Error('Owner phone safety check failed; no SMS sent');
 if(process.env.SMS_PROVIDER!=='notificore')throw Error('Real SMS provider is not enabled');
 out.recipientLast4=digits(owner.phone).slice(-4);
 require(require.resolve('tsx/cjs',{paths:[process.cwd()+'/server']}));
 const sms=require(process.cwd()+'/server/sms.ts');
 if(fs.existsSync(lock)){out.prior=JSON.parse(fs.readFileSync(lock,'utf8'));out.skippedDuplicate=true;return;}
 globalThis.fetch=async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path==='/api/2fa/authentications/otp')bearer=new Headers(init?.headers).get('Authorization');
  const response=await originalFetch(url,init);
  if(path==='/api/2fa/authentications/otp'){
   const body=await response.clone().json().catch(()=>({}));
   out.providerRequests.push({at:new Date().toISOString(),httpStatus:response.status,status:body.data?.status,error:response.ok?undefined:clean(body.errors?.[0]?.message||body.message||body.error),errorCode:body.errors?.[0]?.code});
  }
  return response;
 };
 fs.writeFileSync(lock,JSON.stringify({startedAt:out.startedAt,state:'send-attempted'}),{flag:'wx',mode:0o600});
 try{
  const result=await sms.sendPhoneVerificationCode(owner.phone,'','127.0.0.1');
  out.send={accepted:true,at:new Date().toISOString(),...result};
 }catch(e){out.send={accepted:false,error:clean(e.message)};}
 finally{globalThis.fetch=originalFetch;}
 if(bearer){
  const balance=await readProvider('/accounts/balance');
  out.balance={httpStatus:balance.httpStatus,balance:balance.body.data?.balance,currency:balance.body.data?.currency,credit:balance.body.data?.credit};
  if(out.send?.providerAuthenticationId){
   for(const delay of [10000,20000]){
    await new Promise(resolve=>setTimeout(resolve,delay));
    const result=await readProvider('/2fa/authentications/'+encodeURIComponent(out.send.providerAuthenticationId));
    const data=result.body.data||{};
    const messages=(data.messages||[]).map(m=>({status:m.status,channel:m.channel,price:m.price,currency:m.currency,sentAt:m.sent_at,createdAt:m.created_at}));
    out.statusChecks.push({at:new Date().toISOString(),httpStatus:result.httpStatus,status:data.status,messages});
    if(messages.some(m=>m.status==='delivered'||m.status==='undelivered'))break;
   }
  }
 }
 out.finishedAt=new Date().toISOString();fs.writeFileSync(lock,JSON.stringify(out),{mode:0o600});
}
function emit(){
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(out)))),cipher.final()]);
 const e=Buffer.from(JSON.stringify({key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})).toString('base64');
 for(let i=0;i<e.length;i+=10000)console.log('REPORT_CHUNK:'+e.slice(i,i+10000));console.log('REPORT_COMPLETE');
}
run().catch(e=>{out.error=clean(e.message);process.exitCode=1;}).finally(emit);

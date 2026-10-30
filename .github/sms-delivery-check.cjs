const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq5I9c45L/fcpB7p9vTf9\n9yN6aBhLmC5nk0+qxIAdP7WyKMrNQfAAtZYee7v6l4z+X+3oOp2BYpA6vscvDlFr\nA2ER3q2/lb1NBimmRd1x8a4dT/kGbSibiIJbLzGdxXoFxaUKZwCHAPSg7jETaauU\nO7jYfBYqgrocfVxjsgp3xpFlct7hsTyCBefu9kHURTWRrE/Ci0EY45+2xepqT9rl\nthQ9nWm2ZY9T5Awhgt6ZcJ45kxCBRwvuS3WVpSb+1FKPlhZOCBO18Gfg40F56pZM\n80/8KUsq2dK7Eb5r+GvPiz3IjWWCytfOKTyQbAXP+OOrtUl3VaXLtD6Bxm0R1Enh\niwIDAQAB\n-----END PUBLIC KEY-----\n";
const out={checkedAt:new Date().toISOString(),readOnly:true};
async function run(){
 const prior=JSON.parse(fs.readFileSync('/var/tmp/taxigr-sms-check-20261030-a7196.json','utf8'));
 if(!prior.send?.accepted||!prior.send?.providerAuthenticationId)throw Error('No accepted diagnostic message');
 let token=process.env.NOTIFICORE_BEARER_TOKEN;
 if(!token){
  const r=await fetch('https://one-api.notificore.ru/api/auth/login',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({api_key:process.env.NOTIFICORE_API_KEY}),signal:AbortSignal.timeout(10000)});
  const b=await r.json();if(!r.ok)throw Error('Provider authentication HTTP '+r.status);token=b.bearer||b.data?.bearer;
 }
 if(!token)throw Error('Missing provider authentication');
 const r=await fetch('https://one-api.notificore.ru/api/2fa/authentications/'+encodeURIComponent(prior.send.providerAuthenticationId),{headers:{Accept:'application/json',Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 const b=await r.json();out.httpStatus=r.status;
 const permitted=/^(status|state|delivery_status|message_status|status_name|sent_at|created_at|updated_at|finished_at|delivered_at|price|currency|channel|error|error_message)$/i;
 function summarize(value,path='',depth=0){
  if(depth>8)return '[depth]';
  if(value===null)return null;
  if(Array.isArray(value))return value.slice(0,5).map((v,i)=>summarize(v,path+'.'+i,depth+1));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,permitted.test(k)&&typeof v!=='object'?String(v).slice(0,200):summarize(v,path+'.'+k,depth+1)]));
  if(typeof value==='string'&&/^[\[{]/.test(value)){try{return summarize(JSON.parse(value),path,depth+1);}catch{}}
  return '['+typeof value+']';
 }
 out.receipt=summarize(b);out.finishedAt=new Date().toISOString();
}
function emit(){
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(out)))),cipher.final()]);
 const e=Buffer.from(JSON.stringify({key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})).toString('base64');
 for(let i=0;i<e.length;i+=10000)console.log('REPORT_CHUNK:'+e.slice(i,i+10000));console.log('REPORT_COMPLETE');
}
run().catch(e=>{out.error=String(e.message).slice(0,200);process.exitCode=1;}).finally(emit);

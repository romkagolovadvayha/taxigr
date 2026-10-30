const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAukVuT9ZDjC6FiOwaWfZe\nSXe/FOO2tDXZc5f7bS6FETkpR5yg18zHioJO/KPXd/ZLOKE9pAQuOgI2D9fZx+0K\nZ8H04nU4nPXSKWHLCc+U3nRBF/g0oY3XGlm0fuml8RcYtJdcnUvNw8b0Wku975bY\n/kttKOX+OsKEWiglQTNeWjy+mRA9a8at+2uvIwLrgbhyJ3C99ATxQpaPEbbvLpr3\nvRjgYL2xHugcb58wtC/9bjiLloItZsi23WuCXylCEg3HUoto/nvGzvYq9Bv8QPVS\nckrTctJErgsbtBP2qxqXGQf6jR1KP+KNjvwNfOdZi/nmwlqjwJY8Q5q+MZzUD6X9\n2QIDAQAB\n-----END PUBLIC KEY-----\n";
const out={startedAt:new Date().toISOString(),host:'212.193.26.91',actions:[]};
function cmd(file,args,timeout=15000){try{return {ok:true,text:execFileSync(file,args,{encoding:'utf8',timeout,maxBuffer:1500000,stdio:['ignore','pipe','pipe'],env:{...process.env,DEBIAN_FRONTEND:'noninteractive',NEEDRESTART_MODE:'l'}}).trim()};}catch(e){return {ok:false,status:e.status??e.code,text:String(e.stdout||'').slice(-3000),error:String(e.stderr||e.message).slice(-3000)};}}
function state(){return cmd('systemctl',['show','qemu-guest-agent','-p','LoadState','-p','ActiveState','-p','SubState','-p','UnitFileState','-p','Result','-p','MainPID','-p','ActiveEnterTimestamp']);}
function required(file,args,timeout){const result=cmd(file,args,timeout);out.actions.push({command:file+' '+args.join(' '),...result});if(!result.ok)throw Error('Command failed: '+file+' '+args.join(' '));return result;}
async function run(){
 out.before={package:cmd('dpkg-query',['-W','-f=${Status} ${Version}','qemu-guest-agent']),state:state(),bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()};
 out.before.webServices=cmd('systemctl',['show','taxigr-api','nginx','mysql','-p','Id','-p','ActiveState','-p','MainPID','-p','ActiveEnterTimestamp']);
 out.before.unit=cmd('systemctl',['cat','qemu-guest-agent']);
 if(!out.before.package.ok||!/^(?:install|hold) ok installed/.test(out.before.package.text)){
  required('apt-get',['update','-o','Acquire::Retries=1','-o','Acquire::http::Timeout=20','-o','Acquire::https::Timeout=20'],180000);
  required('apt-get',['install','-y','--no-install-recommends','-o','DPkg::Lock::Timeout=60','qemu-guest-agent'],180000);
 }
 const port='/dev/virtio-ports/org.qemu.guest_agent.0';
 if(!fs.existsSync(port))required('modprobe',['virtio_console']);
 if(!fs.existsSync(port))throw Error('Hypervisor guest-agent channel is absent');
 const current=state().text;
 if(/UnitFileState=masked/.test(current))required('systemctl',['unmask','qemu-guest-agent']);
 required('systemctl',['daemon-reload']);
 const enabled=cmd('systemctl',['is-enabled','qemu-guest-agent']);
 if(enabled.text!=='static'&&enabled.text!=='enabled')required('systemctl',['enable','qemu-guest-agent']);
 required('systemctl',['restart','qemu-guest-agent'],30000);
 await new Promise(resolve=>setTimeout(resolve,2000));
 out.after={package:cmd('dpkg-query',['-W','-f=${Status} ${Version}','qemu-guest-agent']),state:state(),bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),port:fs.realpathSync(port)};
 const pid=cmd('systemctl',['show','qemu-guest-agent','-p','MainPID','--value']).text;
 out.after.openAgentChannel=false;
 if(/^\d+$/.test(pid)&&pid!=='0')for(const fd of fs.readdirSync('/proc/'+pid+'/fd')){try{if(fs.readlinkSync('/proc/'+pid+'/fd/'+fd)===out.after.port)out.after.openAgentChannel=true;}catch{}}
 out.after.udevRules=[];
 for(const root of ['/usr/lib/udev/rules.d','/lib/udev/rules.d'])if(fs.existsSync(root))for(const name of fs.readdirSync(root)){if(!/qemu|virtio/.test(name))continue;const text=fs.readFileSync(root+'/'+name,'utf8');if(text.includes('org.qemu.guest_agent.0'))out.after.udevRules.push({path:root+'/'+name,text});}
 out.after.services=cmd('systemctl',['show','taxigr-api','nginx','mysql','-p','Id','-p','ActiveState','-p','MainPID','-p','ActiveEnterTimestamp']);
 out.after.agentJournal=cmd('journalctl',['-u','qemu-guest-agent','--since',out.startedAt.replace('T',' ').replace(/\.\d+Z$/,' UTC'),'--no-pager','-n','15']);
 const r=await fetch('http://127.0.0.1:4100/health/ready',{signal:AbortSignal.timeout(10000)});out.after.apiReady=r.status;await r.body?.cancel();
 if(!out.after.state.text.includes('ActiveState=active')||!out.after.openAgentChannel||r.status!==200)throw Error('Post-install verification failed');
 out.finishedAt=new Date().toISOString();
}
function emit(){
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(out)))),cipher.final()]);
 const envelope=Buffer.from(JSON.stringify({key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})).toString('base64');
 for(let i=0;i<envelope.length;i+=10000)console.log('REPORT_CHUNK:'+envelope.slice(i,i+10000));console.log('REPORT_COMPLETE');
}
run().catch(e=>{out.error=String(e.message).slice(0,300);process.exitCode=1;}).finally(emit);

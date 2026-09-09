import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
for(const [script,args] of [['generate-signature-audio.mjs',[]],['render-signature.mjs',['final']],['finalize-signature.mjs',[]],['build-signature-preview.mjs',['--final']]]){
  const result=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.status!==0)process.exit(result.status||1);
}

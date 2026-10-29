import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill, renderMedia} from '@remotion/renderer';

const root=path.resolve(import.meta.dirname,'..');
const edit=JSON.parse(await fs.readFile(path.join(root,'signature-edit.json'),'utf8'));
const out=path.join(root,'out/signature');
await fs.mkdir(out,{recursive:true});
const mode=process.argv[2]||'frames';
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.ts'),outDir:path.join(out,mode==='probe'?'probe-bundle':mode==='closing-tail'?'tail-bundle':'bundle'),publicDir:path.join(root,'public')});
console.log('Bundle ready');
const browser=await openBrowser('chrome',{logLevel:'error',browserExecutable:process.env.REMOTION_BROWSER_EXECUTABLE,chromiumOptions:{gl:process.env.REMOTION_GL||'angle'}});
try{
  const composition=await selectComposition({serveUrl,id:'TaxiGrahovoSignature',puppeteerInstance:browser,logLevel:'error'});
  if(mode==='frames'||mode==='probe'){
    for(const [label,seconds] of mode==='probe'?[['probe-driver-start',7.5],['probe-driver-visible',8.5],['probe-map-start',11.6],['04-map',13.2]]:edit.previewFrames){
      const frame=Math.round(seconds*composition.fps);
      await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,output:path.join(out,`${label}.png`),imageFormat:'png',scale:.65,logLevel:'error'});
      console.log(`Checked frame ${frame}: ${label}`);
    }
  }else{
    const preview=mode==='preview';
    const closingTail=mode==='closing-tail';
    const config=preview?{...composition,fps:30,durationInFrames:Math.round(edit.duration*30)}:composition;
    const firstFrame=closingTail?Math.round(edit.scenes.close.start*config.fps):0;
    let last=-1;
    await renderMedia({serveUrl,composition:config,puppeteerInstance:browser,codec:'h264',crf:preview?25:18,pixelFormat:'yuv420p',scale:preview?.5:1,concurrency:Number(process.env.REMOTION_CONCURRENCY||4),imageFormat:'jpeg',jpegQuality:preview?83:95,
      frameRange:closingTail?[firstFrame,config.durationInFrames-1]:undefined,
      muted:closingTail,
      outputLocation:path.join(out,closingTail?'taxigr-signature-closing-tail.mp4':preview?'taxigr-signature-preview.mp4':'taxigr-signature-1080x1920-60fps-raw.mp4'),logLevel:'error',
      onProgress:({progress,renderedFrames})=>{const percent=Math.floor(progress*100);if(percent>=last+5){last=percent;console.log(`${percent}% — ${renderedFrames}/${config.durationInFrames-firstFrame} frames`);}}
    });
    console.log(preview?'Preview complete':'Master render complete');
  }
}finally{await browser.close({silent:true});}

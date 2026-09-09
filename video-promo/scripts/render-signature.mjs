import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill, renderMedia} from '@remotion/renderer';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'out/signature');
await fs.mkdir(out,{recursive:true});
const mode=process.argv[2]||'frames';
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.ts'),outDir:path.join(out,'bundle'),publicDir:path.join(root,'public')});
console.log('Bundle ready');
const browser=await openBrowser('chrome',{logLevel:'error'});
try{
  const composition=await selectComposition({serveUrl,id:'TaxiGrahovoSignature',puppeteerInstance:browser,logLevel:'error'});
  if(mode==='frames'){
    for(const [label,frame] of [['01-hook',180],['02-order',365],['03-driver',580],['04-map',900],['05-arrival',1090],['06-rating',1355],['07-thanks',1480],['08-close',1760]]){
      await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,output:path.join(out,`${label}.png`),imageFormat:'png',scale:.65,logLevel:'error'});
      console.log(`Checked frame ${frame}: ${label}`);
    }
  }else{
    const preview=mode==='preview';
    const config=preview?{...composition,fps:30,durationInFrames:960}:composition;
    let last=-1;
    await renderMedia({serveUrl,composition:config,puppeteerInstance:browser,codec:'h264',crf:preview?25:18,pixelFormat:'yuv420p',scale:preview?.5:1,concurrency:2,imageFormat:'jpeg',jpegQuality:preview?83:95,
      outputLocation:path.join(out,preview?'taxigr-signature-preview.mp4':'taxigr-signature-1080x1920-60fps-raw.mp4'),logLevel:'error',
      onProgress:({progress,renderedFrames})=>{const percent=Math.floor(progress*100);if(percent>=last+5){last=percent;console.log(`${percent}% — ${renderedFrames}/${config.durationInFrames} frames`);}}
    });
    console.log(preview?'Preview complete':'Master render complete');
  }
}finally{await browser.close({silent:true});}

import fs from 'node:fs/promises';
import path from 'node:path';

const sampleRate=48000, duration=32, length=sampleRate*duration;
const left=new Float64Array(length), right=new Float64Array(length);
let seed=94321;
const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
function swoosh(center){
  const start=center-.22, count=Math.round(.43*sampleRate);let lp=0;
  for(let n=0;n<count;n++){
    const t=n/sampleRate,p=n/count;lp=lp*.92+noise()*.08;
    const e=Math.sin(Math.PI*p)**2;
    const v=(lp*.2+Math.sin(2*Math.PI*(170*t+520*t*t))*.008)*e;
    const i=Math.round(start*sampleRate)+n;if(i<0||i>=length)continue;
    left[i]+=v*Math.sqrt(1-p);right[i]+=v*Math.sqrt(p);
  }
}
function click(at,freq=620,gain=.035){
  for(let n=0;n<sampleRate*.14;n++){
    const t=n/sampleRate,e=Math.exp(-t*46)*Math.min(t/.003,1);
    const v=(Math.sin(2*Math.PI*freq*t)+.22*Math.sin(2*Math.PI*freq*2.01*t))*e*gain;
    const i=Math.round(at*sampleRate)+n;if(i<length){left[i]+=v;right[i]+=v;}
  }
}
for(const cut of [4.5,7.2,11.6,19.6,26.2666667])swoosh(cut);
for(const [at,freq] of [[1.7,740],[4.86,500],[5.18,620],[6.66,760],[8.43,660],[23.48,780]])click(at,freq);
for(let i=0;i<5;i++)click(20.1+i/6,660+i*110,.027);
click(24.44,880,.028);click(27.93,554,.025);
// A short original chord resolves the supplied voice track into the final brand hold.
for(let n=Math.round(29.35*sampleRate);n<length;n++){
  const t=n/sampleRate-29.35;
  const e=Math.min(t/.5,1)*Math.min((duration-n/sampleRate)/1.05,1);
  let l=0,r=0;
  for(const [i,freq] of [220,277.1826,329.6276,493.8833].entries()){
    const gain=.007/(1+i*.18);l+=Math.sin(2*Math.PI*freq*t)*gain;r+=Math.sin(2*Math.PI*(freq+.16)*t+.09)*gain;
  }
  left[n]+=l*e;right[n]+=r*e;
}
const pcm=Buffer.alloc(44+length*4);pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(2,22);pcm.writeUInt32LE(sampleRate,24);pcm.writeUInt32LE(sampleRate*4,28);pcm.writeUInt16LE(4,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(length*4,40);
for(let i=0;i<length;i++){pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),44+i*4);pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]))*32767),46+i*4);}
const target=path.resolve(import.meta.dirname,'../public/signature/sound-design.wav');await fs.writeFile(target,pcm);console.log(`Original stereo sound design: ${duration}s / ${sampleRate}Hz`);

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const plan=JSON.parse(fs.readFileSync(path.join(root,'signature-edit.json'),'utf8'));
const out=path.join(root,'out/pavel-voice');
const assets=path.join(root,'public/audio/user');
const ffmpeg=process.env.FFMPEG_PATH||path.resolve(root,'../tmp/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
fs.mkdirSync(out,{recursive:true});
function run(args){
  const result=spawnSync(ffmpeg,['-hide_banner','-nostdin','-y',...args],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
  if(result.status!==0)throw new Error(result.stderr||result.error?.message);
  return result.stderr;
}
function levels(file){
  const log=run(['-i',file,'-af','loudnorm=I=-17:TP=-2:LRA=8:print_format=json','-f','null','-']);
  return JSON.parse([...log.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)].at(-1)[0]);
}
function normalize(source,target,integrated){
  const measured=levels(source);
  const filter=`loudnorm=I=${integrated}:TP=-2:LRA=8:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:linear=true`;
  run(['-i',source,'-af',filter,'-ar','48000','-c:a','pcm_s24le',target]);
}

// Keep edits in existing pauses. Micro fades prevent clicks without clipping consonants.
const clips=plan.voice.clips;
for(let i=0;i<clips.length;i++){
  const clip=clips[i],end=clip.at+clip.end-clip.start;
  if(clip.end<=clip.start||clip.at<0||end>plan.duration)throw new Error(`Invalid voice clip ${i}`);
  if(i&&clips[i-1].at+clips[i-1].end-clips[i-1].start>clip.at)throw new Error('Voice clips overlap');
}
const edited=path.join(out,'voice-edited-dry.wav');
const decoded=spawnSync(ffmpeg,['-v','error','-i',path.join(assets,plan.voice.file),'-ac','1','-ar','48000','-f','f32le','-'],{maxBuffer:32*1024*1024,windowsHide:true});
if(decoded.status!==0)throw new Error('Could not decode source voice');
function floatWave(frames,channels){
  const data=Buffer.alloc(44+frames*channels*4);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);
  data.writeUInt16LE(3,20);data.writeUInt16LE(channels,22);data.writeUInt32LE(48000,24);data.writeUInt32LE(48000*channels*4,28);
  data.writeUInt16LE(channels*4,32);data.writeUInt16LE(32,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);
  return data;
}
const timeline=floatWave(Math.round(plan.duration*48000),1);
for(const clip of clips){
  const from=Math.round(clip.start*48000),to=Math.round(clip.end*48000),at=Math.round(clip.at*48000);
  if(to*4>decoded.stdout.length)throw new Error('Voice edit exceeds source');
  for(let i=0;i<to-from;i++){
    const fade=Math.min(1,i/(.006*48000),(to-from-1-i)/(.009*48000));
    timeline.writeFloatLE(decoded.stdout.readFloatLE((from+i)*4)*fade,44+(at+i)*4);
  }
}
fs.writeFileSync(edited,timeline);

// Short stereo room: a centered direct signal, quiet early reflections, and a dark diffuse tail.
// No pitch shift or tempo change; the actor's third take keeps its natural delivery.
const sampleRate=48000,irFrames=Math.round(sampleRate*.65);
const ir=Buffer.alloc(44+irFrames*2*4);
ir.write('RIFF');ir.writeUInt32LE(ir.length-8,4);ir.write('WAVEfmt ',8);ir.writeUInt32LE(16,16);
ir.writeUInt16LE(3,20);ir.writeUInt16LE(2,22);ir.writeUInt32LE(sampleRate,24);ir.writeUInt32LE(sampleRate*8,28);
ir.writeUInt16LE(8,32);ir.writeUInt16LE(32,34);ir.write('data',36);ir.writeUInt32LE(ir.length-44,40);
let seed=7319;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
for(let channel=0;channel<2;channel++){
  let low=0;
  const taps=channel===0?[[.026,.065],[.043,.039],[.071,.026],[.109,.013]]:[[.032,.06],[.053,.037],[.083,.024],[.127,.012]];
  for(let i=0;i<irFrames;i++){
    const time=i/sampleRate;
    low+=.32*(random()-low);
    let value=i===0?1:time>.04?low*.0045*Math.exp(-6.9078*(time-.04)/.58):0;
    for(const [delay,gain] of taps)if(i===Math.round(delay*sampleRate))value+=gain;
    ir.writeFloatLE(value,44+(i*2+channel)*4);
  }
}
const room=path.join(out,'short-stereo-room.wav');fs.writeFileSync(room,ir);
const tone='highpass=f=65,lowpass=f=14500,equalizer=f=135:t=q:w=0.8:g=1.2,equalizer=f=310:t=q:w=0.9:g=-1.7,equalizer=f=2800:t=q:w=0.8:g=1,deesser=i=0.12:m=0.25,acompressor=threshold=0.16:ratio=2:attack=18:release=135:knee=2.8:makeup=1.1';
const roomVoice=path.join(out,'voice-room.wav');
run(['-i',edited,'-i',room,'-filter_complex',`[0:a]${tone},pan=stereo|c0=c0|c1=c0[dry];[dry][1:a]afir=gtype=none:irnorm=-1:dry=1:wet=1:precision=double,atrim=duration=${plan.duration}[voice]`,'-map','[voice]','-ar','48000','-c:a','pcm_s24le',roomVoice]);
const voice=path.join(assets,'pavel-take-03-cinematic.wav');
normalize(roomVoice,voice,-17.5);

const musicTrim=path.join(out,'prizyv-excerpt.wav');
run(['-ss',String(plan.music.start),'-i',path.join(assets,plan.music.file),'-t',String(plan.duration),'-af','highpass=f=35,equalizer=f=2400:t=q:w=0.7:g=-2.5','-ar','48000','-c:a','pcm_s24le',musicTrim]);
const musicLevel=path.join(out,'prizyv-level.wav');normalize(musicTrim,musicLevel,-23);
// Sample-accurate ducking avoids dropped tail buffers in FFmpeg's multi-input filter scheduler.
function decodeStereo(file){
  const result=spawnSync(ffmpeg,['-v','error','-i',file,'-ac','2','-ar','48000','-f','f32le','-'],{maxBuffer:32*1024*1024,windowsHide:true});
  if(result.status!==0)throw new Error('Could not decode audio stem');
  return result.stdout;
}
const voiceData=decodeStereo(voice),musicData=decodeStereo(musicLevel);
const totalSamples=Math.round(plan.duration*48000);
if(voiceData.length!==totalSamples*8||musicData.length!==totalSamples*8)throw new Error('Unexpected audio stem duration');
const musicWave=floatWave(totalSamples,2),mixedWave=floatWave(totalSamples,2);
let energy=0,gain=1,peak=0;
const rmsCoefficient=Math.exp(-1/(.01*48000)),attack=Math.exp(-1/(.018*48000)),release=Math.exp(-1/(.32*48000));
for(let i=0;i<totalSamples;i++){
  const t=i/48000,left=voiceData.readFloatLE(i*8),right=voiceData.readFloatLE(i*8+4);
  energy=rmsCoefficient*energy+(1-rmsCoefficient)*Math.max(left*left,right*right);
  const rms=Math.sqrt(energy),target=rms>.075?Math.pow(rms/.075,1/2.2-1):1;
  const coefficient=target<gain?attack:release;gain=coefficient*gain+(1-coefficient)*target;
  let activity=0;
  for(const clip of clips){
    const end=clip.at+clip.end-clip.start;
    activity=Math.max(activity,Math.max(0,Math.min(1,(t-clip.at+.16)/.16,(end+.38-t)/.38)));
  }
  const fade=Math.min(1,t/.65,(plan.duration-t)/1.4);
  const volume=gain*(1-.36*activity)*Math.max(0,fade);
  for(let channel=0;channel<2;channel++){
    const musicSample=musicData.readFloatLE(i*8+channel*4)*volume;
    const mixed=voiceData.readFloatLE(i*8+channel*4)+musicSample;
    peak=Math.max(peak,Math.abs(mixed));
    musicWave.writeFloatLE(musicSample,44+i*8+channel*4);
    mixedWave.writeFloatLE(mixed,44+i*8+channel*4);
  }
}
if(peak>=1)throw new Error('Audio mix clips; lower stem levels');
const music=path.join(assets,'prizyv-ducked.wav');
const musicFloat=path.join(out,'prizyv-ducked-float.wav');fs.writeFileSync(musicFloat,musicWave);
run(['-i',musicFloat,'-c:a','pcm_s24le',music]);
const mix=path.join(out,'pavel-prizyv-mix.wav');
fs.writeFileSync(mix,mixedWave);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={generatedAt:new Date().toISOString(),...plan,sourceHashes:{voice:hash(path.join(assets,plan.voice.file)),music:hash(path.join(assets,plan.music.file))},processing:{voice:tone,room:'Centered dry voice, 26–32 ms pre-delay, quiet stereo reflections, 0.65 s diffuse room',music:'Requested Призыв; 2.4 kHz presence dip, phrase automation and sidechain ducking',oldAudioRemoved:true,tempo:1,pitch:1},measurements:{voice:levels(voice),music:levels(music),mix:levels(mix)}};
fs.writeFileSync(path.join(out,'audio-edit-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({voice,music,mix,levels:report.measurements.mix}));

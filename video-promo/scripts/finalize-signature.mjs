import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'), out=path.join(root,'out/signature');
const ffmpeg=process.env.FFMPEG_PATH||path.resolve(root,'../tmp/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const ffprobe=process.env.FFPROBE_PATH||path.resolve(root,'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe');
if(!existsSync(ffmpeg))throw new Error('Set FFMPEG_PATH to a full FFmpeg build with loudnorm, blackdetect and freezedetect filters.');
function run(binary,args){const result=spawnSync(binary,args,{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});if(result.status!==0)throw new Error(result.stderr||result.error?.message||'Media command failed');return result;}
const source=path.join(out,'taxigr-signature-1080x1920-60fps-raw.mp4');
const target=path.join(out,'taxigr-signature-1080x1920-60fps.mp4');
if(!process.argv.includes('--verify-only')){
console.log('Measuring audio');
const measurement=run(ffmpeg,['-hide_banner','-i',source,'-map','0:a:0','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-']);
const blocks=[...measurement.stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
if(!blocks.length)throw new Error('Loudness measurement missing');
const measured=JSON.parse(blocks.at(-1)[0]);
const filter=`loudnorm=I=-16:TP=-1.5:LRA=9:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;
console.log('Exporting BT.709 master with normalized audio');
const colorFilter='zscale=matrixin=470bg:transferin=iec61966-2-1:primariesin=709:rangein=full:matrix=709:transfer=709:primaries=709:range=limited,format=yuv420p';
run(ffmpeg,['-hide_banner','-y','-i',source,'-map','0:v:0','-map','0:a:0','-vf',colorFilter,'-c:v','libx264','-preset','fast','-crf','18','-threads','2','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-af',filter,'-c:a','aac','-b:a','192k','-ar','48000','-t','32','-movflags','+faststart','-metadata','title=Свои дороги. Своё такси. — Такси Грахово','-metadata','comment=Passenger motion promo; illustrated example trip',target]);
}
const probe=JSON.parse(run(ffprobe,['-v','error','-show_entries','stream=index,codec_name,width,height,r_frame_rate,nb_frames,duration,pix_fmt,sample_rate,channels:format=duration,size','-of','json',target]).stdout);
const video=probe.streams.find(s=>s.codec_name==='h264'), audio=probe.streams.find(s=>s.codec_name==='aac');
if(!video||video.width!==1080||video.height!==1920||video.r_frame_rate!=='60/1'||video.nb_frames!=='1920'||video.pix_fmt!=='yuv420p'||!audio||Math.abs(Number(probe.format.duration)-32)>.05)throw new Error('Unexpected master format');
const levels=run(ffmpeg,['-hide_banner','-i',target,'-map','0:a:0','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-']);
const finalLevels=JSON.parse([...levels.stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)].at(-1)[0]);
if(Number(finalLevels.input_tp)>-1)throw new Error('Audio true peak is too high');
console.log('Checking decode, black frames and freezes');
const motion=run(ffmpeg,['-hide_banner','-i',target,'-an','-vf','blackdetect=d=0.1:pix_th=0.01,freezedetect=n=-60dB:d=0.8','-f','null','-']);
await fs.writeFile(path.join(out,'master-motion-check.log'),motion.stderr);
const events=motion.stderr.split(/\r?\n/).filter(line=>/black_start:|freeze_start:|freeze_end:/.test(line));
if(events.some(line=>line.includes('black_start:')))throw new Error(`Review unexpected black sections: ${events.join('\n')}`);
// Low-motion detectors also flag the deliberate readable closing holds.
// Compare decoded frames to distinguish those holds from an actual frozen render.
const framehash=run(ffmpeg,['-hide_banner','-i',target,'-map','0:v:0','-c:v','rawvideo','-pix_fmt','rgb24','-f','framemd5','-']).stdout;
await fs.writeFile(path.join(out,'master-framemd5.txt'),framehash);
const hashes=framehash.split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').at(-1).trim());
let previous='',runLength=0,longestIdenticalRunFrames=0;
for(const hash of hashes){runLength=hash===previous?runLength+1:1;longestIdenticalRunFrames=Math.max(longestIdenticalRunFrames,runLength);previous=hash;}
if(hashes.length!==1920||longestIdenticalRunFrames>=48)throw new Error('Missing or frozen decoded frames');
run(ffmpeg,['-hide_banner','-y','-ss','3','-i',target,'-frames:v','1','-q:v','2',path.join(out,'poster.jpg')]);
const checksum=createHash('sha256').update(await fs.readFile(target)).digest('hex');
const report={checkedAt:new Date().toISOString(),file:path.basename(target),sha256:checksum,format:probe,loudness:{integratedLUFS:Number(finalLevels.input_i),truePeakDBTP:Number(finalLevels.input_tp),rangeLU:Number(finalLevels.input_lra)},checks:{decodedEntireVideo:true,unintendedBlackSections:0,decodedFrames:hashes.length,longestIdenticalRunFrames,lowMotionDetectorNotes:events,sourceAudio:'Existing user-supplied audio, words and speed unchanged',visualReview:'Eight scene frames and browser playback of the full preview. Final browser playback checked separately.'}};
await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({file:target,bytes:Number(probe.format.size),duration:probe.format.duration,loudness:report.loudness,sha256:checksum}));

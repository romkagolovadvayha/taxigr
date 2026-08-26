import React from 'react';
import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {C, FONT} from './styles';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const useSceneFrame = (baseDuration: number, actualDuration: number, exitStart?: number) => {
  const frame = useCurrentFrame();
  if (exitStart === undefined) {
    return interpolate(frame, [0, actualDuration - 1], [0, baseDuration - 1], clamp);
  }
  const exitDuration = baseDuration - exitStart;
  const actualExitDuration = Math.min(exitDuration, actualDuration - 1);
  const preExitDuration = Math.max(1, actualDuration - actualExitDuration);
  if (frame < preExitDuration) {
    return interpolate(frame, [0, Math.max(1, preExitDuration - 1)], [0, exitStart - 1], clamp);
  }
  return interpolate(frame, [preExitDuration, actualDuration - 1], [exitStart, baseDuration - 1], clamp);
};

const lift = (frame: number, delay = 0, distance = 80) => ({
  opacity: interpolate(frame, [delay, delay + 12], [0, 1], clamp),
  translate: `0 ${interpolate(frame, [delay, delay + 18], [distance, 0], {...clamp, easing: ease})}px`,
});

const Dot: React.FC<{color?: string; size?: number}> = ({color = C.brand, size = 22}) => (
  <span style={{width: size, height: size, borderRadius: 999, background: color, flex: '0 0 auto'}} />
);

const Pin: React.FC<{color?: string; size?: number}> = ({color = C.ink, size = 54}) => (
  <div style={{width:size,height:size,borderRadius:'50% 50% 50% 8px',background:color,rotate:'-45deg',display:'grid',placeItems:'center',boxShadow:'0 12px 30px #0002'}}>
    <div style={{width:size*.32,height:size*.32,borderRadius:99,background:C.surface}} />
  </div>
);

const HookScene: React.FC<{durationInFrames:number}> = ({durationInFrames}) => {
  const frame = useSceneFrame(105,durationInFrames,78);
  const phrase = 'Нужно такси?\nТогда вы по адресу';
  const typed = phrase.slice(0, Math.floor(interpolate(frame, [4, 43], [0, phrase.length], clamp)));
  const draw = interpolate(frame, [5, 54], [0, 1], {...clamp, easing: ease});
  const pressed = interpolate(frame,[51,57,64],[1,.91,1],{...clamp,easing:ease});
  const exitScale = interpolate(frame,[78,104],[1,18],{...clamp,easing:Easing.in(Easing.cubic)});
  return <AbsoluteFill style={{background:C.canvas,color:C.ink,fontFamily:FONT,overflow:'hidden'}}>
    <div style={{position:'absolute',left:66,top:92,fontSize:34,fontWeight:800,letterSpacing:2,color:C.ink2}}>ТАКСИ · ГРАХОВО</div>
    <div style={{position:'absolute',left:66,right:66,top:250,fontSize:112,lineHeight:.98,fontWeight:900,letterSpacing:-6,whiteSpace:'pre-line'}}>
      {typed}<span style={{display:'inline-block',width:8,height:96,background:C.brand,marginLeft:10,translate:`0 ${interpolate(frame,[0,75],[4,-4],clamp)}px`,opacity:frame<47?1:0}} />
    </div>
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0}}>
      <path d="M100 1260 C250 1040 350 1200 500 980 C650 760 760 900 985 650" fill="none" stroke="#DDDCD6" strokeWidth="34" strokeLinecap="round" />
      <path d="M100 1260 C250 1040 350 1200 500 980 C650 760 760 900 985 650" fill="none" stroke={C.ink} strokeWidth="17" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-draw} />
    </svg>
    <div style={{position:'absolute',left:69,top:1218,scale:spring({frame:frame-5,fps:30,config:{damping:13,stiffness:160}})}}><Pin color={C.success} size={62}/></div>
    <div style={{position:'absolute',right:62,top:600,scale:spring({frame:frame-38,fps:30,config:{damping:13,stiffness:160}})}}><Pin color={C.brand} size={62}/></div>
    <div style={{position:'absolute',left:66,right:66,bottom:130,height:158,borderRadius:52,background:C.brand,display:'grid',placeItems:'center',fontSize:48,fontWeight:900,boxShadow:'0 28px 60px #9A82003C',scale:pressed*exitScale,zIndex:4,...lift(frame,35,35)}}><span style={{opacity:interpolate(frame,[70,79],[1,0],clamp)}}>Начать</span></div>
    <div style={{position:'absolute',right:170,bottom:170,width:54,height:54,borderRadius:99,background:C.ink,scale:interpolate(frame,[47,54,60],[0,1,.72],{...clamp,easing:ease}),opacity:interpolate(frame,[47,52,65,72],[0,1,1,0],clamp),boxShadow:'0 12px 22px #0004'}} />
  </AbsoluteFill>;
};

const RouteField: React.FC<{frame:number;delay:number;label:string;value:string;color:string}> = ({frame,delay,label,value,color}) => (
  <div style={{height:168,borderRadius:46,background:C.surface,display:'flex',alignItems:'center',gap:28,padding:'0 38px',boxShadow:'0 24px 60px #19191912',...lift(frame,delay,45)}}>
    <Dot color={color} size={26}/><div><div style={{fontSize:30,color:C.ink2,fontWeight:650}}>{label}</div><div style={{fontSize:43,lineHeight:1.05,fontWeight:800,letterSpacing:-1.6,marginTop:7}}>{value}</div></div>
  </div>
);

const OrderScene: React.FC<{durationInFrames:number}> = ({durationInFrames}) => {
  const frame = useSceneFrame(105,durationInFrames,82);
  const panelScale=spring({frame,fps:30,config:{damping:14,stiffness:150,mass:.75}});
  const buttonWidth=interpolate(frame,[53,70],[112,816],{...clamp,easing:ease});
  const exitScale=interpolate(frame,[84,104],[1,16],{...clamp,easing:Easing.in(Easing.cubic)});
  return <AbsoluteFill style={{background:C.brand,color:C.ink,fontFamily:FONT,overflow:'hidden'}}>
    <div style={{position:'absolute',left:54,right:54,top:116,bottom:116,borderRadius:72,background:C.canvas,boxShadow:'0 38px 100px #6F5E0038',scale:interpolate(panelScale,[0,1],[.08,1]),transformOrigin:'50% 78%',overflow:'hidden'}}>
      <div style={{padding:'84px 58px'}}>
        <div style={{fontSize:34,fontWeight:800,color:C.ink2,letterSpacing:1.4,clipPath:`inset(0 ${100-interpolate(frame,[10,24],[0,100],clamp)}% 0 0)`}}>МАРШРУТ ПОЕЗДКИ</div>
        <div style={{fontSize:86,lineHeight:.98,fontWeight:900,letterSpacing:-5,marginTop:18,...lift(frame,12,38)}}>Куда<br/>поедем?</div>
        <div style={{position:'relative',display:'grid',gap:24,marginTop:76}}>
          <div style={{position:'absolute',left:51,top:90,height:200,borderLeft:`7px dashed ${C.brand}`,opacity:interpolate(frame,[27,47],[0,1],clamp)}}/>
          <RouteField frame={frame} delay={22} label="Откуда" value="Пятёрочка" color={C.success}/>
          <RouteField frame={frame} delay={34} label="Куда" value="Граховская средняя школа" color={C.ink}/>
        </div>
        <div style={{fontSize:34,lineHeight:1.2,fontWeight:720,color:C.ink2,marginTop:54,opacity:interpolate(frame,[42,55],[0,1],clamp)}}>Проверьте адрес и закажите машину</div>
      </div>
      <div style={{position:'absolute',left:'50%',bottom:74,translate:'-50% 0',width:buttonWidth,height:136,borderRadius:46,background:C.ink,color:C.surface,display:'grid',placeItems:'center',fontSize:44,fontWeight:900,boxShadow:'0 24px 58px #18181835',scale:interpolate(frame,[68,73,79],[1,.93,1],clamp)}}>
        <span style={{opacity:interpolate(frame,[56,66],[0,1],clamp)}}>{buttonWidth<350?'→':'Заказать'}</span>
      </div>
    </div>
    <div style={{position:'absolute',left:'50%',bottom:185,width:136,height:136,borderRadius:46,background:C.brand,translate:'-50% 0',scale:exitScale,opacity:interpolate(frame,[82,87],[0,1],clamp),zIndex:5}}/>
  </AbsoluteFill>;
};

const DriverScene: React.FC<{durationInFrames:number}> = ({durationInFrames}) => {
  const frame = useSceneFrame(120,durationInFrames,101);
  const accepted = frame > 47;
  const cardY = interpolate(frame,[0,16,52,72],[380,0,0,-410],{...clamp,easing:ease});
  const mapWipe=interpolate(frame,[101,119],[0,1450],{...clamp,easing:Easing.in(Easing.cubic)});
  return <AbsoluteFill style={{background:C.brand,color:C.ink,fontFamily:FONT,overflow:'hidden'}}>
    <div style={{position:'absolute',left:76,right:76,top:210,textAlign:'center',opacity:interpolate(frame,[0,9,55,67],[0,1,1,0],clamp)}}>
      <div style={{fontSize:38,fontWeight:750}}>ПОИСК МАШИНЫ</div>
      <div style={{fontSize:92,fontWeight:900,letterSpacing:-5,marginTop:16}}>{accepted?'Дмитрий едет':'Водитель найден'}</div>
    </div>
    <div style={{position:'absolute',left:66,right:66,top:570,height:520,borderRadius:64,background:C.ink,color:C.surface,padding:'54px 48px',translate:`0 ${cardY}px`,scale:interpolate(frame,[0,18],[.76,1],{...clamp,easing:ease}),boxShadow:'0 34px 90px #55490055'}}>
      <div style={{display:'flex',alignItems:'center',gap:23,fontSize:35,fontWeight:700}}><Dot color={C.success}/><span>Пятёрочка</span></div>
      <div style={{height:72,borderLeft:'5px dashed #5E5E59',marginLeft:9}} />
      <div style={{display:'flex',alignItems:'center',gap:23,fontSize:35,fontWeight:700}}><Dot color={C.brand}/><span>Граховская средняя школа</span></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',marginTop:55}}>
        <div><div style={{fontSize:28,color:'#A8A8A1'}}>ПОЕЗДКА</div><div style={{fontSize:70,fontWeight:900,marginTop:6}}>150 ₽</div></div>
        <div style={{width:270,height:108,borderRadius:36,background:accepted?C.success:C.brand,color:accepted?C.surface:C.ink,display:'grid',placeItems:'center',fontSize:35,fontWeight:900,scale:interpolate(frame,[35,43,48],[1,.92,1],clamp)}}>{accepted?'Назначен ✓':'Подбираем…'}</div>
      </div>
    </div>
    <div style={{position:'absolute',left:66,right:66,bottom:125,height:500,borderRadius:64,background:C.surface,padding:'44px 42px',translate:`0 ${interpolate(frame,[56,79],[610,0],{...clamp,easing:ease})}px`,boxShadow:'0 30px 80px #55490033'}}>
      <div style={{fontSize:30,color:C.ink2,fontWeight:700}}>ВАШ ВОДИТЕЛЬ</div>
      <div style={{fontSize:82,fontWeight:900,letterSpacing:-4,marginTop:12}}>Дмитрий <span style={{fontSize:46}}>★ 5.0</span></div>
      <div style={{fontSize:39,fontWeight:750,marginTop:8}}>Lada Vesta · <b>А123АА18</b></div>
      <Img src={staticFile('images/taxi-car-white-vesta.png')} style={{position:'absolute',width:610,right:-28,bottom:-32,filter:'drop-shadow(0 28px 24px #0003)'}}/>
    </div>
    <div style={{position:'absolute',left:540,top:1040,width:mapWipe,height:mapWipe,borderRadius:999,background:'#EEEDE8',translate:'-50% -50%',zIndex:8}}/>
  </AbsoluteFill>;
};

const MapScene: React.FC<{durationInFrames:number}> = ({durationInFrames}) => {
  const frame=useSceneFrame(165,durationInFrames,142);
  const route=interpolate(frame,[13,154],[0,1],{...clamp,easing:Easing.inOut(Easing.cubic)});
  const eta=Math.max(1,4-Math.floor(interpolate(frame,[15,100],[0,3],clamp)));
  const x=160+route*770;
  const y=1325-680*route+Math.sin(route*Math.PI)*190;
  const ratingWipe=interpolate(frame,[142,164],[0,1500],{...clamp,easing:Easing.in(Easing.cubic)});
  return <AbsoluteFill style={{background:'#EEEDE8',fontFamily:FONT,color:C.ink,overflow:'hidden',scale:interpolate(frame,[0,20],[1.08,1],{...clamp,easing:ease})}}>
    {[[-120,220,720,280,8],[520,-80,700,340,-12],[-190,1320,690,320,-9],[550,1230,720,370,11],[80,660,330,500,-17],[690,540,310,520,15]].map((b,i)=><div key={i} style={{position:'absolute',left:b[0],top:b[1]+interpolate(frame,[0,195],[0,(i%2?35:-35)],clamp),width:b[2],height:b[3],borderRadius:70,background:i%3===0?'#E0DFD8':'#F9F8F4',rotate:`${b[4]}deg`}}/>)}
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0}}>
      <path d="M160 1325 C300 1040 500 1160 610 910 C700 700 760 690 930 645" fill="none" stroke="#D0CFC8" strokeWidth="34" strokeLinecap="round"/>
      <path d="M160 1325 C300 1040 500 1160 610 910 C700 700 760 690 930 645" fill="none" stroke={C.ink} strokeWidth="18" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-route}/>
    </svg>
    <div style={{position:'absolute',left:72,top:94,fontSize:78,fontWeight:900,letterSpacing:-4,...lift(frame,0)}}>{frame<104?'Машина едет':'В пути'}</div>
    <div style={{position:'absolute',left:72,top:205,height:112,borderRadius:38,background:C.ink,color:C.surface,padding:'0 34px',display:'flex',alignItems:'center',gap:20,fontSize:38,fontWeight:800,...lift(frame,7,30)}}><span style={{color:C.brand,fontSize:48}}>●</span>{frame<104?`${eta} мин до вас`:'Едем в школу'}</div>
    <div style={{position:'absolute',left:112,top:1280}}><Pin color={C.success} size={66}/></div>
    <div style={{position:'absolute',left:890,top:592}}><Pin color={C.brand} size={66}/></div>
    <div style={{position:'absolute',left:x-125,top:y-72,width:250,height:130,rotate:`${-8+Math.sin(route*Math.PI*4)*3}deg`,filter:'drop-shadow(0 20px 18px #0004)'}}><Img src={staticFile('images/taxi-car-white-vesta.png')} style={{width:'100%'}}/></div>
    <div style={{position:'absolute',left:66,right:66,bottom:90,height:190,borderRadius:54,background:C.surface,boxShadow:'0 28px 70px #0002',display:'flex',alignItems:'center',gap:32,padding:'0 38px',...lift(frame,26,50)}}>
      <div style={{width:92,height:92,borderRadius:30,background:C.brand,display:'grid',placeItems:'center',fontSize:43,fontWeight:900}}>Д</div>
      <div><div style={{fontSize:41,fontWeight:900}}>Дмитрий · 5.0 ★</div><div style={{fontSize:31,color:C.ink2,fontWeight:650,marginTop:6}}>Белая Lada Vesta · А123АА18</div></div>
    </div>
    <div style={{position:'absolute',left:540,top:960,width:ratingWipe,height:ratingWipe,borderRadius:999,background:C.ink,translate:'-50% -50%',zIndex:10}}/>
  </AbsoluteFill>;
};

const reviews=[
  {name:'Анна',text:'Приехал быстро',tone:'#F0E9FF'},
  {name:'Мария',text:'Всё отлично!',tone:C.surface},
  {name:'Сергей',text:'Чисто и аккуратно',tone:'#E3F6EB'},
];

const RatingScene: React.FC<{durationInFrames:number}>=({durationInFrames})=>{
  const frame=useSceneFrame(150,durationInFrames,128);
  const carousel=interpolate(frame,[67,124],[0,2],{...clamp,easing:Easing.inOut(Easing.cubic)});
  const outroWipe=interpolate(frame,[128,149],[0,1500],{...clamp,easing:Easing.in(Easing.cubic)});
  return <AbsoluteFill style={{background:C.ink,color:C.surface,fontFamily:FONT,overflow:'hidden'}}>
    <div style={{position:'absolute',top:128,left:66,right:66,textAlign:'center'}}>
      <div style={{fontSize:40,color:'#B4B4AD',fontWeight:700,...lift(frame,0)}}>ПОЕЗДКА ЗАВЕРШЕНА</div>
      <div style={{fontSize:84,fontWeight:900,letterSpacing:-4,marginTop:15,...lift(frame,6)}}>Как вам поездка?</div>
    </div>
    <div style={{position:'absolute',top:430,left:0,right:0,display:'flex',justifyContent:'center',gap:16}}>
      {[0,1,2,3,4].map(i=><div key={i} style={{fontSize:116,color:C.brand,scale:spring({frame:frame-18-i*6,fps:30,config:{damping:10,stiffness:210}}),rotate:`${interpolate(frame,[18+i*6,30+i*6],[-25,0],clamp)}deg`,filter:'drop-shadow(0 18px 25px #0006)'}}>★</div>)}
    </div>
    <div style={{position:'absolute',top:730,left:0,right:0,height:620}}>
      {reviews.map((r,i)=>{
        const d=i-carousel;
        const x=540+d*700;
        const scale=Math.max(.72,1-Math.abs(d)*.2);
        return <div key={r.name} style={{position:'absolute',left:x-340,top:70+Math.abs(d)*62,width:680,height:430,borderRadius:66,background:r.tone,color:C.ink,padding:'50px 48px',scale,rotate:`${d*5}deg`,opacity:Math.max(.25,1-Math.abs(d)*.34),boxShadow:'0 35px 100px #0008'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:34,fontWeight:800}}><span>{r.name}</span><span style={{color:'#D0AE00'}}>★★★★★</span></div>
          <div style={{fontSize:70,lineHeight:1.03,fontWeight:900,letterSpacing:-3,marginTop:64}}>{r.text}</div>
          <div style={{fontSize:31,color:C.ink2,fontWeight:650,marginTop:34}}>Дмитрий · Lada Vesta</div>
        </div>})}
    </div>
    <div style={{position:'absolute',bottom:120,left:0,right:0,textAlign:'center',fontSize:38,fontWeight:750,color:'#B4B4AD',opacity:interpolate(frame,[45,59],[0,1],clamp)}}>Спасибо, Дмитрий!</div>
    <div style={{position:'absolute',left:540,top:960,width:outroWipe,height:outroWipe,borderRadius:999,background:C.canvas,translate:'-50% -50%',zIndex:12}}/>
  </AbsoluteFill>;
};

const OutroScene:React.FC<{durationInFrames:number}>=({durationInFrames})=>{
  const frame=useSceneFrame(150,durationInFrames);
  const routeDraw=interpolate(frame,[5,74],[0,1],{...clamp,easing:ease});
  return <AbsoluteFill style={{background:C.canvas,color:C.ink,fontFamily:FONT,overflow:'hidden',display:'flex',alignItems:'center',flexDirection:'column'}}>
    <div style={{position:'absolute',left:0,top:0,bottom:0,width:26,background:C.brand}}/>
    <div style={{position:'absolute',right:0,top:0,bottom:0,width:26,background:C.brand}}/>
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0,opacity:.34}}>
      <path d="M-70 1510 C210 1260 220 1530 505 1290 C735 1095 850 1245 1160 920" fill="none" stroke="#D7D6D0" strokeWidth="28" strokeLinecap="round"/>
      <path d="M-70 1510 C210 1260 220 1530 505 1290 C735 1095 850 1245 1160 920" fill="none" stroke={C.brand} strokeWidth="12" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-routeDraw}/>
    </svg>
    <div style={{width:250,height:250,borderRadius:64,overflow:'hidden',marginTop:206,position:'relative',scale:spring({frame:frame-2,fps:30,config:{damping:12,stiffness:150}}),boxShadow:'0 30px 65px #18181820'}}>
      <Img src={staticFile('brand/icon.png')} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
    </div>
    <div style={{fontSize:100,lineHeight:.96,fontWeight:950,letterSpacing:-6,textAlign:'center',marginTop:58,position:'relative',...lift(frame,14,50)}}>Заказать такси</div>
    <div style={{height:120,borderRadius:40,background:C.brand,padding:'0 42px',display:'grid',placeItems:'center',fontSize:76,lineHeight:1,fontWeight:950,letterSpacing:-4,marginTop:24,position:'relative',boxShadow:'0 18px 38px #9A820028',...lift(frame,22,36)}}>просто</div>
    <div style={{width:918,borderRadius:52,background:C.surface,padding:'42px 42px 40px',marginTop:76,position:'relative',boxShadow:'0 28px 80px #18181814',...lift(frame,37,42)}}>
      <div style={{fontSize:28,color:C.ink2,fontWeight:800,letterSpacing:1.6,marginBottom:26}}>СКАЧАТЬ ПРИЛОЖЕНИЕ</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:24}}>
        <Img src={staticFile('store/google-play-ru.png')} style={{width:426,height:165,objectFit:'contain'}}/>
        <Img src={staticFile('store/rustore-ru.svg')} style={{width:407,height:147,objectFit:'contain'}}/>
      </div>
    </div>
    <div style={{width:918,textAlign:'center',color:C.ink,fontSize:46,fontWeight:850,letterSpacing:-1,position:'relative',marginTop:38,...lift(frame,48,24)}}>taxigr.ru</div>
  </AbsoluteFill>;
};

export const FAST_SHOTS={hook:{from:0,duration:135},order:{from:135,duration:81},driver:{from:216,duration:132},map:{from:348,duration:240},rating:{from:588,duration:200},outro:{from:788,duration:105}} as const;

export const TaxiGrahovoFastPortrait:React.FC<{bgm?:boolean;voiceover?:boolean}>=({bgm=true,voiceover=true})=>{
  return <AbsoluteFill style={{background:C.ink}}>
    <Sequence from={FAST_SHOTS.hook.from} durationInFrames={FAST_SHOTS.hook.duration}><HookScene durationInFrames={FAST_SHOTS.hook.duration}/></Sequence>
    <Sequence from={FAST_SHOTS.order.from} durationInFrames={FAST_SHOTS.order.duration}><OrderScene durationInFrames={FAST_SHOTS.order.duration}/></Sequence>
    <Sequence from={FAST_SHOTS.driver.from} durationInFrames={FAST_SHOTS.driver.duration}><DriverScene durationInFrames={FAST_SHOTS.driver.duration}/></Sequence>
    <Sequence from={FAST_SHOTS.map.from} durationInFrames={FAST_SHOTS.map.duration}><MapScene durationInFrames={FAST_SHOTS.map.duration}/></Sequence>
    <Sequence from={FAST_SHOTS.rating.from} durationInFrames={FAST_SHOTS.rating.duration}><RatingScene durationInFrames={FAST_SHOTS.rating.duration}/></Sequence>
    <Sequence from={FAST_SHOTS.outro.from} durationInFrames={FAST_SHOTS.outro.duration}><OutroScene durationInFrames={FAST_SHOTS.outro.duration}/></Sequence>
    <Audio src={staticFile('audio/user/taxi-grahovo-voice.mp3')} volume={1}/>
  </AbsoluteFill>;
};

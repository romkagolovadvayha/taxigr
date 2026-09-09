import React, {useEffect, useState} from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Img, Sequence, continueRender, delayRender, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const P = {yellow:'#F6C945', ink:'#25231E', night:'#171915', cream:'#F7F4EB', muted:'#807C70', green:'#7AD6A0'};
const FONT = 'TaxiManrope, sans-serif';
const clamp = {extrapolateLeft:'clamp', extrapolateRight:'clamp'} as const;
const ease = Easing.bezier(.16,1,.3,1);
const lerp = (f:number, a:number, b:number, x:number, y:number) => interpolate(f,[a,b],[x,y],{...clamp,easing:ease});
const linear = (f:number, a:number, b:number, x=0, y=1) => interpolate(f,[a,b],[x,y],clamp);
const pop = (f:number, delay=0) => spring({frame:f-delay,fps:30,config:{damping:19,stiffness:155,mass:.85}});
const useTime = () => {const f=useCurrentFrame();const {fps}=useVideoConfig();return f*30/fps;};
const reveal = (f:number,delay=0,distance=60):React.CSSProperties => ({opacity:linear(f,delay,delay+12),transform:`translateY(${lerp(f,delay,delay+24,distance,0)}px)`});

const Brand:React.FC<{dark?:boolean;label?:string}> = ({dark=false,label='ТАКСИ ГРАХОВО'}) => <div style={{position:'absolute',left:84,top:132,display:'flex',alignItems:'center',gap:20,color:dark?P.cream:P.ink,zIndex:4}}>
  <Img src={staticFile('signature/logo.svg')} style={{width:54,height:54}}/><span style={{fontSize:27,fontWeight:800,letterSpacing:2}}>{label}</span>
</div>;

const Title:React.FC<{f:number;lines:string[];top?:number;size?:number;dark?:boolean;accent?:number;delay?:number}> = ({f,lines,top=260,size=100,dark=false,accent=-1,delay=0}) => <div style={{position:'absolute',left:80,right:70,top,fontSize:size,fontWeight:800,letterSpacing:-5,lineHeight:1.06,zIndex:3}}>{lines.map((line,i)=><div key={line} style={{overflow:'hidden',paddingBottom:9}}><div style={{color:i===accent?P.yellow:dark?P.cream:P.ink,transform:`translateY(${lerp(f,delay+i*6,delay+i*6+24,135,0)}%) rotate(${lerp(f,delay+i*6,delay+i*6+24,4,0)}deg)`,transformOrigin:'0 100%'}}>{line}</div></div>)}</div>;

const Arrow:React.FC<{size?:number}> = ({size=42}) => <svg width={size} height={size} viewBox="0 0 32 32" fill="none"><path d="M6 16h20M17 7l9 9-9 9" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const Check:React.FC<{size?:number}> = ({size=40}) => <svg width={size} height={size} viewBox="0 0 32 32" fill="none"><path d="m7 16 6 6 13-13" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const Pin:React.FC<{size?:number;color?:string;inner?:string}> = ({size=78,color=P.ink,inner=P.yellow}) => <svg width={size} height={size*1.22} viewBox="0 0 64 78" fill="none"><path d="M32 2C15 2 3 14 3 30c0 22 29 45 29 45s29-23 29-45C61 14 49 2 32 2Z" fill={color}/><circle cx="32" cy="29" r="10" fill={inner}/></svg>;
const Star:React.FC<{size:number;fill?:string}> = ({size,fill=P.yellow}) => <svg width={size} height={size} viewBox="0 0 100 100"><path d="m50 5 13.8 28 31 4.5L72.4 59.3 77.7 90 50 75.5 22.3 90l5.3-30.7L5.2 37.5l31-4.5Z" fill={fill} stroke={fill} strokeWidth="5" strokeLinejoin="round"/></svg>;

const RouteRibbon:React.FC<{f:number;dark?:boolean;opacity?:number}> = ({f,dark=false,opacity=1}) => <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0,opacity,transform:`translateY(${Math.sin(f/70)*16}px)`}}>
  <defs><linearGradient id={dark?'ribbon-dark':'ribbon-light'} x1="0" y1="0" x2="1" y2="1"><stop stopColor={dark?'#574719':'#E8D6A1'}/><stop offset=".45" stopColor={P.yellow}/><stop offset="1" stopColor={dark?'#B99023':'#FFF5C3'}/></linearGradient></defs>
  <path d="M-240 1820C840 1970 1430 930 610 1020S-150 530 1260 595" fill="none" stroke={dark?'#35362D':'#E9E3D2'} strokeWidth="110"/>
  <path d="M-240 1820C840 1970 1430 930 610 1020S-150 530 1260 595" fill="none" stroke={`url(#${dark?'ribbon-dark':'ribbon-light'})`} strokeWidth="75" pathLength="1" strokeDasharray="1" strokeDashoffset={1-linear(f,5,105)} strokeLinecap="round"/>
  <path d="M-240 1820C840 1970 1430 930 610 1020S-150 530 1260 595" fill="none" stroke={dark?'#FFE69C':'#FFF9E6'} strokeWidth="3" pathLength="1" strokeDasharray=".01 .021" strokeDashoffset={-f*.0007}/>
</svg>;

const Phone:React.FC<{f:number;children?:React.ReactNode;style?:React.CSSProperties}> = ({f,children,style}) => <div style={{position:'absolute',width:558,height:1226,borderRadius:80,padding:15,background:'linear-gradient(125deg,#E6E5DA 0%,#343831 5%,#080A08 48%,#7F8479 91%,#E4E5D8)',boxShadow:'18px 28px 0 #080B09,30px 55px 65px #0005,inset 0 0 0 2px #D7D9CB',transformStyle:'preserve-3d',...style}}>
  <div style={{position:'absolute',right:-17,top:260,width:8,height:96,borderRadius:8,background:'#A4A99D'}}/>
  <div style={{position:'absolute',left:-6,top:230,width:5,height:72,borderRadius:5,background:'#7A8075'}}/>
  <div style={{height:'100%',borderRadius:66,overflow:'hidden',position:'relative',background:'white',transform:'translateZ(2px)'}}>
    <div style={{height:55,position:'relative',background:'white',display:'flex',alignItems:'center',padding:'0 30px',fontSize:18,fontWeight:800,color:P.ink}}><span>9:41</span><span style={{marginLeft:'auto',letterSpacing:2}}>▰ ▰</span></div>
    {children??<Img src={staticFile('signature/app-home.webp')} style={{display:'block',width:'100%',height:1144,objectFit:'cover',objectPosition:'top'}}/>}
    <div style={{position:'absolute',top:17,left:240,width:18,height:18,borderRadius:18,background:'#111710',boxShadow:'inset 0 0 0 5px #232B25'}}/>
    <div style={{position:'absolute',bottom:12,left:'34%',width:'32%',height:5,borderRadius:5,background:'#25231E'}}/>
  </div>
  <div style={{position:'absolute',inset:0,borderRadius:80,pointerEvents:'none',background:`linear-gradient(${115+Math.sin(f/90)*5}deg,transparent 12%,#FFF0 40%,#FFFFFF15 48%,transparent 60%)`,transform:'translateZ(3px)'}}/>
</div>;

const Hook:React.FC = () => {
  const f=useTime();
  return <AbsoluteFill style={{background:P.night,overflow:'hidden',perspective:1700}}>
    <div style={{position:'absolute',width:1200,height:1200,left:80,top:540,background:'radial-gradient(ellipse,#6A55272D,transparent 66%)'}}/>
    <RouteRibbon f={f} dark opacity={.58}/><Brand dark/>
    <Title f={f} lines={['Свои дороги.','Своё такси.']} dark accent={1} size={110}/>
    <div style={{position:'absolute',left:88,top:530,color:'#C5C6B8',fontSize:34,...reveal(f,22)}}>Грахово и район. Уже рядом.</div>
    <Phone f={f} style={{left:250,top:665,transform:`translateY(${lerp(f,10,48,600,0)+Math.sin(f/32)*8}px) rotateX(${lerp(f,8,75,18,6)}deg) rotateY(${lerp(f,8,90,-22,9)}deg) rotateZ(${lerp(f,8,90,8,-7)}deg) scale(${lerp(f,8,40,.68,.84)})`,transformOrigin:'50% 20%'}}/>
    <div style={{position:'absolute',left:95,top:1110,width:398,padding:'28px 30px',borderRadius:28,background:P.yellow,boxShadow:'0 24px 60px #0005',transform:`translateY(${lerp(f,50,78,100,0)+Math.sin(f/20)*6}px) rotate(-6deg)`,opacity:linear(f,50,64)}}><div style={{fontSize:23,fontWeight:700,color:'#665421'}}>ОДНО КАСАНИЕ</div><div style={{fontSize:37,fontWeight:800,letterSpacing:-1,marginTop:6}}>Куда поедем? <span style={{float:'right'}}>↗</span></div></div>
    <div style={{position:'absolute',right:116,top:1530,padding:'20px 30px',borderRadius:30,background:'#F7F4EB',color:P.ink,display:'flex',alignItems:'center',gap:16,boxShadow:'0 20px 50px #0005',...reveal(f,72,80)}}><span style={{width:12,height:12,borderRadius:10,background:'#629778'}}/><span style={{fontSize:29,fontWeight:750}}>Такси рядом</span></div>
  </AbsoluteFill>;
};

const Address:React.FC<{f:number;delay:number;label:string;value:string;destination?:boolean}> = ({f,delay,label,value,destination}) => <div style={{display:'flex',alignItems:'center',gap:26,height:144,...reveal(f,delay,24)}}><div style={{width:22,height:22,borderRadius:destination?7:30,border:destination?'none':`6px solid ${P.yellow}`,background:destination?P.yellow:'transparent',flexShrink:0}}/><div style={{minWidth:0}}><div style={{fontSize:25,color:P.muted,marginBottom:5}}>{label}</div><div style={{fontSize:37,fontWeight:750,letterSpacing:-1,whiteSpace:'nowrap'}}>{value}</div></div><span style={{marginLeft:'auto',fontSize:44,color:'#A19C8F'}}>›</span></div>;

const Order:React.FC = () => {
  const f=useTime();const pressed=interpolate(f,[60,65,71],[1,.95,1],clamp);
  return <AbsoluteFill style={{background:P.cream,overflow:'hidden',perspective:1600}}>
    <Brand/><Title f={f} lines={['Два адреса.','И можно ехать.']} size={102} top={270}/>
    <div style={{position:'absolute',right:-330,top:980,width:1100,height:1100,borderRadius:1100,border:'100px solid #EFE2B1',transform:`translateX(${lerp(f,0,80,130,-20)}px)`}}/>
    <div style={{position:'absolute',left:80,top:650,width:920,background:'white',borderRadius:54,padding:'36px 42px 42px',boxShadow:'0 45px 95px #4B421A1B,0 3px 0 #DED8C8',transform:`translateY(${lerp(f,0,22,180,0)}px) rotateX(${lerp(f,0,32,12,0)}deg) rotateZ(${lerp(f,0,32,-4,0)}deg)`}}>
      <Address f={f} delay={4} label="Откуда" value="Пятёрочка"/><div style={{height:2,background:'#EAE6D8',marginLeft:48}}/><Address f={f} delay={13} label="Куда" value="Граховская средняя школа" destination/>
      <div style={{display:'flex',gap:16,background:'#F1EDDF',padding:10,borderRadius:33,marginTop:26,...reveal(f,22,30)}}>{[{name:'Эконом',sub:'На каждый день',image:'economy-car.png'},{name:'Детский',sub:'С креслом',image:'child-seat.png'}].map((t,i)=><div key={t.name} style={{width:'50%',height:154,display:'flex',alignItems:'center',gap:14,borderRadius:26,background:i===0?'white':'transparent',padding:14,boxShadow:i===0?'0 5px 18px #43310009':'none'}}><Img src={staticFile(`signature/${t.image}`)} style={{width:105,height:98,objectFit:'contain',mixBlendMode:'multiply'}}/><div><div style={{fontSize:32,fontWeight:800}}>{t.name}</div><div style={{fontSize:22,color:P.muted,marginTop:5}}>{t.sub}</div></div>{i===0?<span style={{marginLeft:'auto',color:'#8C6911'}}><Check size={26}/></span>:null}</div>)}</div>
      <div style={{marginTop:36,height:132,background:P.yellow,borderRadius:32,display:'flex',alignItems:'center',justifyContent:'center',gap:50,fontSize:40,fontWeight:800,transform:`scale(${pressed})`,opacity:linear(f,27,40)}}>Заказать <Arrow size={48}/></div>
    </div>
    <div style={{position:'absolute',left:120,right:120,top:1450,textAlign:'center',fontSize:29,color:P.muted,...reveal(f,34)}}>Маршрут, тариф и стоимость — перед заказом.</div>
    <div style={{position:'absolute',left:736,top:1270,width:72,height:72,borderRadius:72,border:`4px solid ${P.ink}`,opacity:interpolate(f,[57,62,70,79],[0,.7,.5,0],clamp),transform:`scale(${lerp(f,57,79,.5,1.6)})`}}/>
  </AbsoluteFill>;
};

const Plate:React.FC<{width?:number}> = ({width=435}) => <div style={{width,height:width*.245,border:'3px solid #252A28',borderRadius:12,background:'#FEFEFC',display:'flex',color:'#222B2B',boxShadow:'inset 0 0 0 3px white',fontFamily:FONT,overflow:'hidden',flexShrink:0}}><div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontSize:width*.104,fontWeight:800,letterSpacing:2,whiteSpace:'nowrap'}}>А<span style={{fontSize:width*.134}}>123</span>АА</div><div style={{width:'23%',borderLeft:'3px solid #252A28',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}><strong style={{fontSize:width*.105,lineHeight:1.06}}>18</strong><div style={{display:'flex',gap:6,alignItems:'center',marginTop:4,fontSize:width*.025}}>RUS<span style={{display:'block',width:width*.068,height:width*.043,border:'1px solid #AAA',background:'linear-gradient(#fff 0 33%,#285ABC 33% 66%,#DC494C 66%)'}}/></div></div></div>;

const Lens:React.FC<{f:number}> = ({f}) => <div style={{position:'absolute',left:lerp(f,45,83,720,640),top:lerp(f,45,83,870,1260)+Math.sin(f/17)*6,width:310,height:310,opacity:linear(f,45,58),transform:`scale(${pop(f,45)}) rotate(${lerp(f,45,92,-15,4)}deg)`,filter:'drop-shadow(0 24px 28px #42340A38)',zIndex:8}}>
  <div style={{position:'absolute',width:36,height:130,borderRadius:30,background:'linear-gradient(90deg,#766C49,#D8D1BB,#6F6547)',right:1,bottom:-71,transform:'rotate(-38deg)',transformOrigin:'top'}}/>
  <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'#FFFDF4',border:'10px solid #FFFFFF',overflow:'hidden',boxShadow:'inset 0 0 0 2px #D9D1B5,0 0 0 2px #D4C598'}}><div style={{position:'absolute',left:-40,top:89,transform:'rotate(-4deg)'}}><Plate width={415}/></div><div style={{position:'absolute',inset:0,background:'linear-gradient(130deg,#fff8,transparent 50%,#C9DEDD28)'}}/></div>
</div>;

const Driver:React.FC = () => {
  const f=useTime();
  return <AbsoluteFill style={{background:P.yellow,overflow:'hidden'}}>
    <div style={{position:'absolute',width:1350,height:1350,borderRadius:1400,border:'2px solid #FFF7D455',left:-200,top:580,transform:`scale(${1+f*.0007})`}}/><div style={{position:'absolute',width:1000,height:1000,borderRadius:1000,background:'radial-gradient(#FFECA0,transparent 68%)',left:50,top:590}}/>
    <Brand/><Title f={f} top={265} size={100} lines={['Узнаете сразу.','Уже едет к вам.']}/>
    <div style={{position:'absolute',left:86,top:540,display:'flex',alignItems:'center',gap:14,background:'#25231E',color:P.cream,padding:'17px 25px',borderRadius:28,fontSize:27,fontWeight:700,...reveal(f,10,25)}}><span style={{color:P.green}}><Check size={30}/></span>Водитель найден</div>
    <div style={{position:'absolute',left:10,top:760,width:1050,height:280,borderRadius:'50%',background:'#7D59002E',filter:'blur(35px)',transform:`translateX(${lerp(f,0,45,190,0)}px) scaleY(.3)`}}/>
    <Img src={staticFile('images/taxi-car-white-vesta.png')} style={{position:'absolute',left:40,top:700,width:1000,filter:'drop-shadow(0 24px 18px #6C4B0026)',transform:`translateX(${lerp(f,0,35,650,0)}px) translateY(${Math.sin(f/28)*5}px) rotate(${lerp(f,0,35,-6,-2)}deg) scale(${lerp(f,0,50,.83,1)})`}}/>
    <div style={{position:'absolute',left:80,top:1200,width:920,height:382,borderRadius:46,background:P.cream,padding:'37px 40px',boxShadow:'0 30px 60px #7D590025',...reveal(f,19,150)}}>
      <div style={{display:'flex',alignItems:'center',gap:24}}><div style={{width:88,height:88,borderRadius:88,background:'#EEE1AC',display:'grid',placeItems:'center',fontSize:38}}>Д</div><div><div style={{fontSize:53,fontWeight:800,letterSpacing:-2}}>Дмитрий <span style={{fontSize:28,fontWeight:700,marginLeft:18}}>★ 5,0</span></div><div style={{fontSize:27,color:P.muted}}>Белый седан</div></div></div>
      <div style={{marginTop:35}}><Plate/></div><div style={{display:'flex',gap:16,marginTop:27}}>{['Позвонить','Написать'].map((label,i)=><div key={label} style={{fontSize:24,fontWeight:700,padding:'12px 22px',borderRadius:19,background:i?'#EAE6D9':'#F5E4A4'}}>{label}</div>)}</div>
    </div>
    <Lens f={f}/><div style={{position:'absolute',left:86,top:1660,fontSize:25,color:'#76601E',...reveal(f,78,15)}}>Водитель, машина и номер — у вас под рукой.</div>
  </AbsoluteFill>;
};

const routePoints = [
  [120,865,160,840,255,735,280,700],
  [280,700,350,610,555,684,620,530],
  [620,530,676,396,803,454,850,260],
];
const pointAt = (progress:number) => {
  const scaled=Math.max(0,Math.min(.99999,progress))*routePoints.length;const index=Math.floor(scaled);const t=scaled-index;const s=1-t;const [x0,y0,x1,y1,x2,y2,x3,y3]=routePoints[index];
  const x=s*s*s*x0+3*s*s*t*x1+3*s*t*t*x2+t*t*t*x3;const y=s*s*s*y0+3*s*s*t*y1+3*s*t*t*y2+t*t*t*y3;
  const dx=3*s*s*(x1-x0)+6*s*t*(x2-x1)+3*t*t*(x3-x2);const dy=3*s*s*(y1-y0)+6*s*t*(y2-y1)+3*t*t*(y3-y2);
  return {x,y,angle:Math.atan2(dy,dx)*180/Math.PI};
};
const routeD = 'M120 865C160 840 255 735 280 700C350 610 555 684 620 530C676 396 803 454 850 260';
const blocks = [[20,30,310,230,-6],[400,50,225,295,4],[775,0,255,175,-3],[40,390,140,280,-7],[285,385,195,188,8],[515,746,355,230,-5],[790,530,240,160,5],[4,999,425,170,3],[968,797,200,300,-9]];

const MapBoard:React.FC<{f:number}> = ({f}) => {
  const progress=linear(f,18,210,.015,.995);const pos=pointAt(progress);
  return <div style={{width:1100,height:1190,position:'relative',background:'#EEEDE3',borderRadius:80,boxShadow:'0 8px 0 #CECCBA,0 18px 0 #B8B9A7,0 64px 80px #0003',overflow:'hidden',border:'3px solid #FFFDF0',transformStyle:'preserve-3d'}}>
    <svg width="1100" height="1190" viewBox="0 0 1100 1190" style={{position:'absolute',inset:0}}>
      <path d="M-50 360C310 290 360 1190 1170 1110" fill="none" stroke="#D5DDD1" strokeWidth="126"/>
      <path d="M-80 356C280 290 390 1190 1170 1110" fill="none" stroke="#DFE6DC" strokeWidth="88"/>
      {blocks.map(([x,y,w,h,r],i)=><g key={i} transform={`rotate(${r} ${x+w/2} ${y+h/2})`}><rect x={x+5} y={y+14} width={w} height={h} rx="35" fill="#C9C9B959"/><rect x={x} y={y} width={w} height={h} rx="35" fill={i%3===0?'#DDE4CE':'#FCFAF1'} stroke="#E8E5D7" strokeWidth="3"/>{i%3!==0?<><rect x={x+28} y={y+32} width={w*.55} height={h*.27} rx="12" fill="#E6E0D0"/><rect x={x+40} y={y+h*.58} width={w*.65} height={h*.23} rx="10" fill="#EAE6D9"/></>:<>{[0,1,2,3].map(n=><circle key={n} cx={x+38+(n%2)*80} cy={y+55+Math.floor(n/2)*72} r="21" fill="#BFCFAC"/>)}</>}</g>)}
      <path d={routeD} fill="none" stroke="white" strokeWidth="57" strokeLinecap="round"/><path d={routeD} fill="none" stroke="#D9D5C4" strokeWidth="31" strokeLinecap="round"/>
      <path d={routeD} fill="none" stroke={P.yellow} strokeWidth="31" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-progress}/>
      <path d={routeD} fill="none" stroke="#FFF1A8" strokeWidth="4" pathLength="1" strokeDasharray=".008 .018" strokeDashoffset={-f*.001}/>
      <text x="220" y="978" fontSize="27" fontWeight="750" fill="#9B998C">ГРАХОВО</text><text x="475" y="370" fontSize="22" fill="#969386" transform="rotate(-22 475 370)">Советская улица</text>
      <circle cx="120" cy="865" r="34" fill={P.ink} stroke="white" strokeWidth="9"/>
      <circle cx="850" cy="260" r={38+(Math.sin(f/9)+1)*10} fill="none" stroke={P.yellow} strokeWidth="2" opacity=".55"/>
      <circle cx="850" cy="260" r="29" fill={P.yellow} stroke="white" strokeWidth="9"/>
    </svg>
    <div style={{position:'absolute',left:66,top:764,filter:'drop-shadow(0 12px 5px #0002)'}}><Pin size={90}/></div>
    <div style={{position:'absolute',left:810,top:158,filter:'drop-shadow(0 12px 5px #0002)'}}><Pin size={80} color={P.yellow} inner={P.ink}/></div>
    <div style={{position:'absolute',left:pos.x-40,top:pos.y-74,width:80,height:148,transform:`rotate(${pos.angle+90}deg)`,filter:'drop-shadow(6px 15px 9px #25231E55)'}}><Img src={staticFile('signature/map-car.png')} style={{width:'100%',height:'100%',objectFit:'contain'}}/></div>
  </div>;
};

const Trip:React.FC = () => {
  const f=useTime();const stage=f<105?0:f<143?1:2;const messages=['Машина едет к вам','Водитель приехал','Вы в пути'];
  return <AbsoluteFill style={{background:P.cream,overflow:'hidden',perspective:1650}}>
    <Brand/><Title f={f} lines={['Всё на карте.','До самой точки.']} size={100}/>
    <div style={{position:'absolute',left:65,top:615,transform:`translateY(${lerp(f,0,25,200,0)}px) rotateX(${lerp(f,0,180,40,31)}deg) rotateZ(${lerp(f,0,235,-13,-3)}deg) scale(${lerp(f,0,235,.98,1.08)})`,transformOrigin:'50% 40%'}}><MapBoard f={f}/></div>
    <div style={{position:'absolute',right:84,top:605,width:190,height:150,borderRadius:34,background:P.ink,color:P.cream,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',boxShadow:'0 25px 50px #181D2130',...reveal(f,24,50)}}>{stage===0?<><strong style={{fontSize:68,lineHeight:1}}>{Math.max(1,4-Math.floor(f/29))}</strong><span style={{fontSize:23,marginTop:5}}>мин до вас</span></>:<span style={{color:P.yellow}}><Check size={70}/></span>}</div>
    <div style={{position:'absolute',left:100,right:100,top:1470,background:P.ink,color:P.cream,borderRadius:38,padding:'31px 35px',display:'flex',alignItems:'center',gap:24,boxShadow:'0 25px 55px #0002',...reveal(f,32,80)}}><div style={{width:64,height:64,borderRadius:22,background:P.yellow,color:P.ink,display:'grid',placeItems:'center'}}>{stage===2?<Arrow size={39}/>:<Pin size={30}/>}</div><div><div style={{fontSize:37,fontWeight:800,letterSpacing:-1}}>{messages[stage]}</div><div style={{fontSize:25,color:'#BEBEAF',marginTop:5}}>{stage===2?'К месту назначения':'Дмитрий · белый седан'}</div></div></div>
    <div style={{position:'absolute',left:100,top:1770,fontSize:24,color:P.muted,background:P.cream,padding:'9px 18px',borderRadius:18}}>Пример поездки</div>
  </AbsoluteFill>;
};

const Review:React.FC = () => {
  const f=useTime();const submitted=f>=119;const text='Спасибо за поездку!';
  const dismiss=lerp(f,128,153,0,1);
  return <AbsoluteFill style={{background:P.night,overflow:'hidden',perspective:1800}}>
    <div style={{position:'absolute',left:-210,top:510,width:1400,height:1400,background:'radial-gradient(ellipse,#66551B45,transparent 65%)'}}/>
    <Brand dark/><Title f={f} lines={['Приехали.','Как всё прошло?']} dark accent={0} size={101}/>
    <div style={{position:'absolute',left:105,top:686,display:'flex',gap:21,transform:`rotateX(${lerp(f,0,45,32,6)}deg) translateY(${Math.sin(f/38)*8}px)`}}>{[0,1,2,3,4].map(i=><div key={i} style={{width:154,height:170,transform:`scale(${pop(f,15+i*5)}) rotateY(${lerp(f,15+i*5,41+i*5,-70,0)}deg) translateY(${Math.sin(f/26+i)*5}px)`,filter:'drop-shadow(0 8px 0 #9B741B) drop-shadow(0 22px 20px #0008)'}}><Star size={154}/></div>)}</div>
    <div style={{position:'absolute',left:100,top:970,width:880,height:442,padding:'40px',borderRadius:46,background:P.cream,color:P.ink,boxShadow:'0 35px 75px #0005',opacity:1-dismiss,transform:`translateY(${lerp(f,38,64,250,0)-dismiss*40}px) scale(${1-dismiss*.22}) rotateZ(${lerp(f,38,70,5,0)}deg)`}}>
      <div style={{fontSize:25,color:P.muted}}>ВАШ ОТЗЫВ</div><div style={{fontSize:47,fontWeight:750,letterSpacing:-1.5,marginTop:40,height:105}}>{text.slice(0,Math.floor(linear(f,58,96)*text.length))}<span style={{display:'inline-block',width:3,height:44,background:P.yellow,marginLeft:5,opacity:f<105?1:0}}/></div>
      <div style={{height:104,borderRadius:27,background:submitted?P.yellow:P.ink,color:submitted?P.ink:P.cream,display:'flex',alignItems:'center',justifyContent:'center',gap:16,fontSize:31,fontWeight:800,marginTop:24,transform:`scale(${interpolate(f,[110,116,121],[1,.96,1],clamp)})`}}>{submitted?<><Check/>Отправлено</>:'Отправить отзыв'}</div>
    </div>
    <div style={{position:'absolute',left:100,right:100,top:1050,textAlign:'center',color:P.cream,opacity:linear(f,147,164),transform:`translateY(${lerp(f,143,175,70,0)}px)`}}><div style={{width:110,height:110,borderRadius:'50%',margin:'0 auto 28px',background:P.yellow,color:P.ink,display:'grid',placeItems:'center',transform:`scale(${pop(f,144)})`}}><Check size={62}/></div><div style={{fontSize:66,fontWeight:800,letterSpacing:-2}}>Спасибо.<br/>До новой встречи!</div></div>
    <div style={{position:'absolute',left:100,right:100,top:1580,textAlign:'center',fontSize:29,color:'#A9AB9D',...reveal(f,73,20)}}>Пять звёзд — и отзыв в одно движение.</div>
  </AbsoluteFill>;
};

const Close:React.FC = () => {
  const f=useTime();
  return <AbsoluteFill style={{background:P.cream,overflow:'hidden',perspective:1700}}>
    <RouteRibbon f={f} opacity={.33}/>
    <div style={{position:'absolute',left:80,right:80,top:160,fontSize:26,fontWeight:800,letterSpacing:3,textAlign:'center',color:P.muted,...reveal(f,4,20)}}>ГРАХОВО И РАЙОН</div>
    <div style={{position:'absolute',left:392,top:380,width:296,height:296,borderRadius:72,background:'#BA9029',boxShadow:'14px 24px 0 #C69A2C,28px 48px 75px #6F561C24',transform:`translateY(${lerp(f,0,27,150,0)+Math.sin(f/25)*5}px) rotateX(${lerp(f,0,70,20,6)}deg) rotateY(${lerp(f,0,80,-24,8)}deg) rotateZ(${lerp(f,0,80,-10,1)}deg) scale(${pop(f,1)})`}}><Img src={staticFile('signature/logo.svg')} style={{width:'100%',height:'100%'}}/></div>
    <Title f={f} lines={['Свои дороги.','Своё такси.']} top={788} size={111} delay={16}/>
    <div style={{position:'absolute',left:100,right:100,top:1150,height:170,borderRadius:44,background:P.yellow,boxShadow:'0 22px 50px #B8911726',display:'flex',alignItems:'center',justifyContent:'center',gap:82,color:P.ink,transform:`translateY(${lerp(f,30,53,75,0)}px) scale(${1+Math.sin(f/30)*.004})`,opacity:linear(f,30,45)}}><span style={{fontSize:85,fontWeight:800,letterSpacing:-3}}>taxigr.ru</span><Arrow size={70}/><div style={{position:'absolute',inset:0,borderRadius:44,overflow:'hidden'}}><div style={{position:'absolute',top:-100,left:lerp(f,75,105,-350,1150),width:120,height:400,background:'#FFFFFF55',transform:'rotate(25deg)',filter:'blur(10px)'}}/></div></div>
    <div style={{position:'absolute',left:100,right:100,top:1380,textAlign:'center',fontSize:32,color:'#766F5C',...reveal(f,43,25)}}>Закажите на сайте или в приложении</div>
    <div style={{position:'absolute',left:360,top:1510,width:360,...reveal(f,51,25)}}><Img src={staticFile('store/rustore-ru.svg')} style={{width:'100%',height:132,objectFit:'contain'}}/></div>
  </AbsoluteFill>;
};

const CUTS=[4.5,7.2,11.6,19.6,26.2666666667];
const RibbonCut:React.FC = () => {const f=useTime();return <AbsoluteFill style={{pointerEvents:'none',overflow:'hidden'}}><div style={{position:'absolute',left:interpolate(f,[0,10,20],[1800,-660,-3250],{...clamp,easing:Easing.inOut(Easing.cubic)}),top:-360,width:2400,height:2640,background:P.yellow,transform:'rotate(-15deg)',boxShadow:'-35px 0 80px #2B240E33'}}><div style={{position:'absolute',inset:'0 auto 0 70px',width:3,background:'#FFF4BC66'}}/></div></AbsoluteFill>;};

export const TaxiGrahovoSignature:React.FC<{voiceover?:boolean}> = ({voiceover=true}) => {
  const {fps}=useVideoConfig();const [fontHandle]=useState(()=>delayRender('Load bundled Manrope font'));
  useEffect(()=>{document.fonts.load('800 80px TaxiManrope').then(()=>continueRender(fontHandle)).catch(error=>{console.error(error);continueRender(fontHandle);});},[fontHandle]);
  const frames=(seconds:number)=>Math.round(seconds*fps);
  return <AbsoluteFill style={{fontFamily:FONT,color:P.ink,background:P.night}}>
    <style>{`@font-face{font-family:TaxiManrope;src:url('${staticFile('signature/Manrope.ttf')}') format('truetype');font-weight:200 800;font-style:normal}*{box-sizing:border-box}`}</style>
    <Sequence from={0} durationInFrames={frames(4.5)} name="01 · Свои дороги"><Hook/></Sequence>
    <Sequence from={frames(4.5)} durationInFrames={frames(2.7)} name="02 · Один заказ"><Order/></Sequence>
    <Sequence from={frames(7.2)} durationInFrames={frames(4.4)} name="03 · Машина и лупа"><Driver/></Sequence>
    <Sequence from={frames(11.6)} durationInFrames={frames(8)} name="04 · Объёмная карта"><Trip/></Sequence>
    <Sequence from={frames(19.6)} durationInFrames={frames(26.2666666667)-frames(19.6)} name="05 · Спасибо за поездку"><Review/></Sequence>
    <Sequence from={frames(26.2666666667)} durationInFrames={frames(32)-frames(26.2666666667)} name="06 · Свое такси"><Close/></Sequence>
    {CUTS.map((seconds,i)=><Sequence key={seconds} from={frames(seconds)-Math.round(fps/3)} durationInFrames={Math.round(fps*2/3)} name={`Переход ${i+1}`}><RibbonCut/></Sequence>)}
    {voiceover?<Audio src={staticFile('audio/user/taxi-grahovo-voice.mp3')} volume={.93}/>:null}
    <Audio src={staticFile('signature/sound-design.wav')} volume={1}/>
  </AbsoluteFill>;
};

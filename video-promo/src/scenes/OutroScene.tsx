import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {GooglePlayBadge, RuStoreBadge} from '../components';
import {C, EASE, FONT} from '../styles';

export const OutroScene: React.FC = () => {
  const frame=useCurrentFrame();
  const gather=interpolate(frame,[0,48],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  const brand=interpolate(frame,[46,78],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  const badges=interpolate(frame,[90,120],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  return <AbsoluteFill style={{background:C.brand,display:'grid',placeItems:'center',overflow:'hidden'}}>
    <svg viewBox="0 0 1920 1080" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:1-gather}}><path d="M -100 850 C 280 760, 400 450, 760 520 S 1220 300, 2020 120" fill="none" stroke={C.ink} strokeWidth="18" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={gather}/></svg>
    <div style={{position:'absolute',top:190,left:'50%',translate:'-50% 0',display:'flex',alignItems:'center',gap:28,opacity:brand,scale:.82+brand*.18}}>
      <Img src={staticFile('brand/icon.png')} style={{width:144,height:144,borderRadius:34,boxShadow:'0 24px 55px rgba(0,0,0,.16)'}}/>
      <div style={{fontFamily:FONT,fontSize:92,fontWeight:900,letterSpacing:-4,color:C.ink,whiteSpace:'nowrap'}}>Такси Грахово</div>
    </div>
    <div style={{position:'absolute',top:430,left:120,right:120,textAlign:'center',fontFamily:FONT,fontSize:74,lineHeight:1.05,fontWeight:900,letterSpacing:-2.5,color:C.ink,opacity:interpolate(frame,[70,98],[0,1],{extrapolateRight:'clamp',easing:EASE}),translate:`0 ${interpolate(frame,[70,98],[38,0],{extrapolateRight:'clamp',easing:EASE})}px`}}>Заказать такси — просто</div>
    <div style={{position:'absolute',top:620,left:'50%',translate:`-50% ${interpolate(badges,[0,1],[60,0])}px`,opacity:badges,display:'flex',gap:18}}><GooglePlayBadge/><RuStoreBadge/><div style={{height:86,padding:'0 32px',borderRadius:20,background:'#fff',display:'flex',alignItems:'center',fontFamily:FONT,fontSize:34,fontWeight:850,color:C.ink}}>taxigr.ru</div></div>
    <div style={{position:'absolute',bottom:80,left:0,right:0,textAlign:'center',fontFamily:FONT,fontSize:34,fontWeight:700,color:'rgba(24,24,24,.68)',opacity:badges}}>Грахово и поездки дальше</div>
  </AbsoluteFill>;
};

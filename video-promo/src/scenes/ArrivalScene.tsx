import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Caption, RouteMap} from '../components';
import {C, EASE, FONT} from '../styles';

export const ArrivalScene: React.FC = () => {
  const frame=useCurrentFrame();
  const car=interpolate(frame,[0,102],[.48,.02],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  const minute=frame<34?3:frame<68?2:frame<96?1:0;
  return <AbsoluteFill style={{background:C.canvas,overflow:'hidden'}}>
    <RouteMap progress={1} carProgress={car} labels/>
    <Caption>Следите за машиной на карте</Caption>
    <div style={{position:'absolute',right:110,top:220,width:360,padding:30,borderRadius:34,background:'#fff',boxShadow:'0 20px 65px rgba(0,0,0,.15)',fontFamily:FONT,color:C.ink,textAlign:'center'}}>
      <div style={{fontSize:31,fontWeight:750,color:C.ink2}}>До подачи</div><div style={{fontSize:92,fontWeight:900,fontVariantNumeric:'tabular-nums',margin:'4px 0'}}>{minute}</div><div style={{fontSize:30,fontWeight:800}}>мин.</div>
    </div>
    {frame>=102?<div style={{position:'absolute',left:'50%',bottom:74,translate:'-50% 0',padding:'24px 44px',borderRadius:30,background:C.success,color:'#fff',boxShadow:'0 18px 48px rgba(24,169,87,.28)',fontFamily:FONT,fontSize:39,fontWeight:850,scale:interpolate(frame,[102,124],[.8,1],{extrapolateRight:'clamp',easing:EASE})}}>Дмитрий приехал</div>:null}
  </AbsoluteFill>;
};


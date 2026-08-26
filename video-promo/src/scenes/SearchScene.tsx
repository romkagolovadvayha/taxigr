import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Caption, RingPulse, RouteMap} from '../components';
import {C, EASE, FONT} from '../styles';

export const SearchScene: React.FC = () => {
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{background:C.canvas,overflow:'hidden'}}>
    <RouteMap progress={1} labels={false} dim={.75}/>
    <div style={{position:'absolute',left:150,top:720}}><RingPulse delay={0}/><RingPulse delay={18}/><RingPulse delay={36}/></div>
    <Caption>Заказ сразу увидят водители рядом</Caption>
    {[0,1,2,3].map((i)=><div key={i} style={{position:'absolute',left:[370,610,870,1100][i],top:[620,450,700,390][i],width:68,height:68,borderRadius:'50%',background:C.ink,border:`7px solid ${C.brand}`,boxShadow:'0 12px 30px rgba(0,0,0,.22)',scale:interpolate(frame,[12+i*9,34+i*9],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE})}}/>) }
    <div style={{position:'absolute',left:'50%',bottom:90,translate:'-50% 0',padding:'22px 36px',borderRadius:30,background:'#fff',boxShadow:'0 18px 50px rgba(0,0,0,.14)',fontFamily:FONT,fontSize:38,fontWeight:800,color:C.ink}}>Ищем водителя рядом<span style={{display:'inline-block',width:54,letterSpacing:4}}>...</span></div>
  </AbsoluteFill>;
};


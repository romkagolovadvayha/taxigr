import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Caption, RouteMap} from '../components';
import {C, EASE, FONT} from '../styles';

export const TripScene: React.FC = () => {
  const frame=useCurrentFrame();
  const progress=interpolate(frame,[18,176],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  return <AbsoluteFill style={{background:C.canvas,overflow:'hidden'}}>
    <div style={{position:'absolute',inset:-45,scale:interpolate(frame,[0,210],[1.04,1.12],{extrapolateRight:'clamp'}),translate:`${interpolate(progress,[0,1],[20,-38])}px ${interpolate(progress,[0,1],[12,32])}px`}}><RouteMap progress={1} greenProgress={progress} carProgress={progress} labels={false} textureOpacity={0}/></div>
    <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(24,24,24,.12),transparent 30%,transparent 72%,rgba(24,24,24,.16))'}}/>
    <Caption>От Пятёрочки — до школы</Caption>
    <div style={{position:'absolute',right:110,top:96,padding:'18px 26px',borderRadius:24,background:'rgba(255,255,255,.96)',boxShadow:'0 15px 40px rgba(0,0,0,.14)',fontFamily:FONT,fontSize:32,fontWeight:800,color:C.ink}}>Граховская средняя школа</div>
    <div style={{position:'absolute',left:110,bottom:80,display:'flex',alignItems:'center',gap:18,padding:'20px 30px',borderRadius:28,background:'rgba(255,255,255,.96)',boxShadow:'0 18px 60px rgba(0,0,0,.18)',fontFamily:FONT,color:C.ink}}><div style={{width:18,height:18,borderRadius:'50%',background:C.success}}/><span style={{fontSize:37,fontWeight:850}}>В пути</span><span style={{fontSize:31,color:C.ink2}}>≈ 4 мин</span></div>
  </AbsoluteFill>;
};

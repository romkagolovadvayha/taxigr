import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Caption, Star} from '../components';
import {C, EASE, FONT, POP} from '../styles';

const REVIEW='Спасибо, Дмитрий! Всё отлично';

export const RatingScene: React.FC = () => {
  const frame=useCurrentFrame();
  const chars=Math.floor(interpolate(frame,[70,132],[0,REVIEW.length],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}));
  return <AbsoluteFill style={{background:C.canvas,display:'grid',placeItems:'center'}}>
    <Caption align="center">Как прошла поездка?</Caption>
    <div style={{width:1000,padding:'60px 70px',borderRadius:46,background:'#fff',boxShadow:'0 30px 90px rgba(0,0,0,.12)',fontFamily:FONT,textAlign:'center'}}>
      <div style={{display:'flex',justifyContent:'center',gap:16}}>{[0,1,2,3,4].map(i=>{const p=interpolate(frame,[12+i*9,30+i*9],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:POP});return <div key={i} style={{scale:p,translate:`0 ${interpolate(p,[0,1],[28,0])}px`}}><Star filled={p>.35} size={94}/></div>})}</div>
      <div style={{margin:'44px auto 0',width:790,minHeight:96,padding:'26px 30px',borderRadius:28,background:C.canvas,fontSize:39,fontWeight:700,color:C.ink,textAlign:'left'}}>{REVIEW.slice(0,chars)}<span style={{opacity:frame%16<8?1:0,color:C.brand}}>│</span></div>
      <div style={{fontSize:54,marginTop:24,scale:interpolate(frame,[112,140],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE})}}>😊</div>
    </div>
  </AbsoluteFill>;
};


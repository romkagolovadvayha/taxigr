import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Caption} from '../components';
import {C, EASE, FONT} from '../styles';

export const CompleteScene: React.FC = () => {
  const frame=useCurrentFrame();
  const reveal=interpolate(frame,[8,32],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  return <AbsoluteFill style={{background:C.canvas,display:'grid',placeItems:'center'}}>
    <Caption>Поездка завершена</Caption>
    <div style={{width:920,padding:'58px 70px',borderRadius:46,background:'#fff',boxShadow:'0 30px 90px rgba(0,0,0,.13)',fontFamily:FONT,color:C.ink,opacity:reveal,translate:`0 ${interpolate(reveal,[0,1],[80,0])}px`,scale:.94+reveal*.06}}>
      <div style={{display:'grid',gridTemplateColumns:'112px 1fr auto',alignItems:'center',gap:28}}>
        <div style={{width:112,height:112,borderRadius:'50%',background:'#E7F7EE',display:'grid',placeItems:'center'}}><svg width="64" height="64" viewBox="0 0 64 64"><path d="M13 34 L26 47 L52 18" fill="none" stroke={C.success} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1-reveal}/></svg></div>
        <div><div style={{fontSize:38,fontWeight:850}}>Пятёрочка → школа</div><div style={{fontSize:28,color:C.ink2,marginTop:10}}>Эконом · поездка выполнена</div></div>
        <div style={{fontSize:66,fontWeight:900,fontVariantNumeric:'tabular-nums'}}>150 ₽</div>
      </div>
    </div>
  </AbsoluteFill>;
};


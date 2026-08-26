import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AddressRow, AppHeader, BottomSheet, Caption, PhoneFrame, RouteMap} from '../components';
import {C, EASE} from '../styles';

export const RouteScene: React.FC = () => {
  const frame = useCurrentFrame();
  const route = interpolate(frame,[28,120],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  return <AbsoluteFill style={{background:C.canvas, overflow:'hidden'}}>
    <RouteMap progress={route}/>
    <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(244,244,242,.94) 0%,rgba(244,244,242,.72) 45%,rgba(244,244,242,0) 75%)'}} />
    <Caption>Укажите маршрут</Caption>
    <div style={{position:'absolute',left:112,top:220,width:670,fontFamily:'Inter, sans-serif',color:C.ink}}>
      <div style={{fontSize:34,color:C.ink2,fontWeight:650,marginBottom:18}}>Цена будет известна до заказа</div>
      <div style={{padding:28,borderRadius:34,background:'#fff',boxShadow:'0 24px 70px rgba(0,0,0,.12)',opacity:interpolate(frame,[5,24],[0,1],{extrapolateRight:'clamp'}),translate:`0 ${interpolate(frame,[5,24],[40,0],{extrapolateRight:'clamp',easing:EASE})}px`}}>
        <AddressRow label="Откуда" value="Пятёрочка"/>
        <AddressRow label="Куда" value="Граховская средняя школа" yellow/>
      </div>
    </div>
    <PhoneFrame width={390} height={720} style={{right:120,top:190,rotate:'4deg'}}>
      <RouteMap progress={route} labels={false}/><AppHeader/>
      <BottomSheet height={270}><AddressRow label="Откуда" value="Пятёрочка"/><AddressRow label="Куда" value="Граховская средняя школа" yellow/></BottomSheet>
    </PhoneFrame>
  </AbsoluteFill>;
};


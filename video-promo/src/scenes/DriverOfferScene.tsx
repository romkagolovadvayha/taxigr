import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AddressRow, AppHeader, Caption, PhoneFrame, PrimaryButton} from '../components';
import {C, EASE, FONT, POP} from '../styles';

export const DriverOfferScene: React.FC = () => {
  const frame=useCurrentFrame();
  const lift=interpolate(frame,[12,34],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:POP});
  return <AbsoluteFill style={{background:C.ink,overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 68% 50%,rgba(255,214,0,.20),transparent 46%)'}} />
    <Caption light>Новый заказ приходит мгновенно</Caption>
    <PhoneFrame width={500} height={890} style={{left:'50%',top:150,translate:'-50% 0',rotate:`${interpolate(frame,[0,38],[-6,3],{extrapolateRight:'clamp',easing:EASE})}deg`}}>
      <div style={{position:'absolute',inset:0,background:'linear-gradient(145deg,#202020,#101010)'}}/><AppHeader dark/>
      <div style={{position:'absolute',left:26,right:26,top:190,padding:30,borderRadius:34,background:'#fff',boxShadow:`0 ${16+lift*30}px ${40+lift*45}px rgba(0,0,0,.42)`,translate:`0 ${interpolate(lift,[0,1],[110,0])}px`,scale:.93+lift*.07,fontFamily:FONT,color:C.ink}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}><span style={{padding:'9px 14px',borderRadius:999,background:'#FFF4D6',fontSize:20,fontWeight:800,color:'#855700'}}>Новый заказ</span><span style={{fontSize:32,fontWeight:900}}>150 ₽</span></div>
        <AddressRow label="Откуда" value="Пятёрочка"/><AddressRow label="Куда" value="Граховская средняя школа" yellow/>
        <div style={{display:'flex',gap:12,margin:'24px 0',fontSize:21,fontWeight:750,color:C.ink2}}><span>Эконом</span><span>•</span><span>4 мин</span></div>
        <PrimaryButton pressed={frame>=112&&frame<119}>Принять</PrimaryButton>
      </div>
    </PhoneFrame>
  </AbsoluteFill>;
};


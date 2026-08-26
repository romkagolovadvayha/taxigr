import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AddressRow, AppHeader, BottomSheet, Caption, PhoneFrame, PrimaryButton, RouteMap, TariffCard, priceDigits} from '../components';
import {C, EASE, FONT} from '../styles';

export const TariffScene: React.FC = () => {
  const frame=useCurrentFrame();
  const price=priceDigits(frame,150,8,48);
  const selected=frame>38;
  const pressed=frame>=105&&frame<112;
  return <AbsoluteFill style={{background:C.canvas,overflow:'hidden'}}>
    <Caption>Выберите тариф</Caption>
    <div style={{position:'absolute',left:110,top:215,fontFamily:FONT}}>
      <div style={{fontSize:122,fontWeight:900,letterSpacing:-5,color:C.ink,fontVariantNumeric:'tabular-nums'}}>{price} ₽</div>
      <div style={{fontSize:36,fontWeight:650,color:C.ink2,marginTop:10}}>фиксированная цена поездки</div>
    </div>
    <PhoneFrame width={520} height={930} style={{right:150,top:90}}>
      <RouteMap progress={1} labels={false}/><AppHeader/>
      <BottomSheet height={540}>
        <AddressRow label="Откуда" value="Пятёрочка"/><AddressRow label="Куда" value="Граховская средняя школа" yellow/>
        <div style={{display:'flex',gap:14,marginTop:18,translate:`${interpolate(frame,[0,24],[90,0],{extrapolateRight:'clamp',easing:EASE})}px 0`,opacity:interpolate(frame,[0,20],[0,1],{extrapolateRight:'clamp'})}}>
          <TariffCard kind="economy" price={150} selected={selected}/><TariffCard kind="child" price={180}/>
        </div>
        <div style={{marginTop:18}}><PrimaryButton pressed={pressed}>{price} ₽ · Заказать</PrimaryButton></div>
      </BottomSheet>
    </PhoneFrame>
    {frame>=105?<div style={{position:'absolute',right:150+260,top:90+930-110,width:80,height:80,borderRadius:'50%',border:`8px solid ${C.brand}`,translate:'50% 50%',scale:interpolate(frame,[105,135],[.4,4],{extrapolateRight:'clamp',easing:EASE}),opacity:interpolate(frame,[105,135],[.7,0],{extrapolateRight:'clamp'})}}/>:null}
  </AbsoluteFill>;
};


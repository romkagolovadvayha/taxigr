import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Caption, PhoneFrame, PrimaryButton, Star} from '../components';
import {C, EASE, FONT} from '../styles';

export const DriverAcceptedScene: React.FC = () => {
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{background:C.canvas,overflow:'hidden'}}>
    <Caption>Дмитрий уже в пути</Caption>
    <div style={{position:'absolute',left:110,top:245,width:780,fontFamily:FONT,color:C.ink}}>
      <div style={{display:'flex',alignItems:'center',gap:22}}><div style={{width:116,height:116,borderRadius:'50%',background:C.brand,display:'grid',placeItems:'center',fontSize:54,fontWeight:900}}>Д</div><div><div style={{fontSize:70,fontWeight:900,letterSpacing:-2}}>Дмитрий</div><div style={{display:'flex',alignItems:'center',gap:12,fontSize:34,fontWeight:800}}><Star size={40}/> 5,0</div></div></div>
      <div style={{marginTop:34,padding:28,borderRadius:30,background:'#fff',boxShadow:'0 18px 60px rgba(0,0,0,.10)'}}><div style={{fontSize:34,fontWeight:850}}>Белая Lada Vesta</div><div style={{fontSize:30,color:C.ink2,marginTop:10}}>А123АА 18</div></div>
      <Img src={staticFile('images/taxi-car-white-vesta.png')} style={{position:'absolute',width:700,height:360,objectFit:'contain',left:80,top:360,translate:`${interpolate(frame,[0,55],[260,0],{extrapolateRight:'clamp',easing:EASE})}px 0`,filter:'drop-shadow(0 30px 30px rgba(0,0,0,.20))'}}/>
    </div>
    <PhoneFrame width={430} height={790} style={{right:120,top:150}}>
      <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,#F7F8F5,#ECEDEB)'}}/>
      <div style={{position:'absolute',left:28,right:28,top:160,padding:28,borderRadius:34,background:'#fff',fontFamily:FONT,color:C.ink,boxShadow:'0 22px 60px rgba(0,0,0,.13)',opacity:interpolate(frame,[12,32],[0,1],{extrapolateRight:'clamp'}),translate:`0 ${interpolate(frame,[12,32],[60,0],{extrapolateRight:'clamp',easing:EASE})}px`}}>
        <div style={{fontSize:24,fontWeight:800,color:C.success}}>Водитель найден</div><div style={{fontSize:42,fontWeight:900,marginTop:12}}>Дмитрий · 5,0 ★</div><div style={{fontSize:25,color:C.ink2,margin:'16px 0 28px'}}>Белая Lada Vesta<br/>А123АА 18</div><PrimaryButton success>Заказ принят</PrimaryButton>
      </div>
    </PhoneFrame>
  </AbsoluteFill>;
};

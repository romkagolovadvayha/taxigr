import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Caption, ReviewCard, Star, priceDigits} from '../components';
import {C, EASE, FONT} from '../styles';

const REVIEWS=['Всё отлично','Быстро приехал','Спасибо!','Аккуратно','Отличная поездка','Рекомендую','Всегда вовремя','Очень удобно'];

export const ReviewsIncomeScene: React.FC = () => {
  const frame=useCurrentFrame();
  const fan=interpolate(frame,[0,54],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  const collapse=interpolate(frame,[70,92],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  const income=priceDigits(frame,150,82,114);
  return <AbsoluteFill style={{background:C.ink,overflow:'hidden'}}>
    <Caption light>Хорошая поездка остаётся в рейтинге</Caption>
    <div style={{position:'absolute',left:0,top:100,width:1180,height:900,scale:1-collapse*.55,translate:`${-collapse*260}px ${collapse*110}px`,opacity:1-collapse}}>{REVIEWS.map((text,i)=><ReviewCard key={text} text={text} index={i} progress={fan}/>)}</div>
    <div style={{position:'absolute',left:170,top:360,opacity:collapse,scale:.8+collapse*.2,fontFamily:FONT,color:'#fff'}}><div style={{fontSize:52,fontWeight:850}}>Дмитрий</div><div style={{display:'flex',alignItems:'center',gap:16,fontSize:88,fontWeight:900}}><Star size={80}/> 5,0</div></div>
    <div style={{position:'absolute',right:110,top:245,width:620,padding:46,borderRadius:42,background:'#fff',boxShadow:'0 30px 100px rgba(0,0,0,.34)',fontFamily:FONT,color:C.ink,opacity:interpolate(frame,[78,98],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),translate:`${interpolate(frame,[78,98],[100,0],{extrapolateRight:'clamp',easing:EASE})}px 0`}}>
      <div style={{fontSize:29,fontWeight:800,color:C.success}}>Оплата получена</div><div style={{fontSize:40,fontWeight:850,marginTop:18}}>Доход за поездку</div><div style={{fontSize:102,fontWeight:900,letterSpacing:-4,fontVariantNumeric:'tabular-nums',marginTop:20}}>+{income} ₽</div><div style={{height:15,borderRadius:8,background:'#E7F7EE',marginTop:28,overflow:'hidden'}}><div style={{height:'100%',width:`${interpolate(frame,[86,118],[0,100],{extrapolateRight:'clamp',easing:EASE})}%`,background:C.success}}/></div>
    </div>
  </AbsoluteFill>;
};

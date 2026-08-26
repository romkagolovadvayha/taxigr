import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {TaxiGrahovoPromo, SHOTS} from './Promo';
import {C, EASE, FONT} from './styles';

type ShotKey = keyof typeof SHOTS;

const ORDER = Object.keys(SHOTS) as ShotKey[];

const COPY: Record<ShotKey, {eyebrow: string; title: string; detail: React.ReactNode}> = {
  intro: {eyebrow: 'Такси Грахово', title: 'Поездка начинается здесь', detail: <><strong>Цена известна заранее</strong><span>Укажите адреса и выберите тариф</span></>},
  route: {eyebrow: 'Маршрут', title: 'От магазина — прямо до школы', detail: <><strong>Пятёрочка</strong><i>→</i><strong>Граховская средняя школа</strong></>},
  tariff: {eyebrow: 'Фиксированная цена', title: 'Выберите подходящий тариф', detail: <><b>Эконом <em>150 ₽</em></b><b>Детский <em>180 ₽</em></b></>},
  search: {eyebrow: 'Поиск водителя', title: 'Заказ сразу увидят водители рядом', detail: <><strong>Ищем ближайшую машину…</strong><span>Без звонков и долгого ожидания</span></>},
  offer: {eyebrow: 'Приложение водителя', title: 'Новый заказ приходит мгновенно', detail: <><strong>Пятёрочка → школа</strong><em>150 ₽</em><span>Дмитрий принимает заказ</span></>},
  accepted: {eyebrow: 'Водитель найден', title: 'Дмитрий уже в пути', detail: <><strong>Дмитрий · 5,0 ★</strong><span>Белая Lada Vesta</span><code>А123АА18</code></>},
  arrival: {eyebrow: 'Подача автомобиля', title: 'Машина приехала', detail: <><strong>Дмитрий на месте</strong><span>Белая Lada Vesta · А123АА18</span></>},
  trip: {eyebrow: 'Поездка', title: 'Следите за машиной на карте', detail: <><strong>Пятёрочка → школа</strong><span>В пути ≈ 4 мин</span></>},
  complete: {eyebrow: 'Готово', title: 'Поездка завершена', detail: <><strong>Пятёрочка → школа</strong><em>150 ₽</em></>},
  rating: {eyebrow: 'Оценка поездки', title: 'Поделитесь впечатлением', detail: <><strong className="stars">★★★★★</strong><span>Спасибо, Дмитрий! Всё отлично 😊</span></>},
  income: {eyebrow: 'Рейтинг водителя', title: 'Хорошие поездки замечают', detail: <><strong>Дмитрий · 5,0 ★</strong><span>Оплата получена</span><em>+150 ₽</em></>},
  outro: {eyebrow: 'Такси Грахово', title: 'Заказать такси — просто', detail: <><strong>Google Play</strong><strong>RuStore</strong><strong className="light">taxigr.ru</strong></>},
};

const getShot = (frame: number) => ORDER.find((key) => frame >= SHOTS[key].from && frame < SHOTS[key].from + SHOTS[key].duration) ?? 'outro';

export const TaxiGrahovoPromoPortrait: React.FC<{bgm?: boolean}> = ({bgm = true}) => {
  const frame = useCurrentFrame();
  const shot = getShot(frame);
  const index = ORDER.indexOf(shot);
  const local = frame - SHOTS[shot].from;
  const copy = COPY[shot];
  const dark = shot === 'offer' || shot === 'income';
  const enter = interpolate(local, [0, 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const cardY = interpolate(local, [0, 18], [54, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});

  return <AbsoluteFill style={{background: dark ? C.ink : C.canvas, overflow: 'hidden', fontFamily: FONT, color: dark ? '#fff' : C.ink}}>
    <style>{`
      .portrait-detail{display:flex;flex-wrap:wrap;align-items:center;gap:18px 22px}
      .portrait-detail strong,.portrait-detail b,.portrait-detail code,.portrait-detail em,.portrait-detail span{font-family:${FONT};font-style:normal}
      .portrait-detail strong{font-size:39px;font-weight:850}
      .portrait-detail span{width:100%;font-size:31px;font-weight:650;color:${dark ? 'rgba(255,255,255,.68)' : C.ink2}}
      .portrait-detail i{font-size:40px;font-style:normal;color:${C.brand}}
      .portrait-detail b{min-width:410px;padding:26px 28px;border-radius:28px;background:${dark ? 'rgba(255,255,255,.10)' : C.surface2};font-size:34px}
      .portrait-detail b em{float:right;font-size:42px;font-weight:950}
      .portrait-detail em{font-size:54px;font-weight:950;color:${dark ? C.brand : C.ink}}
      .portrait-detail code{padding:12px 20px;border-radius:18px;background:${dark ? 'rgba(255,255,255,.10)' : C.surface2};font-size:34px;font-weight:800}
      .portrait-detail .stars{letter-spacing:8px;color:${C.brand};font-size:55px}
      .portrait-detail > strong:not(.stars){padding:16px 24px;border-radius:20px;background:${shot === 'outro' ? C.ink : 'transparent'};color:${shot === 'outro' ? '#fff' : 'inherit'}}
      .portrait-detail > strong.light{background:#fff;color:${C.ink}}
    `}</style>

    <svg viewBox="0 0 1080 1920" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:dark?.13:.34}}>
      <path d="M -120 1520 C 210 1390 230 1190 610 1260 S 900 990 1210 860" fill="none" stroke={dark?'#fff':C.brand} strokeWidth="18" strokeLinecap="round"/>
      <circle cx="85" cy="1455" r="30" fill={C.brand}/><rect x="952" y="820" width="60" height="60" rx="18" fill={C.brand}/>
    </svg>

    <div style={{position:'absolute',left:120,right:120,top:42,display:'flex',gap:8}}>
      {ORDER.map((key,i)=><div key={key} style={{height:8,flex:1,borderRadius:8,background:i<=index?C.brand:(dark?'rgba(255,255,255,.18)':'rgba(24,24,24,.12)')}}/>)}
    </div>

    <div style={{position:'absolute',left:120,right:120,top:92,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:18}}><Img src={staticFile('brand/icon.png')} style={{width:68,height:68,borderRadius:18}}/><strong style={{fontSize:32}}>Такси Грахово</strong></div>
      <span style={{fontSize:26,fontWeight:750,opacity:.55}}>{String(index+1).padStart(2,'0')} / 12</span>
    </div>

    <div style={{position:'absolute',left:120,right:120,top:205,opacity:enter,translate:`0 ${interpolate(enter,[0,1],[28,0])}px`}}>
      <div style={{fontSize:27,fontWeight:850,textTransform:'uppercase',letterSpacing:2.6,color:dark?C.brand:C.ink2}}>{copy.eyebrow}</div>
      <div style={{fontSize:68,lineHeight:1.02,fontWeight:920,letterSpacing:-3.1,marginTop:18,maxWidth:940}}>{copy.title}</div>
    </div>

    <div style={{position:'absolute',left:60,right:60,top:520,height:650,borderRadius:48,overflow:'hidden',background:dark?C.ink:'#fff',boxShadow:dark?'0 30px 100px rgba(0,0,0,.45)':'0 30px 90px rgba(24,24,24,.16)',border:dark?'1px solid rgba(255,255,255,.10)':'1px solid rgba(24,24,24,.08)'}}>
      <div style={{position:'absolute',left:'50%',top:'50%',width:1920,height:1080,translate:'-50% -50%',scale:.54}}>
        <TaxiGrahovoPromo bgm={bgm}/>
      </div>
    </div>

    <div style={{position:'absolute',left:120,right:120,top:1230,minHeight:400,borderRadius:44,padding:'42px 42px 44px',background:dark?'rgba(255,255,255,.09)':'rgba(255,255,255,.94)',border:dark?'1px solid rgba(255,255,255,.12)':'1px solid rgba(24,24,24,.08)',boxShadow:'0 24px 70px rgba(0,0,0,.12)',opacity:enter,translate:`0 ${cardY}px`}}>
      <div className="portrait-detail">{copy.detail}</div>
    </div>

    <div style={{position:'absolute',left:120,right:120,bottom:150,display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:27,fontWeight:750,opacity:.56}}><span>Грахово и поездки дальше</span><span>taxigr.ru</span></div>
  </AbsoluteFill>;
};

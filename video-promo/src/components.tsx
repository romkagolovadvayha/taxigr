import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, EASE, FONT, POP, clamp} from './styles';

export const BrandMark: React.FC<{size?: number; inverted?: boolean}> = ({size = 80, inverted = false}) => (
  <div style={{width: size, height: size, borderRadius: size * 0.24, background: inverted ? C.ink : C.brand, display: 'grid', placeItems: 'center', overflow: 'hidden'}}>
    <Img src={staticFile('brand/icon.png')} style={{width: size, height: size, objectFit: 'cover'}} />
  </div>
);

export const Caption: React.FC<{children: React.ReactNode; light?: boolean; align?: 'left' | 'center'}> = ({children, light = false, align = 'left'}) => (
  <div style={{position: 'absolute', left: align === 'left' ? 112 : 240, right: align === 'left' ? 112 : 240, top: 82, zIndex: 30, fontFamily: FONT, fontSize: 58, lineHeight: 1.06, fontWeight: 800, letterSpacing: -1.8, color: light ? '#fff' : C.ink, textAlign: align, textShadow: light ? '0 3px 22px rgba(0,0,0,.32)' : 'none'}}>
    {children}
  </div>
);

export const PhoneFrame: React.FC<{children: React.ReactNode; width?: number; height?: number; style?: React.CSSProperties}> = ({children, width = 500, height = 920, style}) => (
  <div style={{position: 'absolute', width, height, borderRadius: 70, background: '#111', padding: 14, boxShadow: '0 50px 100px rgba(24,24,24,.24), 0 10px 30px rgba(24,24,24,.16)', ...style}}>
    <div style={{position: 'absolute', width: 136, height: 34, borderRadius: 18, background: '#090909', top: 23, left: '50%', translate: '-50% 0', zIndex: 20}} />
    <div style={{position: 'relative', width: '100%', height: '100%', borderRadius: 58, overflow: 'hidden', background: C.canvas}}>{children}</div>
  </div>
);

export const AppHeader: React.FC<{dark?: boolean}> = ({dark = false}) => (
  <div style={{position: 'absolute', left: 28, right: 28, top: 28, height: 74, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 12}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px 8px 8px', borderRadius: 20, background: dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.92)', boxShadow: '0 8px 24px rgba(0,0,0,.08)', fontFamily: FONT, fontSize: 21, fontWeight: 700, color: dark ? '#fff' : C.ink}}>
      <BrandMark size={48} /> Такси Грахово
    </div>
    <div style={{width: 52, height: 52, borderRadius: 26, background: dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', fontSize: 24, color: dark ? '#fff' : C.ink}}>●</div>
  </div>
);

const ROUTE_POINTS = [
  {x: 150, y: 720}, {x: 300, y: 700}, {x: 430, y: 640}, {x: 560, y: 650},
  {x: 700, y: 535}, {x: 850, y: 490}, {x: 990, y: 385}, {x: 1140, y: 345},
  {x: 1280, y: 230}, {x: 1450, y: 210}, {x: 1570, y: 135},
];

export const routePoint = (progress: number) => {
  const p = clamp(progress) * (ROUTE_POINTS.length - 1);
  const i = Math.min(ROUTE_POINTS.length - 2, Math.floor(p));
  const t = p - i;
  const a = ROUTE_POINTS[i]!;
  const b = ROUTE_POINTS[i + 1]!;
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI};
};

export const RouteMap: React.FC<{progress?: number; carProgress?: number; greenProgress?: number; labels?: boolean; dim?: number; textureOpacity?: number}> = ({progress = 1, carProgress, greenProgress = 0, labels = true, dim = 1, textureOpacity = .16}) => {
  const car = carProgress === undefined ? null : routePoint(carProgress);
  const path = ROUTE_POINTS.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#F7F8F5', opacity: dim}}>
      <Img src={staticFile('images/order-landscape.png')} style={{position: 'absolute', inset: -30, width: 1980, height: 1140, objectFit: 'cover', opacity: textureOpacity, filter: 'saturate(.75) contrast(.9)'}} />
      <svg viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
        <path d={path} fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} fill="none" stroke={C.brand} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - clamp(progress)} />
        {greenProgress > 0 ? <path d={path} fill="none" stroke={C.route} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${clamp(greenProgress)} 1`} /> : null}
      </svg>
      <MapPin x={150} y={720} label={labels ? 'Пятёрочка' : undefined} />
      <MapPin x={1570} y={135} label={labels ? 'Граховская средняя школа' : undefined} square />
      {car ? <div style={{position: 'absolute', left: car.x, top: car.y, width: 92, height: 48, translate: '-50% -50%', rotate: `${car.angle}deg`, borderRadius: 24, background: C.ink, border: `5px solid ${C.brand}`, boxShadow: '0 10px 26px rgba(0,0,0,.28)', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 22}}>TAXI</div> : null}
    </AbsoluteFill>
  );
};

export const MapPin: React.FC<{x: number; y: number; label?: string; square?: boolean}> = ({x, y, label, square = false}) => (
  <div style={{position: 'absolute', left: x, top: y, translate: '-50% -100%', zIndex: 8}}>
    <div style={{width: 62, height: 62, borderRadius: square ? 18 : '50% 50% 50% 12%', rotate: square ? '0deg' : '-45deg', background: C.brand, border: '6px solid #fff', boxShadow: '0 12px 30px rgba(0,0,0,.18)', display: 'grid', placeItems: 'center'}}>
      <div style={{width: 17, height: 17, borderRadius: square ? 4 : '50%', background: C.ink, rotate: square ? '0deg' : '45deg'}} />
    </div>
    {label ? <div style={{position: 'absolute', top: 76, left: '50%', translate: '-50% 0', whiteSpace: 'nowrap', background: 'rgba(255,255,255,.96)', borderRadius: 18, padding: '12px 18px', boxShadow: '0 10px 28px rgba(0,0,0,.12)', fontFamily: FONT, fontSize: 32, fontWeight: 750, color: C.ink}}>{label}</div> : null}
  </div>
);

export const BottomSheet: React.FC<{children: React.ReactNode; height?: number}> = ({children, height = 500}) => (
  <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 15, height, padding: '38px 30px 28px', borderRadius: '38px 38px 0 0', background: 'rgba(255,255,255,.98)', boxShadow: '0 -20px 60px rgba(0,0,0,.12)', fontFamily: FONT, color: C.ink}}>
    <div style={{position: 'absolute', width: 74, height: 7, borderRadius: 4, background: '#C8C9C7', left: '50%', top: 16, translate: '-50% 0'}} />
    {children}
  </div>
);

export const AddressRow: React.FC<{label: string; value: string; yellow?: boolean}> = ({label, value, yellow = false}) => (
  <div style={{display: 'grid', gridTemplateColumns: '26px 1fr', gap: 15, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(24,24,24,.09)'}}>
    <div style={{width: 14, height: 14, borderRadius: yellow ? 4 : '50%', background: yellow ? C.brand : C.ink}} />
    <div><div style={{fontSize: 15, color: C.ink2, fontWeight: 700, textTransform: 'uppercase'}}>{label}</div><div style={{fontSize: 27, fontWeight: 650, lineHeight: 1.16}}>{value}</div></div>
  </div>
);

export const TariffCard: React.FC<{kind: 'economy' | 'child'; price: number; selected?: boolean}> = ({kind, price, selected = false}) => (
  <div style={{width: 208, height: 170, borderRadius: 28, border: `${selected ? 4 : 2}px solid ${selected ? C.brand : 'rgba(24,24,24,.12)'}`, background: C.surface, padding: 14, boxShadow: selected ? '0 12px 34px rgba(255,214,0,.20)' : 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
    <Img src={staticFile(kind === 'economy' ? 'images/economy-car.png' : 'images/child-seat.png')} style={{width: 82, height: 60, objectFit: 'contain'}} />
    <div style={{whiteSpace: 'nowrap'}}><div style={{fontSize: 23, lineHeight: 1, fontWeight: 800}}>{kind === 'economy' ? 'Эконом' : 'Детский'}</div><div style={{fontSize: 34, lineHeight: 1.05, fontWeight: 900, marginTop: 5}}>{price} ₽</div></div>
  </div>
);

export const PrimaryButton: React.FC<{children: React.ReactNode; pressed?: boolean; success?: boolean}> = ({children, pressed = false, success = false}) => (
  <div style={{height: 84, borderRadius: 31, background: success ? C.success : C.brand, color: success ? '#fff' : C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 29, fontWeight: 850, scale: pressed ? 0.97 : 1, boxShadow: success ? '0 14px 34px rgba(24,169,87,.20)' : '0 14px 34px rgba(255,214,0,.20)'}}>{children}</div>
);

export const Star: React.FC<{filled?: boolean; size?: number}> = ({filled = true, size = 48}) => (
  <span style={{display: 'inline-block', width: size, fontSize: size, lineHeight: 1, color: filled ? C.brand : '#D7D8D5', textShadow: filled ? '0 5px 16px rgba(255,214,0,.25)' : 'none'}}>★</span>
);

export const ReviewCard: React.FC<{text: string; index: number; progress: number}> = ({text, index, progress}) => {
  const k = index - 3.5;
  return <div style={{position: 'absolute', width: 280, height: 170, left: '50%', top: '50%', marginLeft: -140, marginTop: -85, padding: 24, borderRadius: 28, background: '#fff', border: '1px solid rgba(24,24,24,.08)', boxShadow: '0 20px 55px rgba(0,0,0,.14)', translate: `${k * 72 * progress}px ${interpolate(progress, [0,1],[300, Math.abs(k) * 12], {extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px`, rotate: `${k * 7 * progress}deg`, zIndex: 20 - Math.abs(Math.round(k)), fontFamily: FONT}}>
    <div style={{display: 'flex', gap: 2}}>{[0,1,2,3,4].map(i => <Star key={i} size={27}/>)}</div>
    <div style={{fontSize: 25, fontWeight: 750, marginTop: 18, color: C.ink}}>{text}</div>
  </div>;
};

export const RuStoreBadge: React.FC = () => (
  <div style={{height: 86, padding: '0 28px', borderRadius: 20, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT, fontSize: 34, fontWeight: 750}}>
    <div style={{width: 42, height: 42, borderRadius: 12, background: 'conic-gradient(from 210deg,#7D47E8,#1AA7EC,#18A957,#FF5757,#7D47E8)'}} /> RuStore
  </div>
);

export const GooglePlayBadge: React.FC = () => (
  <div style={{height: 86, padding: '0 28px', borderRadius: 20, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT, fontSize: 34, fontWeight: 750}}>
    <div style={{width: 0, height: 0, borderTop: '21px solid transparent', borderBottom: '21px solid transparent', borderLeft: '36px solid #35D07F', filter: 'drop-shadow(9px 0 0 #55A8FF)'}} /> Google Play
  </div>
);

export const SceneFade: React.FC<{children: React.ReactNode; duration: number}> = ({children, duration}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{opacity: interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE})}}>{children}</AbsoluteFill>;
};

export const RingPulse: React.FC<{delay: number; color?: string}> = ({delay, color = C.brand}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 54], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return <div style={{position: 'absolute', left: '50%', top: '50%', width: 240 + p * 1050, height: 240 + p * 1050, borderRadius: '50%', border: `8px solid ${color}`, translate: '-50% -50%', opacity: (1 - p) * .42}} />;
};

export const priceDigits = (frame: number, target: number, start = 0, end = 42) => Math.min(target, Math.max(0, Math.round(interpolate(frame, [start, end], [0, target], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: POP}))));

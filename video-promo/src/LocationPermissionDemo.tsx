import React from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from './styles';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const Phone: React.FC<React.PropsWithChildren<{title: string}>> = ({title, children}) => (
  <div style={{width: 650, height: 940, borderRadius: 58, background: '#111', padding: 14, boxShadow: '0 34px 90px #0004'}}>
    <div style={{height: '100%', borderRadius: 46, overflow: 'hidden', background: C.canvas, position: 'relative'}}>
      <div style={{height: 58, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', fontSize: 19, fontWeight: 700}}>
        <span>12:34</span><span style={{letterSpacing: 4}}>● ᴡɪꜰɪ ▰</span>
      </div>
      <div style={{height: 74, background: C.surface, borderTop: `1px solid ${C.surface2}`, borderBottom: `1px solid ${C.surface2}`, display: 'flex', alignItems: 'center', gap: 18, padding: '0 28px'}}>
        <div style={{width: 42, height: 42, borderRadius: 14, background: C.brand, display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: 22}}>Т</div>
        <div style={{fontSize: 26, fontWeight: 850}}>{title}</div>
      </div>
      {children}
    </div>
  </div>
);

const Pointer: React.FC<{x: number; y: number; pulse?: number}> = ({x, y, pulse = 1}) => (
  <div style={{position: 'absolute', left: x, top: y, width: 70, height: 70, borderRadius: 999, border: '6px solid #2684FF', background: '#2684FF22', scale: pulse, boxShadow: '0 0 0 18px #2684FF22'}} />
);

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const press = interpolate(frame, [2.1 * fps, 2.35 * fps, 2.7 * fps], [1, 0.96, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
  return <Phone title="Режим водителя">
    <div style={{padding: 34}}>
      <div style={{height: 390, borderRadius: 30, background: 'linear-gradient(145deg,#DDEAE2,#C8E4D3)', position: 'relative', overflow: 'hidden'}}>
        <div style={{position: 'absolute', inset: 0, opacity: .6, background: 'repeating-linear-gradient(25deg,transparent 0 48px,#fff 49px 54px)'}} />
        <div style={{position: 'absolute', left: 270, top: 160, width: 58, height: 58, borderRadius: 999, background: C.brand, border: '8px solid white', boxShadow: '0 5px 20px #0004'}} />
      </div>
      <div style={{fontSize: 34, fontWeight: 900, marginTop: 34}}>Вы не на линии</div>
      <div style={{fontSize: 23, lineHeight: 1.35, color: C.ink2, marginTop: 12}}>Включите режим водителя, чтобы получать заказы поблизости.</div>
      <button style={{width: '100%', height: 92, border: 0, borderRadius: 25, background: C.brand, color: C.ink, fontSize: 30, fontWeight: 900, marginTop: 36, scale: press}}>Выйти на линию</button>
      {frame > 1.7 * fps && frame < 3.1 * fps ? <Pointer x={450} y={670} pulse={interpolate(frame, [1.7 * fps, 2.2 * fps], [.75, 1], clamp)} /> : null}
    </div>
  </Phone>;
};

const Disclosure: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <Phone title="Режим водителя">
    <div style={{position: 'absolute', inset: 132, top: 132, background: '#0007'}} />
    <div style={{position: 'absolute', left: 45, right: 45, top: 220, background: C.surface, borderRadius: 32, padding: 34, boxShadow: '0 30px 80px #0006'}}>
      <div style={{fontSize: 32, fontWeight: 900}}>Геолокация водителя</div>
      <div style={{fontSize: 22, lineHeight: 1.42, color: '#333', marginTop: 18}}>«Такси Грахово» собирает данные о местоположении, чтобы передавать диспетчеру и пассажиру позицию водителя и поддерживать навигацию, даже когда приложение закрыто или не используется.</div>
      <div style={{fontSize: 22, lineHeight: 1.42, color: '#333', marginTop: 14}}>Данные передаются только пока водитель находится на линии или выполняет поездку.</div>
      <div style={{display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 30, fontSize: 22, fontWeight: 850}}>
        <div style={{padding: '18px 22px', color: C.ink2}}>Не сейчас</div>
        <div style={{padding: '18px 24px', background: C.brand, borderRadius: 18}}>Продолжить</div>
      </div>
      {frame > 3.2 * fps ? <Pointer x={465} y={585} pulse={interpolate(frame, [3.2 * fps, 3.7 * fps], [.78, 1], clamp)} /> : null}
    </div>
  </Phone>;
};

const AndroidSettings: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <Phone title="Разрешение на местоположение">
    <div style={{padding: 34, background: '#F7F8FA', height: '100%'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
        <div style={{width: 62, height: 62, borderRadius: 18, background: C.brand, display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: 28}}>Т</div>
        <div><div style={{fontSize: 29, fontWeight: 850}}>Такси Грахово</div><div style={{fontSize: 20, color: C.ink2}}>Доступ к геоданным</div></div>
      </div>
      <div style={{fontSize: 24, color: C.ink2, marginTop: 42}}>Разрешить этому приложению доступ к местоположению?</div>
      {['Разрешить в любом режиме', 'Разрешить только во время использования', 'Спрашивать каждый раз', 'Запретить'].map((label, index) => <div key={label} style={{display: 'flex', gap: 20, alignItems: 'center', minHeight: 82, borderBottom: `1px solid ${C.surface2}`, fontSize: 24, fontWeight: index === 0 ? 850 : 600}}>
        <div style={{width: 28, height: 28, borderRadius: 999, border: `3px solid ${index === 0 ? '#2684FF' : '#888'}`, display: 'grid', placeItems: 'center'}}>{index === 0 ? <div style={{width: 14, height: 14, borderRadius: 999, background: '#2684FF'}} /> : null}</div>
        {label}
      </div>)}
      <div style={{fontSize: 19, lineHeight: 1.4, color: C.ink2, marginTop: 32}}>Водитель может изменить разрешение в настройках Android в любое время.</div>
      {frame > 2.2 * fps ? <Pointer x={20} y={218} pulse={interpolate(frame, [2.2 * fps, 2.7 * fps], [.78, 1], clamp)} /> : null}
    </div>
  </Phone>;
};

const ActiveTrip: React.FC<{minimized?: boolean}> = ({minimized = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const markerX = interpolate(frame, [0, 7 * fps], [210, 410], clamp);
  if (minimized) return <Phone title="Уведомления">
    <div style={{padding: 28, background: '#E8EAED', height: '100%'}}>
      <div style={{fontSize: 21, fontWeight: 750, color: C.ink2, marginBottom: 20}}>Сейчас</div>
      <div style={{borderRadius: 26, background: C.surface, padding: 26, boxShadow: '0 8px 25px #0002'}}>
        <div style={{display: 'flex', gap: 16, alignItems: 'center'}}><div style={{width: 46, height: 46, borderRadius: 14, background: C.brand, display: 'grid', placeItems: 'center', fontWeight: 950}}>Т</div><div style={{fontSize: 24, fontWeight: 900}}>Такси Грахово — водитель на линии</div></div>
        <div style={{fontSize: 21, lineHeight: 1.4, color: C.ink2, marginTop: 16}}>Геопозиция передаётся только пока вы принимаете заказы</div>
        <div style={{height: 8, borderRadius: 99, background: C.surface2, marginTop: 22, overflow: 'hidden'}}><div style={{height: '100%', width: `${interpolate(frame, [0, 6 * fps], [15, 94], clamp)}%`, background: '#2684FF'}} /></div>
      </div>
      <div style={{marginTop: 40, borderRadius: 26, background: C.surface, padding: 28}}>
        <div style={{fontSize: 24, fontWeight: 900}}>Приложение свёрнуто</div>
        <div style={{fontSize: 21, lineHeight: 1.4, color: C.ink2, marginTop: 12}}>Маршрут и статусы поездки продолжают работать. Службу можно остановить, выйдя с линии.</div>
      </div>
    </div>
  </Phone>;

  return <Phone title="Поездка выполняется">
    <div style={{height: 560, background: '#DDEAE2', position: 'relative', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, opacity: .7, background: 'repeating-linear-gradient(35deg,transparent 0 58px,#fff 59px 65px)'}} />
      <svg viewBox="0 0 650 560" style={{position: 'absolute', inset: 0}}><path d="M70 455 C210 410 160 260 320 260 S460 140 580 105" fill="none" stroke="#16B96B" strokeWidth="18" strokeLinecap="round" /></svg>
      <div style={{position: 'absolute', left: markerX, top: interpolate(markerX, [210, 410], [315, 195], clamp), width: 56, height: 56, borderRadius: 999, background: C.brand, border: '8px solid white', boxShadow: '0 5px 18px #0004'}} />
      <div style={{position: 'absolute', right: 18, top: 18, padding: '12px 18px', background: C.surface, borderRadius: 18, fontSize: 19, fontWeight: 850, color: C.success}}>● Геопозиция передаётся</div>
    </div>
    <div style={{padding: 30}}><div style={{fontSize: 31, fontWeight: 900}}>В пути к пассажиру</div><div style={{fontSize: 22, color: C.ink2, marginTop: 10}}>Граховская средняя школа · 4 мин</div><div style={{marginTop: 28, padding: 22, background: '#EAF7EF', borderRadius: 22, fontSize: 21, lineHeight: 1.35}}>Пассажир и диспетчер видят актуальное положение автомобиля.</div></div>
  </Phone>;
};

const Caption: React.FC<{title: string; body: string}> = ({title, body}) => (
  <div style={{width: 760, color: C.ink}}><div style={{fontSize: 60, lineHeight: 1.08, fontWeight: 950, letterSpacing: -2}}>{title}</div><div style={{fontSize: 30, lineHeight: 1.35, color: C.ink2, marginTop: 24}}>{body}</div></div>
);

export const LocationPermissionDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = frame < 4 * fps ? 0 : frame < 11 * fps ? 1 : frame < 17 * fps ? 2 : frame < 23 * fps ? 3 : 4;
  const enter = frame % (scene === 0 ? 4 * fps : scene === 1 ? 7 * fps : 6 * fps);
  const opacity = interpolate(enter, [0, 12], [0, 1], clamp);
  const captions = [
    ['1. Водитель выходит на линию', 'Функция запускается только явным действием водителя.'],
    ['2. Понятное объяснение до системного запроса', 'Приложение сообщает, какие данные используются, зачем и когда передача прекращается.'],
    ['3. Водитель разрешает фоновый доступ', 'Android открывает настройки. Пользователь сам выбирает «Разрешить в любом режиме».'],
    ['4. Геопозиция поддерживает поездку и навигацию', 'Маркер обновляется для диспетчера и пассажира, пока водитель на линии.'],
    ['5. Работа заметна при свёрнутом приложении', 'Постоянное уведомление показывает активную службу. Выход с линии сразу останавливает передачу.'],
  ];
  return <AbsoluteFill style={{background: 'linear-gradient(135deg,#FFFDF4,#EEF5F0)', fontFamily: FONT, color: C.ink}}>
    <div style={{position: 'absolute', left: 90, top: 60, display: 'flex', alignItems: 'center', gap: 18}}><div style={{width: 56, height: 56, borderRadius: 18, background: C.brand, display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: 28}}>Т</div><div style={{fontSize: 26, fontWeight: 900}}>Такси Грахово · демонстрация для Google Play</div></div>
    <div style={{position: 'absolute', inset: '145px 100px 75px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 90}}>
      <div style={{opacity, translate: `${interpolate(enter, [0, 16], [-32, 0], clamp)}px 0`}}><Caption title={captions[scene][0]} body={captions[scene][1]} /></div>
      <div style={{opacity, scale: interpolate(enter, [0, 16], [.97, 1], clamp)}}>
        {scene === 0 ? <Intro /> : scene === 1 ? <Disclosure /> : scene === 2 ? <AndroidSettings /> : scene === 3 ? <ActiveTrip /> : <ActiveTrip minimized />}
      </div>
    </div>
    <div style={{position: 'absolute', left: 100, bottom: 40, fontSize: 20, color: C.ink2}}>Фоновая геолокация используется только водителем на линии или во время поездки.</div>
  </AbsoluteFill>;
};

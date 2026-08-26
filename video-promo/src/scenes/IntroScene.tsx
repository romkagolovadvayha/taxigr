import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AppHeader, Caption, PhoneFrame, RingPulse, RouteMap} from '../components';
import {C, EASE} from '../styles';

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: C.canvas, overflow: 'hidden'}}>
    <RingPulse delay={0}/><RingPulse delay={14}/><RingPulse delay={28}/>
    <div style={{position:'absolute', inset:0, background:'radial-gradient(circle at 50% 56%,rgba(255,214,0,.13),transparent 48%)'}} />
    <Caption>Поездка начинается здесь</Caption>
    <PhoneFrame width={472} height={870} style={{left: '50%', top: 172, translate: '-50% 0', opacity: interpolate(frame,[0,18],[0,1],{extrapolateRight:'clamp'}), scale: interpolate(frame,[0,38],[.72,1],{extrapolateRight:'clamp',easing:EASE}), rotate: `${interpolate(frame,[0,40],[-7,0],{extrapolateRight:'clamp',easing:EASE})}deg`}}>
      <RouteMap progress={interpolate(frame,[25,95],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE})} labels={false}/>
      <AppHeader/>
    </PhoneFrame>
  </AbsoluteFill>;
};


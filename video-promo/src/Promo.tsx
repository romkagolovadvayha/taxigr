import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {ArrivalScene} from './scenes/ArrivalScene';
import {CompleteScene} from './scenes/CompleteScene';
import {DriverAcceptedScene} from './scenes/DriverAcceptedScene';
import {DriverOfferScene} from './scenes/DriverOfferScene';
import {IntroScene} from './scenes/IntroScene';
import {OutroScene} from './scenes/OutroScene';
import {RatingScene} from './scenes/RatingScene';
import {ReviewsIncomeScene} from './scenes/ReviewsIncomeScene';
import {RouteScene} from './scenes/RouteScene';
import {SearchScene} from './scenes/SearchScene';
import {TariffScene} from './scenes/TariffScene';
import {TripScene} from './scenes/TripScene';

export const SHOTS = {
  intro: {from: 0, duration: 120},
  route: {from: 120, duration: 180},
  tariff: {from: 300, duration: 150},
  search: {from: 450, duration: 120},
  offer: {from: 570, duration: 150},
  accepted: {from: 720, duration: 150},
  arrival: {from: 870, duration: 150},
  trip: {from: 1020, duration: 210},
  complete: {from: 1230, duration: 120},
  rating: {from: 1350, duration: 150},
  income: {from: 1500, duration: 120},
  outro: {from: 1620, duration: 180},
} as const;

const OUTPUT_AUDIO_OFFSET_F = 1.28;
const sfxFrom = (target: number, peakDelay = 0) => Math.max(0, Math.round(target - peakDelay - OUTPUT_AUDIO_OFFSET_F));

const SFX = [
  {from: sfxFrom(SHOTS.intro.from + 8), src: 'audio/sfx/transition-soft.mp3', volume: .38, duration: 60},
  {from: sfxFrom(SHOTS.route.from + 26, 21), src: 'audio/sfx/whoosh-big.mp3', volume: .34, duration: 78},
  {from: sfxFrom(SHOTS.tariff.from + 107), src: 'audio/sfx/transition-snap.mp3', volume: .58, duration: 24},
  {from: sfxFrom(SHOTS.search.from + 6, 18), src: 'audio/sfx/whoosh-fast.mp3', volume: .34, duration: 58},
  {from: sfxFrom(SHOTS.offer.from + 8, 19), src: 'audio/app/new_order.wav', volume: .48, duration: 72},
  {from: sfxFrom(SHOTS.offer.from + 113), src: 'audio/sfx/transition-snap.mp3', volume: .62, duration: 24},
  {from: sfxFrom(SHOTS.accepted.from + 18, 9), src: 'audio/app/taxi_found.wav', volume: .48, duration: 70},
  {from: sfxFrom(SHOTS.arrival.from + 103, 14), src: 'audio/app/driver_arrived.wav', volume: .52, duration: 72},
  {from: sfxFrom(SHOTS.trip.from + 12, 8), src: 'audio/app/ride_started.wav', volume: .46, duration: 58},
  {from: sfxFrom(SHOTS.complete.from + 13, 10), src: 'audio/app/ride_complete.wav', volume: .52, duration: 74},
  {from: sfxFrom(SHOTS.rating.from + 13, 7), src: 'audio/sfx/swoosh-quick.mp3', volume: .30, duration: 30},
  {from: sfxFrom(SHOTS.income.from + 73, 21), src: 'audio/sfx/whoosh-big.mp3', volume: .34, duration: 66},
  {from: sfxFrom(SHOTS.outro.from + 2), src: 'audio/sfx/riser-cine.mp3', volume: .42, duration: 145},
  {from: sfxFrom(SHOTS.outro.from + 48, 16), src: 'audio/sfx/impact-deep-whoosh.mp3', volume: .56, duration: 122},
  {from: sfxFrom(SHOTS.outro.from + 78), src: 'audio/sfx/sparkle.mp3', volume: .38, duration: 102},
] as const;

export const TaxiGrahovoPromo: React.FC<{bgm?: boolean}> = ({bgm = true}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background:'#F4F4F2'}}>
    <Sequence from={SHOTS.intro.from} durationInFrames={SHOTS.intro.duration} name="01 Intro"><IntroScene/></Sequence>
    <Sequence from={SHOTS.route.from} durationInFrames={SHOTS.route.duration} name="02 Route"><RouteScene/></Sequence>
    <Sequence from={SHOTS.tariff.from} durationInFrames={SHOTS.tariff.duration} name="03 Tariff"><TariffScene/></Sequence>
    <Sequence from={SHOTS.search.from} durationInFrames={SHOTS.search.duration} name="04 Search"><SearchScene/></Sequence>
    <Sequence from={SHOTS.offer.from} durationInFrames={SHOTS.offer.duration} name="05 Driver offer"><DriverOfferScene/></Sequence>
    <Sequence from={SHOTS.accepted.from} durationInFrames={SHOTS.accepted.duration} name="06 Accepted"><DriverAcceptedScene/></Sequence>
    <Sequence from={SHOTS.arrival.from} durationInFrames={SHOTS.arrival.duration} name="07 Arrival"><ArrivalScene/></Sequence>
    <Sequence from={SHOTS.trip.from} durationInFrames={SHOTS.trip.duration} name="08 Trip"><TripScene/></Sequence>
    <Sequence from={SHOTS.complete.from} durationInFrames={SHOTS.complete.duration} name="09 Complete"><CompleteScene/></Sequence>
    <Sequence from={SHOTS.rating.from} durationInFrames={SHOTS.rating.duration} name="10 Rating"><RatingScene/></Sequence>
    <Sequence from={SHOTS.income.from} durationInFrames={SHOTS.income.duration} name="11 Reviews and income"><ReviewsIncomeScene/></Sequence>
    <Sequence from={SHOTS.outro.from} durationInFrames={SHOTS.outro.duration} name="12 Outro"><OutroScene/></Sequence>
    {bgm ? <Audio src={staticFile('audio/bgm/bgm-tech-house.mp3')} volume={interpolate(frame,[0,30,1735,1800],[0,.29,.29,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/> : null}
    {SFX.map((s,i)=><Sequence key={`${s.src}-${i}`} from={s.from} durationInFrames={s.duration} layout="none"><Audio src={staticFile(s.src)} volume={s.volume}/></Sequence>)}
  </AbsoluteFill>;
};

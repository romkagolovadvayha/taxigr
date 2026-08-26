import React from 'react';
import {Composition, Folder} from 'remotion';
import {TaxiGrahovoPromo} from './Promo';
import {IntroScene} from './scenes/IntroScene';
import {OutroScene} from './scenes/OutroScene';
import {TripScene} from './scenes/TripScene';
import {LocationPermissionDemo} from './LocationPermissionDemo';
import {TaxiGrahovoPromoPortrait} from './PortraitPromo';
import {TaxiGrahovoFastPortrait} from './FastPortraitPromo';

export const Root: React.FC = () => <>
  <Folder name="Taxi-Grahovo-Scenes">
    <Composition id="PromoIntro" component={IntroScene} durationInFrames={120} fps={30} width={1920} height={1080}/>
    <Composition id="PromoTrip" component={TripScene} durationInFrames={210} fps={30} width={1920} height={1080}/>
    <Composition id="PromoOutro" component={OutroScene} durationInFrames={180} fps={30} width={1920} height={1080}/>
  </Folder>
  <Composition id="TaxiGrahovoPromo" component={TaxiGrahovoPromo} durationInFrames={1800} fps={30} width={1920} height={1080} defaultProps={{bgm:true}}/>
  <Composition id="TaxiGrahovoPromoPortrait" component={TaxiGrahovoPromoPortrait} durationInFrames={1800} fps={30} width={1080} height={1920} defaultProps={{bgm:true}}/>
  <Composition id="TaxiGrahovoFastPortrait" component={TaxiGrahovoFastPortrait} durationInFrames={893} fps={30} width={1080} height={1920} defaultProps={{bgm:true,voiceover:true}}/>
  <Composition id="LocationPermissionDemo" component={LocationPermissionDemo} durationInFrames={870} fps={30} width={1920} height={1080}/>
</>;

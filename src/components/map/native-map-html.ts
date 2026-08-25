import type { Address, Coordinates } from '@/domain/models';
import type { DriverRouteTarget } from '@/domain/ride-state';
import type { MapViewportInsets } from '@/components/map/types';
import { motion, type AppColorScheme } from '../../theme/tokens';

import { driverMarkerSvgMarkup } from './driver-marker';

type State = {
  pickup?: Address | null;
  destination?: Address | null;
  routeCoordinates?: Coordinates[] | null;
  pickupEtaMinutes?: number | null;
  destinationArrivalLabel?: string | null;
  driver?: Coordinates | null;
  driverHeading?: number | null;
  passenger?: Coordinates | null;
  followDriver?: boolean;
  followZoom?: number;
  navigationMode?: boolean;
  routeTarget?: DriverRouteTarget | null;
  viewportInsets?: MapViewportInsets;
  colorScheme?: AppColorScheme;
};

export function buildNativeMapHtml(apiKey: string, colorScheme: AppColorScheme = 'light'): string {
  const initialMapBackground = colorScheme === 'dark' ? '#202522' : '#E9EFE7';
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body,#map{width:100%;height:100%;margin:0;overflow:hidden;background:${initialMapBackground}}
    .marker{width:18px;height:18px;border-radius:999px;border:4px solid white;box-shadow:0 3px 12px rgba(0,0,0,.25);transform:translate(-50%,-50%);background:#181818}
    .marker.route-point{position:relative;width:1px;height:1px;border:0;box-shadow:none;transform:none;background:transparent;pointer-events:none}
    .route-dot{position:absolute;left:0;top:0;width:18px;height:18px;box-sizing:border-box;border:2px solid white;border-radius:999px;background:#181818;box-shadow:0 1px 5px rgba(0,0,0,.24);transform:translate(-50%,-50%) scale(.7778);transition:transform ${motion.duration.quick}ms cubic-bezier(${motion.easing.out.join(',')})}
    .route-callout{position:absolute;left:0;bottom:15px;transform:translateX(-50%);white-space:nowrap;padding:5px 11px;border-radius:12px;background:white;color:#181818;box-shadow:0 2px 10px rgba(0,0,0,.16);font:650 15px/20px system-ui,-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-.15px}
    .route-callout.pickup{background:#FFD600}
    .route-callout-pointer{position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid white}
    .route-callout.pickup .route-callout-pointer{border-top-color:#FFD600}
    html.close-route-zoom .route-dot{transform:translate(-50%,-50%) scale(1)}
    html.close-route-zoom .route-callout{bottom:17px}
    .marker.passenger{background:#2684FF}
    .marker.driver{width:28px;height:40px;border:0;border-radius:0;box-shadow:none;background:transparent}
    @media (prefers-reduced-motion:reduce){.route-dot,.marker.driver{transition:none!important}}
  </style>
  <script src="https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    let map;
    let entities = [];
    const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apiReady = async () => {
      await ymaps3.ready;
      const {YMap,YMapDefaultSchemeLayer,YMapDefaultFeaturesLayer,YMapListener} = ymaps3;
      map = new YMap(document.getElementById('map'), {
        location:{center:[51.95842,56.04758],zoom:14},
        theme:'${colorScheme}',
        zoomRange:{min:6,max:17},
        showScaleInCopyrights:true
      }, [new YMapDefaultSchemeLayer({}),new YMapDefaultFeaturesLayer({})]);
      map.addChild(new YMapListener({
        layer:'any',
        onUpdate:({location})=>document.documentElement.classList.toggle('close-route-zoom',location.zoom>=15.5)
      }));
      ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
    };
    const marker = (kind,calloutLabel,heading,navigationMode) => {
      const el=document.createElement('div');
      const isRoutePoint=kind==='pickup'||kind==='destination';
      el.className='marker '+kind+(isRoutePoint?' route-point':'');
      el.setAttribute('role','img');
      el.setAttribute('aria-label',kind==='pickup'?'Место подачи':kind==='destination'?'Место назначения':kind==='passenger'?'Пассажир':'Водитель');
      if(isRoutePoint){
        const dot=document.createElement('div');
        dot.className='route-dot';
        el.appendChild(dot);
        if(calloutLabel){
          const callout=document.createElement('div');
          callout.className='route-callout '+kind;
          callout.textContent=calloutLabel;
          const pointer=document.createElement('div');
          pointer.className='route-callout-pointer';
          callout.appendChild(pointer);
          el.appendChild(callout);
        }
      }
      if(kind==='driver'){
        el.innerHTML=${JSON.stringify(driverMarkerSvgMarkup())};
        const rotation=navigationMode?0:(Number.isFinite(heading)?heading:0);
        el.style.transform='translate(-50%,-50%) rotate('+rotation+'deg)';
        el.style.transition='transform ${motion.duration.tracking}ms linear';
      }
      return el;
    };
    const project = (point) => {
      const latitude=Math.max(-85.05112878,Math.min(85.05112878,point.latitude));
      const sine=Math.sin(latitude*Math.PI/180);
      return [(point.longitude+180)/360,.5-Math.log((1+sine)/(1-sine))/(4*Math.PI)];
    };
    const unproject = ([x,y]) => [
      x*360-180,
      Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI
    ];
    const fitRouteLocation = (coordinates,margin) => {
      const mapElement=document.getElementById('map');
      if(!mapElement||coordinates.length<2) return null;
      const projected=coordinates.map(project);
      const xs=projected.map(([x])=>x);
      const ys=projected.map(([,y])=>y);
      const minimumX=Math.min(...xs);
      const maximumX=Math.max(...xs);
      const minimumY=Math.min(...ys);
      const maximumY=Math.max(...ys);
      const [top,right,bottom,left]=margin;
      const width=mapElement.clientWidth;
      const height=mapElement.clientHeight;
      const availableWidth=Math.max(32,width-left-right);
      const availableHeight=Math.max(32,height-top-bottom);
      const spanX=Math.max(maximumX-minimumX,Number.EPSILON);
      const spanY=Math.max(maximumY-minimumY,Number.EPSILON);
      const zoom=Math.max(6,Math.min(
        17,
        Math.log2(availableWidth/(256*spanX)),
        Math.log2(availableHeight/(256*spanY))
      ));
      const centerX=(minimumX+maximumX)/2;
      const centerY=(minimumY+maximumY)/2;
      return {center:unproject([centerX,centerY]),zoom};
    };
    const applyState = (state) => {
      if(!map) return;
      const colorScheme=state.colorScheme==='dark'?'dark':'light';
      document.documentElement.style.colorScheme=colorScheme;
      document.body.style.background=colorScheme==='dark'?'#202522':'#E9EFE7';
      map.update({theme:colorScheme});
      entities.forEach((entity)=>map.removeChild(entity));
      entities=[];
      const add=(entity)=>{map.addChild(entity);entities.push(entity)};
      const {YMapMarker,YMapFeature}=ymaps3;
      const insets=state.viewportInsets||{};
      const padding=18;
      const horizontalPadding=state.pickupEtaMinutes||state.destinationArrivalLabel?86:padding;
      const margin=[
        Math.max(0,insets.top||0)+padding,
        Math.max(0,insets.right||0)+horizontalPadding,
        Math.max(0,insets.bottom||0)+padding,
        Math.max(0,insets.left||0)+horizontalPadding
      ];
      map.update({margin});
      const routeCoordinates=Array.isArray(state.routeCoordinates)&&state.routeCoordinates.length>=2
        ?state.routeCoordinates
        :null;
      const pickupMarkerCoordinates=routeCoordinates
        ?state.routeTarget==='pickup'
          ?routeCoordinates[routeCoordinates.length-1]
          :routeCoordinates[0]
        :state.pickup&&state.pickup.coordinates;
      const destinationMarkerCoordinates=routeCoordinates
        ?routeCoordinates[routeCoordinates.length-1]
        :state.destination&&state.destination.coordinates;
      const pickupCallout=Number.isFinite(state.pickupEtaMinutes)&&state.pickupEtaMinutes>0
        ?Math.round(state.pickupEtaMinutes)+' мин'
        :undefined;
      if(state.pickup&&pickupMarkerCoordinates) add(new YMapMarker({coordinates:[pickupMarkerCoordinates.longitude,pickupMarkerCoordinates.latitude],zIndex:1100},marker('pickup',pickupCallout)));
      if(state.destination&&destinationMarkerCoordinates) add(new YMapMarker({coordinates:[destinationMarkerCoordinates.longitude,destinationMarkerCoordinates.latitude],zIndex:1100},marker('destination',state.destinationArrivalLabel||undefined)));
      const fallbackCoordinates=state.pickup&&state.destination
        ?[state.pickup.coordinates,state.destination.coordinates]
        :null;
      const visibleCoordinates=routeCoordinates||fallbackCoordinates;
      if(visibleCoordinates){
        if(routeCoordinates) add(new YMapFeature({
          geometry:{type:'LineString',coordinates:routeCoordinates.map(
            (point)=>[point.longitude,point.latitude]
          )},
          style:{simplificationRate:0,zIndex:1000,stroke:[{width:7,color:colorScheme==='dark'?'#31D17E':'#16B96B'}]}
        }));
        if(!state.followDriver){
          const location=fitRouteLocation(visibleCoordinates,margin);
          if(location) map.update({margin,location:{...location,duration:reduceMotion?0:${motion.duration.tracking}}});
        }
      }
      if(state.driver){
        add(new YMapMarker(
          {coordinates:[state.driver.longitude,state.driver.latitude],zIndex:1200},
          marker('driver',undefined,state.driverHeading,state.navigationMode)
        ));
        if(state.followDriver) map.update({
          margin,
          location:{
            center:[state.driver.longitude,state.driver.latitude],
            zoom:Number.isFinite(state.followZoom)
              ?Math.max(6,Math.min(17,state.followZoom))
              :state.navigationMode?17:16,
            duration:reduceMotion?0:${motion.duration.tracking},
            easing:'linear'
          },
          camera:state.navigationMode?{
            tilt:35*Math.PI/180,
            azimuth:Number.isFinite(state.driverHeading)?state.driverHeading*Math.PI/180:0,
            duration:reduceMotion?0:${motion.duration.tracking},
            easing:'linear'
          }:{tilt:0,azimuth:0,duration:reduceMotion?0:${motion.duration.tracking}}
        });
      }
      if(state.passenger) add(new YMapMarker({coordinates:[state.passenger.longitude,state.passenger.latitude],zIndex:32},marker('passenger')));
    };
    window.addEventListener('message',(event)=>{try{applyState(JSON.parse(event.data))}catch{}});
    document.addEventListener('message',(event)=>{try{applyState(JSON.parse(event.data))}catch{}});
    apiReady().catch((error)=>ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:error.message})));
  </script>
</body>
</html>`;
}

export function serializeNativeMapState(state: State): string {
  return JSON.stringify(state);
}

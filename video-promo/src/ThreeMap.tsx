import React, {useEffect, useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, interpolate, useVideoConfig} from 'remotion';
import * as THREE from 'three';

const yellow = '#F6C945';
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-3.8, .04, 5.1), new THREE.Vector3(-2.5, .04, 2.6),
  new THREE.Vector3(.8, .04, 1.6), new THREE.Vector3(2.5, .04, -1.3),
  new THREE.Vector3(3.5, .04, -5.1),
]);
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const buildings = [
  [-7,-6,2.2,2.5,1.9], [-3.7,-6,2.1,2.7,3.2], [-.5,-6,2.1,2.6,2.2], [6.5,-6,2,2.5,3],
  [-7,-2,2.2,2.5,2.4], [-3.8,-2,2,2.4,1.5], [-.5,-2.5,1.8,2,2.8], [6,-1.8,1.8,2.2,1.8],
  [-.3,5.4,2.2,2.4,1.2], [3.4,5.5,2.4,2.2,2.1], [7,3,2.2,2.2,3.5],
  [-2.5,9,2.6,2.5,3], [1,9,2.5,2.5,1.5], [5.5,9,2.5,2.5,2.5],
  [-6,-10,2.3,2.2,2.8], [-2,-10,2.4,2,1.4], [2,-10,2.5,2,2.2], [6,-10,2.3,2,2],
];

function Building({spec, index}: {spec: number[]; index: number}) {
  const [x,z,w,d,h] = spec;
  return <group position={[x,0,z]}>
    <mesh receiveShadow position={[0,.08,0]}><boxGeometry args={[w+.35,.16,d+.35]}/><meshStandardMaterial color="#D6D5C7" roughness={.9}/></mesh>
    <mesh castShadow receiveShadow position={[0,h/2+.16,0]}>
      <boxGeometry args={[w,h,d]}/><meshStandardMaterial color={index%3===0?'#C9CFBD':'#E8E2D0'} roughness={.75}/>
    </mesh>
    <mesh castShadow position={[0,h+.23,0]}><boxGeometry args={[w+.12,.14,d+.12]}/><meshStandardMaterial color="#FAF7ED" roughness={.6}/></mesh>
    <mesh castShadow position={[w*.15,h+.42,0]}><boxGeometry args={[w*.36,.25,d*.38]}/><meshStandardMaterial color="#BBBFB0"/></mesh>
    {[0,1,2].map(floor => [0,1,2].map(column => <group key={`${floor}:${column}`}>
      <mesh position={[-w*.3+column*w*.3,.55+floor*h*.28,d/2+.012]}>
        <boxGeometry args={[w*.16,h*.13,.035]}/><meshStandardMaterial color={floor===1&&column===1?'#FBE7A6':'#8FADAC'} metalness={.25} roughness={.3}/>
      </mesh>
      <mesh position={[w/2+.012,.55+floor*h*.28,-d*.3+column*d*.3]}>
        <boxGeometry args={[.035,h*.13,d*.16]}/><meshStandardMaterial color="#8FADAC" metalness={.25} roughness={.3}/>
      </mesh>
    </group>))}
  </group>;
}

function Destination({f}: {f: number}) {
  const y = 1.75 + Math.sin(f/23)*.12;
  return <group position={[3.5,0,-5.1]}>
    <mesh castShadow position={[0,.16,0]}><cylinderGeometry args={[.64,.77,.25,48]}/><meshStandardMaterial color={yellow} roughness={.35} metalness={.15}/></mesh>
    <mesh castShadow position={[0,.7,0]}><cylinderGeometry args={[.075,.095,1,24]}/><meshStandardMaterial color="#8E752E" metalness={.7} roughness={.25}/></mesh>
    <group position={[0,y,0]}>
      <mesh castShadow><sphereGeometry args={[.61,40,32]}/><meshStandardMaterial color={yellow} roughness={.25} metalness={.12}/></mesh>
      <mesh castShadow position={[0,-.56,0]} rotation={[0,0,Math.PI]}><coneGeometry args={[.43,.78,40]}/><meshStandardMaterial color={yellow} roughness={.25}/></mesh>
      <mesh position={[.12,.38,.53]} rotation={[-.62,.22,0]}><circleGeometry args={[.22,32]}/><meshStandardMaterial color="#282820" side={THREE.DoubleSide}/></mesh>
    </group>
  </group>;
}

function Car({progress}: {progress: number}) {
  const point=curve.getPoint(progress), tangent=curve.getTangent(progress);
  return <group position={[point.x,.24,point.z]} rotation={[0,Math.atan2(tangent.x,tangent.z),0]}>
    <mesh castShadow position={[0,.2,0]}><boxGeometry args={[.64,.28,1.3]}/><meshStandardMaterial color="#FFFFFF" metalness={.4} roughness={.23}/></mesh>
    <mesh castShadow position={[0,.43,-.08]}><boxGeometry args={[.54,.26,.68]}/><meshStandardMaterial color="#394D55" metalness={.7} roughness={.15}/></mesh>
    <mesh castShadow position={[0,.59,-.06]}><boxGeometry args={[.48,.06,.55]}/><meshStandardMaterial color="#FFFEF2"/></mesh>
    <mesh position={[0,.68,0]}><boxGeometry args={[.27,.13,.18]}/><meshStandardMaterial color={yellow}/></mesh>
    {[-1,1].map(side => [-.4,.4].map(z => <mesh key={`${side}:${z}`} castShadow position={[side*.32,.05,z]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.17,.17,.12,24]}/><meshStandardMaterial color="#272B2A" roughness={.85}/></mesh>))}
    {[-.23,.23].map(x=><mesh key={x} position={[x,.22,.66]}><boxGeometry args={[.13,.09,.02]}/><meshStandardMaterial color="#FFF3C8" emissive="#FFE6A0" emissiveIntensity={.25}/></mesh>)}
  </group>;
}

export const ThreeMap: React.FC<{f:number}> = ({f}) => {
  const {width,height} = useVideoConfig();
  const camera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-width/145,width/145,height/145,-height/145,.1,150) as THREE.OrthographicCamera & {manual: boolean};
    c.manual = true;
    c.position.set(8,17,18); c.lookAt(0,0,0); c.updateProjectionMatrix(); c.updateMatrixWorld(); return c;
  },[width,height]);
  const rotation=interpolate(f,[0,240],[-.16,.12],clamp);
  const progress=interpolate(f,[16,230],[0,1],clamp);
  const location=curve.getPoint(progress);
  const project=(point:THREE.Vector3) => {
    const screen=point.clone().applyAxisAngle(new THREE.Vector3(0,1,0),rotation).project(camera);
    return {left:(screen.x+1)*width/2,top:(1-screen.y)*height/2};
  };
  const label=project(new THREE.Vector3(location.x,.4,location.z));
  const destination=project(new THREE.Vector3(3.5,2.9,-5.1));
  return <AbsoluteFill>
    <ThreeCanvas width={width} height={height} camera={camera} shadows gl={{antialias:true,alpha:false}}>
      <color attach="background" args={['#E8E9DF']}/>
      <ambientLight intensity={1.1}/><hemisphereLight args={['#FFFFFF','#9C9985',1.1]}/>
      <directionalLight position={[-8,20,10]} intensity={3} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-bias={-.001}/>
      <group rotation={[0,rotation,0]}>
        <mesh receiveShadow rotation={[-Math.PI/2,0,0]}><planeGeometry args={[100,100]}/><meshStandardMaterial color="#E5E6DA" roughness={1}/></mesh>
        {[-8,-4,0,4,8,12].map(z=><mesh key={z} receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,.01,z]}><planeGeometry args={[60,1.2]}/><meshStandardMaterial color="#FAF8EF"/></mesh>)}
        {[-9,-5,3,9].map(x=><mesh key={x} receiveShadow rotation={[-Math.PI/2,0,0]} position={[x,.012,0]}><planeGeometry args={[1.1,60]}/><meshStandardMaterial color="#FAF8EF"/></mesh>)}
        {buildings.map((spec,index)=><Building key={index} spec={spec} index={index}/>)}
        {[-6,-2,2,6].map((x,i)=><group key={x} position={[x,0,i%2===0?7:-8]}>
          <mesh castShadow position={[0,.35,0]}><cylinderGeometry args={[.09,.12,.7,12]}/><meshStandardMaterial color="#A48F6A"/></mesh>
          <mesh castShadow position={[0,.95,0]}><sphereGeometry args={[.55,24,16]}/><meshStandardMaterial color="#91AD75" roughness={.8}/></mesh>
        </group>)}
        <mesh position={[0,.03,0]} scale={[1,.1,1]}><tubeGeometry args={[curve,100,.3,10,false]}/><meshStandardMaterial color="#FFFFFF"/></mesh>
        <mesh position={[0,.08,0]} scale={[1,.1,1]}><tubeGeometry args={[curve,100,.17,10,false]}/><meshStandardMaterial color={yellow} roughness={.6}/></mesh>
        {[0,1].map(index=>{const phase=(f/45+index/2)%1;return <mesh key={index} rotation={[-Math.PI/2,0,0]} position={[location.x,.25,location.z]} scale={1+phase*2.6}>
          <ringGeometry args={[.29,.32,64]}/><meshBasicMaterial color="#298CF2" transparent opacity={(1-phase)*.8} depthWrite={false}/>
        </mesh>;})}
        <mesh position={[location.x,.27,location.z]}><sphereGeometry args={[.23,32,24]}/><meshStandardMaterial color="#268AF0" emissive="#268AF0" emissiveIntensity={.2}/></mesh>
        <Destination f={f}/><Car progress={progress}/>
      </group>
    </ThreeCanvas>
    <div style={{position:'absolute',...label,translate:'-50% 35px',padding:'15px 23px',borderRadius:20,background:'white',color:'#2469AD',fontSize:28,fontWeight:800,boxShadow:'0 10px 24px #0002'}}>Вы здесь</div>
    <div style={{position:'absolute',...destination,translate:'-50% -110%',padding:'13px 22px',borderRadius:20,background:'#282820',color:'white',fontSize:26,fontWeight:750,boxShadow:'0 10px 24px #0002'}}>Место назначения</div>
  </AbsoluteFill>;
};

function plateTexture() {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#FFFEF5'; ctx.fillRect(0,0,512,512);
  ctx.fillStyle='#FFFFFF'; ctx.fillRect(20,173,472,166);
  ctx.strokeStyle='#29312C'; ctx.lineWidth=4; ctx.strokeRect(20,173,472,166);
  ctx.beginPath();ctx.moveTo(390,173);ctx.lineTo(390,339);ctx.stroke();
  ctx.fillStyle='#202820';ctx.font='800 82px TaxiManrope, sans-serif';ctx.textAlign='center';ctx.fillText('А123АА',203,282,345);
  ctx.font='800 71px TaxiManrope, sans-serif';ctx.fillText('18',440,260);
  ctx.font='700 20px TaxiManrope, sans-serif';ctx.fillText('RUS',438,307);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export const ThreeMagnifier:React.FC<{f:number}> = ({f}) => {
  const texture=useMemo(plateTexture,[]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <ThreeCanvas width={440} height={500} orthographic camera={{position:[0,0,7],zoom:110}} gl={{alpha:true,antialias:true}} style={{width:440,height:500}}>
    <ambientLight intensity={1.5}/><directionalLight position={[-3,6,7]} intensity={5}/><directionalLight position={[5,-2,2]} intensity={1.5}/>
    <group position={[-.18,.3,0]} rotation={[.06,-.12,Math.sin(f/35)*.025]}>
      <mesh position={[0,0,-.055]}><circleGeometry args={[1.25,96]}/><meshBasicMaterial map={texture}/></mesh>
      <mesh><torusGeometry args={[1.3,.095,20,96]}/><meshStandardMaterial color="#C9CED0" metalness={.8} roughness={.22}/></mesh>
      <mesh position={[0,0,.025]}><torusGeometry args={[1.22,.025,16,96]}/><meshStandardMaterial color="#FFFFFF" metalness={.5} roughness={.2}/></mesh>
      <mesh position={[0,0,.055]}><circleGeometry args={[1.2,96]}/><meshPhysicalMaterial color="#E8F3FF" transparent opacity={.07} roughness={.03} metalness={.25} clearcoat={1}/></mesh>
      <group position={[1.05,-1.05,0]} rotation={[0,0,Math.PI/4]}>
        <mesh position={[0,-.19,0]}><cylinderGeometry args={[.1,.1,.55,32]}/><meshStandardMaterial color="#BCC5C7" metalness={.75} roughness={.25}/></mesh>
        <mesh position={[0,-.78,0]}><capsuleGeometry args={[.16,.76,12,32]}/><meshStandardMaterial color="#333931" metalness={.25} roughness={.35}/></mesh>
      </group>
    </group>
  </ThreeCanvas>;
};

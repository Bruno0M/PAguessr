import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { SIGNPOST_POSITION } from './layout';
import { createSignTexture, glowColor } from './textures';

const SIGN_LENGTH = 1.3;
const SIGN_HEIGHT = 0.32;

let arrowGeometry: THREE.ExtrudeGeometry | null = null;

function getArrowGeometry(): THREE.ExtrudeGeometry {
  if (arrowGeometry) return arrowGeometry;
  const h = SIGN_HEIGHT / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -h);
  shape.lineTo(SIGN_LENGTH - 0.2, -h);
  shape.lineTo(SIGN_LENGTH, 0);
  shape.lineTo(SIGN_LENGTH - 0.2, h);
  shape.lineTo(0, h);
  shape.closePath();
  arrowGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  arrowGeometry.translate(0, 0, -0.025);
  return arrowGeometry;
}

export interface SignAction {
  label: string;
  onSelect: () => void;
}

function Sign({
  action,
  y,
  tilt,
  onHover,
}: {
  action: SignAction;
  y: number;
  tilt: number;
  onHover: (hovered: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const texture = useMemo(() => createSignTexture(action.label), [action.label]);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    const target = hovered ? 1.08 : 1;
    if (groupRef.current) {
      const s = THREE.MathUtils.damp(groupRef.current.scale.x, target, 12, delta);
      groupRef.current.scale.setScalar(s);
    }
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = THREE.MathUtils.damp(
        materialRef.current.emissiveIntensity,
        hovered ? 0.9 : 0.25,
        10,
        delta
      );
    }
  });

  const setHover = (value: boolean) => {
    setHovered(value);
    onHover(value);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    action.onSelect();
  };

  return (
    <group
      ref={groupRef}
      position={[0.02, y, 0]}
      rotation-y={tilt}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <mesh geometry={getArrowGeometry()}>
        <meshPhysicalMaterial
          ref={materialRef}
          color="#1395aa"
          emissive="#2fd6ec"
          emissiveIntensity={0.25}
          metalness={0.3}
          roughness={0.25}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>
      <mesh position={[SIGN_LENGTH * 0.46, 0, 0.052]}>
        <planeGeometry args={[SIGN_LENGTH * 0.86, SIGN_HEIGHT * 0.86]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
      <mesh position={[SIGN_LENGTH * 0.46, 0, -0.052]} rotation-y={Math.PI}>
        <planeGeometry args={[SIGN_LENGTH * 0.86, SIGN_HEIGHT * 0.86]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Signpost({
  actions,
  onHover,
}: {
  actions: SignAction[];
  onHover: (hovered: boolean) => void;
}) {
  const topY = 1.75;
  const tilts = [0.12, -0.08, 0.06];

  return (
    <group
      position={[SIGNPOST_POSITION[0], 0, SIGNPOST_POSITION[1]]}
      rotation-y={-0.3}
      scale={1.18}
    >
      <mesh position-y={1.02}>
        <cylinderGeometry args={[0.045, 0.055, 2.04, 12]} />
        <meshStandardMaterial color="#27405a" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position-y={2.06}>
        <sphereGeometry args={[0.07, 16, 12]} />
        <meshBasicMaterial color={glowColor('#4fe3ff', 3)} toneMapped={false} />
      </mesh>
      <mesh position-y={0.03}>
        <cylinderGeometry args={[0.16, 0.2, 0.06, 16]} />
        <meshStandardMaterial color="#27405a" metalness={0.8} roughness={0.35} />
      </mesh>
      {actions.map((action, i) => (
        <Sign
          key={action.label}
          action={action}
          y={topY - i * 0.42}
          tilt={tilts[i % tilts.length]}
          onHover={onHover}
        />
      ))}
    </group>
  );
}

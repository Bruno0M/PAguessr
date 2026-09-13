import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import { createNumeralTexture } from './textures';
import { clamp01, easeOutBack } from './motion';

const WIDTH = 1.55;
const DEPTH = 1.45;
const RISE_DURATION = 0.75;

export function Pedestal({
  place,
  x,
  height,
  color,
  riseDelay,
  reducedMotion,
  children,
}: {
  place: 1 | 2 | 3;
  x: number;
  height: number;
  color: string;
  riseDelay: number;
  reducedMotion: boolean;
  children?: ReactNode;
}) {
  const riseRef = useRef<THREE.Group>(null);
  const numeral = useMemo(() => createNumeralTexture(place, color), [place, color]);
  const numeralSize = Math.min(0.95, height * 0.9);

  useEffect(() => () => numeral.dispose(), [numeral]);

  useFrame((state) => {
    if (!riseRef.current) return;
    if (reducedMotion) {
      riseRef.current.position.y = 0;
      return;
    }
    const progress = clamp01((state.clock.elapsedTime - riseDelay) / RISE_DURATION);
    riseRef.current.position.y = -(height + 0.05) * (1 - easeOutBack(progress));
  });

  return (
    <group position={[x, 0, 0]}>
      <group ref={riseRef} position={[0, reducedMotion ? 0 : -(height + 0.05), 0]}>
        <RoundedBox
          args={[WIDTH, height, DEPTH]}
          radius={0.08}
          smoothness={4}
          position={[0, height / 2, 0]}
        >
          <meshStandardMaterial color="#1b3652" roughness={0.55} metalness={0.2} />
        </RoundedBox>
        <RoundedBox
          args={[WIDTH + 0.06, 0.1, DEPTH + 0.06]}
          radius={0.04}
          smoothness={3}
          position={[0, height - 0.02, 0]}
        >
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.3}
            metalness={0.85}
            roughness={0.25}
          />
        </RoundedBox>
        <mesh position={[0, height / 2 - 0.03, DEPTH / 2 + 0.012]}>
          <planeGeometry args={[numeralSize, numeralSize]} />
          <meshBasicMaterial map={numeral} transparent toneMapped={false} />
        </mesh>
        <group position={[0, height + 0.03, 0]}>{children}</group>
      </group>
    </group>
  );
}

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import { getDigitGeometry, getLaurelLeafGeometry } from './geometry';
import { MEDAL, PEDESTAL_DEPTH, PEDESTAL_WIDTH } from './layout';
import { clamp01, easeOutBack } from './motion';
import { glowColor } from './textures';

const RISE_DURATION = 0.75;

function Laurel({ color }: { color: string }) {
  const leaves = useMemo(() => {
    const result: { position: [number, number, number]; rotation: number; scale: number }[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i += 1) {
        const angle = -Math.PI / 2 + 0.35 + i * 0.36;
        const radius = 0.44;
        result.push({
          position: [side * Math.cos(angle) * radius, Math.sin(angle) * radius + 0.02, 0],
          // Folha deitada na tangente do arco, levemente aberta pra fora.
          rotation: side * (angle + 0.45),
          scale: 0.2 - i * 0.012,
        });
      }
    }
    return result;
  }, []);

  return (
    <group>
      {leaves.map((leaf, i) => (
        <mesh
          key={i}
          geometry={getLaurelLeafGeometry()}
          position={leaf.position}
          rotation-z={leaf.rotation}
          scale={[leaf.scale, leaf.scale * 1.15, leaf.scale]}
        >
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.25}
            metalness={1}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Pedestal({
  place,
  x,
  z,
  height,
  riseDelay,
  reducedMotion,
  onSelect,
  onHover,
  children,
}: {
  place: 1 | 2 | 3;
  x: number;
  z: number;
  height: number;
  riseDelay: number;
  reducedMotion: boolean;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
  children?: ReactNode;
}) {
  const riseRef = useRef<THREE.Group>(null);
  const medal = MEDAL[place];
  const digitHeight = Math.min(0.8, height * 0.56);
  const edge = glowColor(medal.glow, place === 1 ? 3.4 : 2.4);

  useFrame((state) => {
    if (!riseRef.current) return;
    if (reducedMotion) {
      riseRef.current.position.y = 0;
      return;
    }
    const progress = clamp01((state.clock.elapsedTime - riseDelay) / RISE_DURATION);
    riseRef.current.position.y = -(height + 0.05) * (1 - easeOutBack(progress));
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect?.();
  };

  const frontZ = PEDESTAL_DEPTH / 2;
  const half = PEDESTAL_WIDTH / 2;

  return (
    <group position={[x, 0, z]}>
      <group
        ref={riseRef}
        position={[0, reducedMotion ? 0 : -(height + 0.05), 0]}
        onClick={onSelect ? handleClick : undefined}
        onPointerOver={onHover ? () => onHover(true) : undefined}
        onPointerOut={onHover ? () => onHover(false) : undefined}
      >
        <RoundedBox
          args={[PEDESTAL_WIDTH, height, PEDESTAL_DEPTH]}
          radius={0.09}
          smoothness={5}
          position={[0, height / 2, 0]}
        >
          <meshStandardMaterial
            color={medal.metal}
            metalness={1}
            roughness={0.28}
            envMapIntensity={1.8}
            emissive={medal.metal}
            emissiveIntensity={0.08}
          />
        </RoundedBox>

        {/* Frisos luminosos: borda do topo e as duas quinas da frente. */}
        {[
          {
            position: [0, height + 0.005, frontZ - 0.02],
            size: [PEDESTAL_WIDTH - 0.1, 0.035, 0.035],
          },
          {
            position: [0, height + 0.005, -frontZ + 0.02],
            size: [PEDESTAL_WIDTH - 0.1, 0.035, 0.035],
          },
          {
            position: [half - 0.02, height + 0.005, 0],
            size: [0.035, 0.035, PEDESTAL_DEPTH - 0.1],
          },
          {
            position: [-half + 0.02, height + 0.005, 0],
            size: [0.035, 0.035, PEDESTAL_DEPTH - 0.1],
          },
          {
            position: [half - 0.015, height / 2, frontZ - 0.015],
            size: [0.022, height - 0.12, 0.022],
          },
          {
            position: [-half + 0.015, height / 2, frontZ - 0.015],
            size: [0.022, height - 0.12, 0.022],
          },
        ].map((strip, i) => (
          <mesh key={i} position={strip.position as [number, number, number]}>
            <boxGeometry args={strip.size as [number, number, number]} />
            <meshBasicMaterial color={edge} toneMapped={false} />
          </mesh>
        ))}

        <group position={[0, height * 0.5, frontZ + 0.07]}>
          <mesh geometry={getDigitGeometry(place)} scale={digitHeight}>
            <meshStandardMaterial
              color={medal.glow}
              emissive={medal.glow}
              emissiveIntensity={0.12}
              metalness={1}
              roughness={0.12}
              envMapIntensity={2.4}
            />
          </mesh>
          {place === 1 && (
            <group scale={digitHeight / 0.62}>
              <Laurel color={medal.glow} />
            </group>
          )}
        </group>

        <group position={[0, height + 0.03, 0]}>{children}</group>
      </group>
    </group>
  );
}

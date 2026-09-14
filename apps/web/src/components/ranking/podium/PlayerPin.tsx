import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ApiRankingEntry } from '../../../api/ranking';
import { getAvatarColor } from '../../auth/avatarDefs';
import {
  getAvatarSymbolGeometry,
  getPinGeometry,
  PIN_DEPTH,
  PIN_HEAD_OFFSET,
  PIN_HEIGHT,
  PIN_HOLE_RADIUS,
  SYMBOL_EXTENT,
} from './geometry';
import { clamp01, easeOutBounce } from './motion';
import { createBeamTexture, createGlowTexture, glowColor } from './textures';

const HOVER = 0.04;
const DROP_HEIGHT = 5;
const DROP_DURATION = 0.9;
const SYMBOL_SCALE = (PIN_HOLE_RADIUS - 0.24) / SYMBOL_EXTENT;
const BEAM_HEIGHT = 1.9;

function formatScore(score: number): string {
  return score.toLocaleString('pt-BR');
}

// Brilho de palco na base do pin: poça de luz no topo do pedestal + feixe.
function StageGlow({ color, strength }: { color: string; strength: number }) {
  const glow = useMemo(createGlowTexture, []);
  const beam = useMemo(createBeamTexture, []);
  useEffect(
    () => () => {
      glow.dispose();
      beam.dispose();
    },
    [glow, beam]
  );

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <planeGeometry args={[1.5, 1.2]} />
        <meshBasicMaterial
          map={glow}
          color={glowColor(color, strength)}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {[0, Math.PI / 2].map((angle) => (
        <mesh key={angle} position-y={BEAM_HEIGHT / 2} rotation-y={angle}>
          <planeGeometry args={[1.1, BEAM_HEIGHT]} />
          <meshBasicMaterial
            map={beam}
            color={glowColor(color, strength * 0.45)}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function PlayerPin({
  entry,
  scale,
  medalColor,
  dropDelay,
  stagger,
  isCurrentUser,
  isWinner,
  reducedMotion,
  onSelect,
  onHover,
}: {
  entry: ApiRankingEntry;
  scale: number;
  medalColor: string;
  dropDelay: number;
  stagger: number;
  isCurrentUser: boolean;
  isWinner: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const color = getAvatarColor(entry.avatarId);
  const symbol = getAvatarSymbolGeometry(entry.avatarId);
  const dropRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const dropStart = useRef<number | null>(null);
  const [landed, setLanded] = useState(reducedMotion);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Na abertura o pin espera o pedestal subir; numa troca de aba (pin
    // remontado) cai logo, só com o escalonamento entre as posições.
    if (dropStart.current === null) dropStart.current = Math.max(dropDelay, t + stagger);

    const progress = reducedMotion ? 1 : clamp01((t - dropStart.current) / DROP_DURATION);
    if (dropRef.current) dropRef.current.position.y = (1 - easeOutBounce(progress)) * DROP_HEIGHT;
    if (progress >= 1 && !landed) setLanded(true);

    if (bodyRef.current && !reducedMotion) {
      bodyRef.current.rotation.y = Math.sin(t * 0.6 + stagger * 4) * 0.28;
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <group>
      {landed && (
        <StageGlow color={isWinner ? '#ffc75a' : medalColor} strength={isWinner ? 1.6 : 0.9} />
      )}

      <group ref={dropRef} position={[0, reducedMotion ? 0 : DROP_HEIGHT, 0]}>
        <group
          ref={bodyRef}
          position={[0, HOVER, 0]}
          scale={scale}
          onClick={handleClick}
          onPointerOver={() => onHover(true)}
          onPointerOut={() => onHover(false)}
        >
          <mesh geometry={getPinGeometry()}>
            <meshPhysicalMaterial
              color={color}
              roughness={0.18}
              metalness={0.1}
              clearcoat={1}
              clearcoatRoughness={0.06}
              emissive={color}
              emissiveIntensity={0.08}
            />
          </mesh>
          <mesh position={[0, PIN_HEAD_OFFSET, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[PIN_HOLE_RADIUS + 0.02, PIN_HOLE_RADIUS + 0.02, PIN_DEPTH + 0.26, 48]}
            />
            <meshPhysicalMaterial
              color="#040d18"
              roughness={0.08}
              metalness={0.4}
              clearcoat={1}
              clearcoatRoughness={0.04}
            />
          </mesh>
          {symbol &&
            [1, -1].map((side) => (
              <mesh
                key={side}
                geometry={symbol}
                position={[0, PIN_HEAD_OFFSET, side * (PIN_DEPTH / 2 + 0.16)]}
                rotation={[0, side === 1 ? 0 : Math.PI, 0]}
                scale={SYMBOL_SCALE}
              >
                <meshBasicMaterial color={glowColor('#ffffff', 1.4)} toneMapped={false} />
              </mesh>
            ))}
        </group>
      </group>

      <Html
        position={[0, HOVER + PIN_HEIGHT * scale + 0.16, 0]}
        center
        zIndexRange={[20, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`pin-tag${landed ? ' is-visible' : ''}${isCurrentUser ? ' is-me' : ''}`}
          data-place={entry.position}
          style={{ '--tag-color': medalColor } as CSSProperties}
        >
          {isCurrentUser && <span className="pin-tag-you">Você</span>}
          <span className="pin-tag-nick">{entry.nick}</span>
          <span className="pin-tag-score">
            {formatScore(entry.score)} <small>pts</small>
          </span>
        </div>
      </Html>
    </group>
  );
}

// Pedestal sem jogador: pin de vidro na cor da medalha, com o furo aparente.
export function GhostPin({
  scale,
  medalColor,
  onSelect,
  onHover,
}: {
  scale: number;
  medalColor: string;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <group>
      <StageGlow color={medalColor} strength={0.55} />
      <group
        position={[0, HOVER, 0]}
        scale={scale}
        onClick={handleClick}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
      >
        <mesh geometry={getPinGeometry()}>
          <meshPhysicalMaterial
            color={medalColor}
            emissive={medalColor}
            emissiveIntensity={0.18}
            metalness={0.25}
            roughness={0.06}
            clearcoat={1}
            transparent
            opacity={0.42}
            depthWrite={false}
          />
        </mesh>
      </group>
      <Html
        position={[0, HOVER + PIN_HEIGHT * scale + 0.22, 0]}
        center
        zIndexRange={[20, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="pin-tag-empty">Vago</span>
      </Html>
    </group>
  );
}

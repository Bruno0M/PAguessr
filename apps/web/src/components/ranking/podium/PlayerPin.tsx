import { useRef, useState, type CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
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

const HOVER = 0.14;
const DROP_HEIGHT = 5;
const DROP_DURATION = 0.9;
const SYMBOL_SCALE = (PIN_HOLE_RADIUS - 0.14) / SYMBOL_EXTENT;
const CURRENT_USER_COLOR = '#40cddd';

function formatScore(score: number): string {
  return score.toLocaleString('pt-BR');
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
}: {
  entry: ApiRankingEntry;
  scale: number;
  medalColor: string;
  dropDelay: number;
  stagger: number;
  isCurrentUser: boolean;
  isWinner: boolean;
  reducedMotion: boolean;
}) {
  const color = getAvatarColor(entry.avatarId);
  const symbol = getAvatarSymbolGeometry(entry.avatarId);
  const dropRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dropStart = useRef<number | null>(null);
  const [landed, setLanded] = useState(reducedMotion);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Na abertura da tela o pin espera o pedestal subir; numa troca de aba
    // (pin remontado) cai logo, só com o escalonamento entre as posições.
    if (dropStart.current === null) dropStart.current = Math.max(dropDelay, t + stagger);

    const progress = reducedMotion ? 1 : clamp01((t - dropStart.current) / DROP_DURATION);
    if (dropRef.current) dropRef.current.position.y = (1 - easeOutBounce(progress)) * DROP_HEIGHT;
    if (progress >= 1 && !landed) setLanded(true);

    if (bodyRef.current && !reducedMotion) {
      bodyRef.current.rotation.y = Math.sin(t * 0.7 + stagger * 4) * 0.45;
      bodyRef.current.position.y =
        HOVER + (progress >= 1 ? Math.sin(t * 1.6 + stagger * 2) * 0.05 : 0);
    }

    if (ringRef.current && ringMaterialRef.current) {
      const pulse = isWinner && !reducedMotion && progress >= 1 ? (t * 0.8) % 1 : 0;
      ringRef.current.scale.setScalar(1 + pulse * 0.7);
      ringMaterialRef.current.opacity = progress >= 1 ? 0.9 * (1 - pulse) : 0;
    }
  });

  const ringColor = isCurrentUser ? CURRENT_USER_COLOR : color;
  const labelY = HOVER + PIN_HEIGHT * scale + 0.14;

  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <torusGeometry args={[0.5, 0.03, 10, 64]} />
        <meshBasicMaterial ref={ringMaterialRef} color={ringColor} transparent toneMapped={false} />
      </mesh>

      <group ref={dropRef} position={[0, reducedMotion ? 0 : DROP_HEIGHT, 0]}>
        <group ref={bodyRef} position={[0, HOVER, 0]} scale={scale}>
          <mesh geometry={getPinGeometry()}>
            <meshPhysicalMaterial
              color={color}
              roughness={0.28}
              metalness={0.05}
              clearcoat={1}
              clearcoatRoughness={0.12}
            />
          </mesh>
          <mesh position={[0, PIN_HEAD_OFFSET, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[PIN_HOLE_RADIUS - 0.06, PIN_HOLE_RADIUS - 0.06, PIN_DEPTH + 0.12, 48]}
            />
            <meshStandardMaterial color="#0d1f33" roughness={0.45} metalness={0.2} />
          </mesh>
          {symbol &&
            [1, -1].map((side) => (
              <mesh
                key={side}
                geometry={symbol}
                position={[0, PIN_HEAD_OFFSET, side * (PIN_DEPTH / 2 + 0.08)]}
                rotation={[0, side === 1 ? 0 : Math.PI, 0]}
                scale={SYMBOL_SCALE}
              >
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.5}
                  roughness={0.35}
                />
              </mesh>
            ))}
        </group>
      </group>

      <Html
        position={[0, labelY, 0]}
        center
        zIndexRange={[20, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`pin-tag${landed ? ' is-visible' : ''}${isCurrentUser ? ' is-me' : ''}`}
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

export function GhostPin({ scale }: { scale: number }) {
  return (
    <group>
      <group position={[0, HOVER, 0]} scale={scale}>
        <mesh geometry={getPinGeometry()}>
          <meshStandardMaterial
            color="#40cddd"
            emissive="#40cddd"
            emissiveIntensity={0.5}
            transparent
            opacity={0.14}
            depthWrite={false}
          />
        </mesh>
      </group>
      <Html
        position={[0, HOVER + PIN_HEIGHT * scale + 0.32, 0]}
        center
        zIndexRange={[20, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="pin-tag-empty">Vago</span>
      </Html>
    </group>
  );
}

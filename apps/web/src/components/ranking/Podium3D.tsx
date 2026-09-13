import { useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import type { ApiRankingEntry } from '../../api/ranking';
import { AvatarSvg } from '../auth/avatars';
import { Island } from './podium/Island';
import { Pedestal } from './podium/Pedestal';
import { GhostPin, PlayerPin } from './podium/PlayerPin';
import { prefersReducedMotion } from './podium/motion';
import './Podium3D.css';

const FOV = 35;

const SLOTS = [
  { place: 3 as const, x: 2.05, height: 0.75, color: '#e59a5c', pinScale: 0.58, riseDelay: 0.15 },
  { place: 2 as const, x: -2.05, height: 1.05, color: '#cfdbe6', pinScale: 0.58, riseDelay: 0.35 },
  { place: 1 as const, x: 0, height: 1.5, color: '#ffd166', pinScale: 0.72, riseDelay: 0.55 },
];

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const size = useThree((state) => state.size);
  const target = useMemo(() => new THREE.Vector3(0, 0.9, 0), []);

  useFrame((state, delta) => {
    const aspect = size.width / size.height;
    // Garante a ilha inteira na largura mesmo em tela de celular.
    const fitDistance = 4.5 / (Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect);
    const distance = Math.max(14.5, fitDistance);
    const t = state.clock.elapsedTime;
    const goalX = reducedMotion ? 0 : Math.sin(t * 0.22) * 0.8 + state.pointer.x * 1.2;
    const goalY = distance * 0.46 + (reducedMotion ? 0 : state.pointer.y * 0.5);
    const { position } = state.camera;

    if (reducedMotion) {
      position.set(goalX, goalY, distance);
    } else {
      position.x = THREE.MathUtils.damp(position.x, goalX, 2.2, delta);
      position.y = THREE.MathUtils.damp(position.y, goalY, 2.2, delta);
      position.z = THREE.MathUtils.damp(position.z, distance, 1.8, delta);
    }
    state.camera.lookAt(target);
  });

  return null;
}

function PodiumFallback({ entries }: { entries: ApiRankingEntry[] }) {
  return (
    <ol className="podium-fallback">
      {entries.map((entry) => (
        <li key={entry.userId}>
          <b>{entry.position}º</b>
          <AvatarSvg id={entry.avatarId} className="podium-fallback-avatar" />
          <span>{entry.nick}</span>
          <span>{entry.score.toLocaleString('pt-BR')} pts</span>
        </li>
      ))}
    </ol>
  );
}

export function Podium3D({
  entries,
  currentUserId,
  periodKey,
}: {
  entries: ApiRankingEntry[];
  currentUserId?: string;
  periodKey: string;
}) {
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const hasWinner = Boolean(entries[0]);

  return (
    <div className="podium-3d">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: FOV, position: [0, 6.5, 18] }}
        gl={{ antialias: true, alpha: true }}
        fallback={<PodiumFallback entries={entries} />}
      >
        <CameraRig reducedMotion={reducedMotion} />

        <hemisphereLight args={['#8fd3ec', '#0a1522', 0.6]} />
        <directionalLight position={[4, 8, 6]} intensity={1.8} color="#fff4e0" />
        <directionalLight position={[-6, 3, -5]} intensity={1.3} color="#40cddd" />
        <directionalLight position={[0, -6, 8]} intensity={0.9} color="#3fa9c9" />
        {hasWinner && (
          <pointLight position={[0, 3.8, 1.4]} intensity={9} distance={6} color="#ffd166" />
        )}

        <Environment resolution={128} frames={1}>
          <Lightformer intensity={3} color="#d6f2ff" position={[0, 6, 4]} scale={[10, 3, 1]} />
          <Lightformer intensity={2} color="#3ee3ad" position={[-6, 2, 3]} scale={[3, 3, 1]} />
          <Lightformer intensity={1.6} color="#40cddd" position={[6, 1, -3]} scale={[4, 4, 1]} />
        </Environment>

        <Island reducedMotion={reducedMotion} />

        {SLOTS.map((slot, order) => {
          const entry = entries[slot.place - 1];
          return (
            <Pedestal
              key={slot.place}
              place={slot.place}
              x={slot.x}
              height={slot.height}
              color={slot.color}
              riseDelay={slot.riseDelay}
              reducedMotion={reducedMotion}
            >
              {entry ? (
                <PlayerPin
                  key={`${periodKey}-${entry.userId}`}
                  entry={entry}
                  scale={slot.pinScale}
                  medalColor={slot.color}
                  dropDelay={1.05 + order * 0.2}
                  stagger={order * 0.15}
                  isCurrentUser={entry.userId === currentUserId}
                  isWinner={slot.place === 1}
                  reducedMotion={reducedMotion}
                />
              ) : (
                <GhostPin scale={slot.pinScale} />
              )}
              {slot.place === 1 && entry && (
                <Sparkles
                  count={36}
                  position={[0, 1.4, 0]}
                  scale={[1.8, 2.6, 1.8]}
                  size={4}
                  speed={reducedMotion ? 0 : 0.35}
                  color="#ffd166"
                />
              )}
            </Pedestal>
          );
        })}

        <ContactShadows
          position={[0, 0.006, 0]}
          scale={9}
          resolution={512}
          blur={2.4}
          opacity={0.7}
          far={4}
          color="#02070d"
        />
        <Sparkles
          count={70}
          position={[0, 2.2, 0]}
          scale={[12, 6, 10]}
          size={1.6}
          speed={reducedMotion ? 0 : 0.2}
          color="#7fdcea"
          opacity={0.4}
        />
      </Canvas>
    </div>
  );
}

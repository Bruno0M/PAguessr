import { useCallback, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, Sparkles } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { ApiRankingEntry } from '../../api/ranking';
import { AvatarSvg } from '../auth/avatars';
import { Landmarks } from './podium/Landmarks';
import { MEDAL, PODIUM_SLOTS, PODIUM_Z } from './podium/layout';
import { prefersReducedMotion } from './podium/motion';
import { Pedestal } from './podium/Pedestal';
import { Platform } from './podium/Platform';
import { GhostPin, PlayerPin } from './podium/PlayerPin';
import { Scenery } from './podium/Scenery';
import { Signpost, type SignAction } from './podium/Signpost';
import './Podium3D.css';
import { ARENA, CREAM, NIGHT, SKY, SUN, SUN_SOFT } from './podium/palette';

const FOV = 30;
const RISE_ORDER: Record<1 | 2 | 3, number> = { 3: 0, 2: 1, 1: 2 };

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const size = useThree((state) => state.size);
  const target = useMemo(() => new THREE.Vector3(0, 1.75, 0.3), []);

  useFrame((state, delta) => {
    const aspect = size.width / size.height;
    // Em tela em pé o HUD ocupa duas linhas: mirar mais alto desce a cena.
    target.y = aspect < 1 ? 1.75 + (1 - aspect) * 5 : 1.75;
    // Garante o disco inteiro na largura, inclusive em tela de celular.
    const fitDistance = 5.7 / (Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect);
    const distance = Math.max(16, fitDistance);
    const t = state.clock.elapsedTime;
    const goalX = reducedMotion ? 0 : Math.sin(t * 0.2) * 0.45 + state.pointer.x * 0.8;
    const goalY = distance * 0.32 + (reducedMotion ? 0 : state.pointer.y * 0.35);
    const { position } = state.camera;

    if (reducedMotion) {
      position.set(goalX, goalY, distance);
    } else {
      position.x = THREE.MathUtils.damp(position.x, goalX, 2, delta);
      position.y = THREE.MathUtils.damp(position.y, goalY, 2, delta);
      position.z = THREE.MathUtils.damp(position.z, distance, 1.6, delta);
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
  onPlayRanked,
  onGoHome,
  onOpenGeral,
}: {
  entries: ApiRankingEntry[];
  currentUserId?: string;
  periodKey: string;
  onPlayRanked: () => void;
  onGoHome: () => void;
  onOpenGeral: () => void;
}) {
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const highQuality = useMemo(() => typeof window !== 'undefined' && window.innerWidth >= 768, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverCount = useRef(0);

  // Contador em ref (sem estado) pra trocar o cursor sem re-renderizar a cena.
  const handleHover = useCallback((hovered: boolean) => {
    hoverCount.current = Math.max(0, hoverCount.current + (hovered ? 1 : -1));
    if (containerRef.current) {
      containerRef.current.style.cursor = hoverCount.current > 0 ? 'pointer' : '';
    }
  }, []);

  const signActions = useMemo<SignAction[]>(
    () => [
      { label: 'PAULO AFONSO', onSelect: onGoHome },
      { label: 'GERAL', onSelect: onOpenGeral },
      { label: 'JOGAR', onSelect: onPlayRanked },
    ],
    [onGoHome, onOpenGeral, onPlayRanked]
  );

  const hasWinner = Boolean(entries[0]);

  return (
    <div className="podium-3d" ref={containerRef}>
      <Canvas
        dpr={highQuality ? [1, 2] : [1, 1.5]}
        camera={{ fov: FOV, position: [0, 9, 26] }}
        gl={{ antialias: false, powerPreference: 'high-performance', toneMappingExposure: 1.2 }}
        fallback={<PodiumFallback entries={entries} />}
      >
        <color attach="background" args={[NIGHT]} />
        <CameraRig reducedMotion={reducedMotion} />

        <hemisphereLight args={[ARENA.fillSky, ARENA.fillGround, 0.55]} />
        <directionalLight position={[-3, 9, 7]} intensity={1.5} color={ARENA.key} />
        <directionalLight position={[5, 4, -7]} intensity={1.4} color={SKY} />
        {hasWinner && (
          <pointLight position={[0, 3.3, PODIUM_Z + 0.9]} intensity={14} distance={6} color={SUN} />
        )}

        <Environment resolution={256} frames={1}>
          <Lightformer intensity={5} color={CREAM} position={[0, 7, 3]} scale={[14, 4, 1]} />
          <Lightformer intensity={3.5} color={SUN_SOFT} position={[0, 1.5, 9]} scale={[14, 3, 1]} />
          <Lightformer
            intensity={2}
            color={ARENA.bounce}
            position={[0, -3, 7]}
            scale={[14, 3, 1]}
          />
          <Lightformer intensity={3} color={SKY} position={[-8, 2, 0]} scale={[2, 6, 1]} />
          <Lightformer intensity={3} color={SKY} position={[8, 2, 0]} scale={[2, 6, 1]} />
        </Environment>

        <Platform reflective={highQuality} reducedMotion={reducedMotion} />
        <Scenery />
        <Landmarks />

        {PODIUM_SLOTS.map((slot) => {
          const entry = entries[slot.place - 1];
          const order = RISE_ORDER[slot.place];
          const medal = MEDAL[slot.place];
          const pinScale = slot.place === 1 ? 0.74 : 0.62;
          return (
            <Pedestal
              key={slot.place}
              place={slot.place}
              x={slot.x}
              z={PODIUM_Z}
              height={slot.height}
              riseDelay={0.15 + order * 0.2}
              reducedMotion={reducedMotion}
              onSelect={onPlayRanked}
              onHover={handleHover}
            >
              {entry ? (
                <PlayerPin
                  key={`${periodKey}-${entry.userId}`}
                  entry={entry}
                  scale={pinScale}
                  medalColor={medal.glow}
                  dropDelay={1.05 + order * 0.2}
                  stagger={order * 0.15}
                  isCurrentUser={entry.userId === currentUserId}
                  isWinner={slot.place === 1}
                  reducedMotion={reducedMotion}
                  onSelect={onPlayRanked}
                  onHover={handleHover}
                />
              ) : (
                <GhostPin
                  scale={pinScale}
                  medalColor={medal.glow}
                  onSelect={onPlayRanked}
                  onHover={handleHover}
                />
              )}
              {slot.place === 1 && entry && (
                <Sparkles
                  count={30}
                  position={[0, 1.2, 0]}
                  scale={[1.6, 2.2, 1.6]}
                  size={4}
                  speed={reducedMotion ? 0 : 0.3}
                  color={SUN_SOFT}
                />
              )}
            </Pedestal>
          );
        })}

        <Signpost actions={signActions} onHover={handleHover} />

        <ContactShadows
          position={[0, 0.004, 0]}
          scale={11}
          resolution={512}
          blur={2.2}
          opacity={0.55}
          far={3}
          color={ARENA.shadow}
        />
        <Sparkles
          count={140}
          position={[0, 3, -5]}
          scale={[34, 16, 8]}
          size={1.4}
          speed={reducedMotion ? 0 : 0.15}
          color={CREAM}
          opacity={0.4}
        />

        <EffectComposer multisampling={highQuality ? 4 : 0}>
          <Bloom
            mipmapBlur
            luminanceThreshold={1}
            luminanceSmoothing={0.25}
            intensity={0.85}
            radius={0.7}
          />
          <Vignette offset={0.25} darkness={0.7} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

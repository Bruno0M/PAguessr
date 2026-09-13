import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { AvatarSvg } from '../auth/avatars';
import type { ApiRankingEntry } from '../../api/ranking';
import './Podium3D.css';

const BOX_WIDTH = 1.35;
const BOX_DEPTH = 1.35;

const PLACES = [
  { place: 1 as const, x: 0, height: 1.7, color: '#ffd166' },
  { place: 2 as const, x: -1.7, height: 1.15, color: '#c9d6e3' },
  { place: 3 as const, x: 1.7, height: 0.85, color: '#f0a860' },
];

function formatScore(score: number): string {
  return score.toLocaleString('pt-BR');
}

function Pedestal({
  x,
  height,
  color,
  place,
  entry,
  isCurrentUser,
}: {
  x: number;
  height: number;
  color: string;
  place: 1 | 2 | 3;
  entry?: ApiRankingEntry;
  isCurrentUser: boolean;
}) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOX_WIDTH, height, BOX_DEPTH]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.12}
          metalness={0.55}
          roughness={0.35}
        />
      </mesh>
      <Html position={[0, height + 0.05, 0]} center>
        {entry ? (
          <div className={`podium-slot ${isCurrentUser ? 'is-me' : ''}`}>
            {place === 1 && (
              <span className="podium-crown" aria-hidden="true">
                👑
              </span>
            )}
            <AvatarSvg id={entry.avatarId} className="podium-avatar" />
            <span className="podium-nick">{entry.nick}</span>
            <span className="podium-score">{formatScore(entry.score)} pts</span>
          </div>
        ) : (
          <div className="podium-slot podium-slot-empty">
            <span className="podium-vago">Vago</span>
          </div>
        )}
      </Html>
    </group>
  );
}

export function Podium3D({
  entries,
  currentUserId,
}: {
  entries: ApiRankingEntry[];
  currentUserId?: string;
}) {
  return (
    <div className="podium-3d">
      <Canvas shadows camera={{ position: [0, 2.6, 5.4], fov: 42 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 2]} intensity={1.1} color="#eef6ff" castShadow />
        <pointLight position={[0, 2.5, 3]} intensity={0.6} color="#3ee3ad" />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <circleGeometry args={[3.6, 48]} />
          <meshStandardMaterial color="#0c2037" metalness={0.2} roughness={0.85} />
        </mesh>

        {PLACES.map(({ place, x, height, color }) => {
          const entry = entries[place - 1];
          return (
            <Pedestal
              key={place}
              place={place}
              x={x}
              height={height}
              color={color}
              entry={entry}
              isCurrentUser={entry?.userId === currentUserId}
            />
          );
        })}

        <OrbitControls
          target={[0, 1, 0]}
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 2 - 0.45}
          maxPolarAngle={Math.PI / 2 + 0.12}
          minAzimuthAngle={-Math.PI / 4}
          maxAzimuthAngle={Math.PI / 4}
          enableDamping
          dampingFactor={0.08}
          autoRotate
          autoRotateSpeed={0.6}
        />
      </Canvas>
    </div>
  );
}

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { USINA_POSITION } from './layout';
import { glowColor } from './textures';

const CONCRETE = '#98a6b3';
const STEEL = '#b5c2cd';

function TransmissionTower({ position }: { position: [number, number, number] }) {
  const height = 1.25;
  const legs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return (
    <group position={position}>
      {legs.map(([sx, sz], i) => {
        const base = new THREE.Vector3(sx * 0.12, 0, sz * 0.12);
        const top = new THREE.Vector3(sx * 0.03, height, sz * 0.03);
        const mid = base.clone().add(top).multiplyScalar(0.5);
        const length = base.distanceTo(top);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          top.clone().sub(base).normalize()
        );
        return (
          <mesh key={i} position={mid} quaternion={quaternion}>
            <cylinderGeometry args={[0.009, 0.012, length, 5]} />
            <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.35} />
          </mesh>
        );
      })}
      {[0.35, 0.65, 0.95].map((y) => (
        <mesh key={y} position-y={y}>
          <boxGeometry args={[0.2 - y * 0.1, 0.012, 0.012]} />
          <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.35} />
        </mesh>
      ))}
      <mesh position-y={1.02}>
        <boxGeometry args={[0.46, 0.022, 0.03]} />
        <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position-y={1.16}>
        <boxGeometry args={[0.32, 0.02, 0.03]} />
        <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position-y={height + 0.03}>
        <sphereGeometry args={[0.025, 10, 8]} />
        <meshBasicMaterial color={glowColor('#ff4d4d', 4)} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Usina da Chesf: barragem de concreto, casa de força com janelas acesas,
// tubulações descendo e torres de transmissão.
function UsinaChesf() {
  const cable = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const u = i / 20;
      points.push(new THREE.Vector3(-0.95 + 1.9 * u, 1.02 - Math.sin(Math.PI * u) * 0.18, -0.05));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.005, 4);
  }, []);
  useEffect(() => () => cable.dispose(), [cable]);

  return (
    <group position={[USINA_POSITION[0], 0, USINA_POSITION[1]]} rotation-y={0.55}>
      <mesh position={[0, 0.4, -0.32]}>
        <boxGeometry args={[1.5, 0.8, 0.24]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.82, -0.32]}>
        <boxGeometry args={[1.56, 0.04, 0.3]} />
        <meshStandardMaterial color="#c8d2db" roughness={0.6} />
      </mesh>

      {[-0.4, 0, 0.4].map((x) => (
        <mesh key={x} position={[x, 0.6, -0.08]} rotation-x={0.75}>
          <cylinderGeometry args={[0.055, 0.055, 0.52, 12]} />
          <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.3} />
        </mesh>
      ))}

      <mesh position={[0, 0.2, 0.18]}>
        <boxGeometry args={[1.25, 0.4, 0.48]} />
        <meshStandardMaterial color="#b3bfca" roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.25, 0.425]}>
        <planeGeometry args={[1.05, 0.08]} />
        <meshBasicMaterial color={glowColor('#ffcf7a', 2.4)} toneMapped={false} />
      </mesh>
      {[-0.5, -0.25, 0, 0.25, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.2, 0.43]}>
          <boxGeometry args={[0.04, 0.4, 0.02]} />
          <meshStandardMaterial color="#8f9ca8" roughness={0.7} />
        </mesh>
      ))}

      <TransmissionTower position={[-0.95, 0, -0.05]} />
      <TransmissionTower position={[0.95, 0, -0.05]} />
      <mesh geometry={cable}>
        <meshStandardMaterial color="#2d3a48" />
      </mesh>
    </group>
  );
}

export function Landmarks() {
  return <UsinaChesf />;
}

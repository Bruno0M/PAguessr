import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createFacadeTextures } from './textures';
import { ARENA } from './palette';

const BUILDINGS: { x: number; z: number; w: number; d: number; h: number; rot: number }[] = [
  { x: -3.95, z: -1.35, w: 0.42, d: 0.42, h: 0.95, rot: 0.3 },
  { x: -3.55, z: -2.05, w: 0.5, d: 0.44, h: 1.35, rot: 0.2 },
  { x: -4.2, z: -2.35, w: 0.36, d: 0.36, h: 0.7, rot: 0.5 },
  { x: -3.3, z: -3.4, w: 0.46, d: 0.4, h: 1.05, rot: 0.1 },
  { x: -1.85, z: -3.75, w: 0.4, d: 0.36, h: 0.8, rot: -0.15 },
  { x: 2.05, z: -3.55, w: 0.44, d: 0.4, h: 1.2, rot: 0.15 },
  { x: 3.95, z: -1.55, w: 0.4, d: 0.42, h: 0.85, rot: -0.3 },
  { x: 4.15, z: -2.3, w: 0.34, d: 0.34, h: 0.6, rot: -0.2 },
  { x: 1.2, z: -3.95, w: 0.36, d: 0.34, h: 0.65, rot: 0.05 },
];

const PALMS: { x: number; z: number; s: number; rot: number }[] = [
  { x: -4.62, z: -0.25, s: 0.95, rot: 0.2 },
  { x: -4.42, z: 1.95, s: 0.8, rot: 1.4 },
  { x: -2.45, z: -2.0, s: 0.85, rot: 2.2 },
  { x: -4.0, z: -3.05, s: 0.75, rot: 0.9 },
  { x: -1.15, z: -2.55, s: 0.7, rot: 3.1 },
  { x: 2.55, z: -2.05, s: 0.8, rot: 0.7 },
  { x: 3.6, z: 0.55, s: 0.95, rot: 2.6 },
  { x: 4.6, z: 0.95, s: 0.8, rot: 1.1 },
  { x: 3.25, z: -0.55, s: 0.7, rot: 4.0 },
  { x: 1.25, z: -2.45, s: 0.65, rot: 5.1 },
  { x: -2.55, z: 1.75, s: 0.6, rot: 3.6 },
];

const BUSHES: [number, number, number][] = [
  [-2.35, 1.2, 0.22],
  [-2.7, 2.05, 0.18],
  [-4.6, 0.55, 0.2],
  [-4.1, -1.9, 0.2],
  [-2.1, -2.35, 0.24],
  [-0.4, -2.3, 0.2],
  [0.55, -2.4, 0.22],
  [2.2, -2.5, 0.2],
  [3.9, -0.1, 0.22],
  [4.45, 0.35, 0.18],
  [3.3, 0.15, 0.2],
  [2.35, 0.75, 0.16],
  [4.7, 1.55, 0.18],
  [-4.8, 1.3, 0.16],
  [-3.0, -2.75, 0.2],
  [3.55, -3.1, 0.2],
];

const CLOUDS: { position: [number, number, number]; scale: number }[] = [
  { position: [-5.0, 0.9, -4.6], scale: 0.95 },
  { position: [5.1, 1.0, -4.4], scale: 0.9 },
  { position: [-6.6, -0.6, -1.6], scale: 0.6 },
  { position: [6.7, -0.5, -1.8], scale: 0.6 },
];

function Buildings() {
  const facades = useMemo(
    () => BUILDINGS.map((_, i) => createFacadeTextures(i * 7919 + 13, 0.42)),
    []
  );

  useEffect(
    () => () =>
      facades.forEach((f) => {
        f.map.dispose();
        f.glow.dispose();
      }),
    [facades]
  );

  return (
    <group>
      {BUILDINGS.map((b, i) => {
        const { map, glow } = facades[i];
        return (
          <group key={i} position={[b.x, 0, b.z]} rotation-y={b.rot}>
            <mesh position-y={b.h / 2}>
              <boxGeometry args={[b.w, b.h, b.d]} />
              <meshStandardMaterial
                map={map}
                emissive="#ffffff"
                emissiveMap={glow}
                emissiveIntensity={1.6}
                roughness={0.7}
                metalness={0.2}
              />
            </mesh>
            <mesh position-y={b.h + 0.02}>
              <boxGeometry args={[b.w + 0.04, 0.04, b.d + 0.04]} />
              <meshStandardMaterial color={ARENA.wallCap} roughness={0.6} metalness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function buildFrondsGeometry(): THREE.BufferGeometry {
  const fronds: THREE.BufferGeometry[] = [];
  const count = 8;
  for (let i = 0; i < count; i += 1) {
    const frond = new THREE.PlaneGeometry(0.62, 0.16, 10, 2);
    const position = frond.attributes.position;
    for (let v = 0; v < position.count; v += 1) {
      const x = position.getX(v) + 0.31;
      const u = x / 0.62;
      position.setXYZ(v, x, position.getY(v) * (1 - u * 0.85), -0.42 * u * u);
    }
    frond.rotateX(-Math.PI / 2);
    frond.rotateZ(0.35);
    frond.rotateY((i / count) * Math.PI * 2 + (i % 2) * 0.2);
    fronds.push(frond);
  }
  const merged = mergeGeometries(fronds)!;
  merged.computeVertexNormals();
  fronds.forEach((g) => g.dispose());
  return merged;
}

function buildTrunkGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.032, 0.055, 1, 8, 8);
  trunk.translate(0, 0.5, 0);
  const position = trunk.attributes.position;
  for (let v = 0; v < position.count; v += 1) {
    const y = position.getY(v);
    position.setX(v, position.getX(v) + 0.1 * y * y);
  }
  trunk.computeVertexNormals();
  return trunk;
}

function Palms() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const frondRef = useRef<THREE.InstancedMesh>(null);
  const trunkGeometry = useMemo(buildTrunkGeometry, []);
  const frondGeometry = useMemo(buildFrondsGeometry, []);

  useLayoutEffect(() => {
    const palm = new THREE.Matrix4();
    const crown = new THREE.Matrix4().makeTranslation(0.1, 1, 0);
    const out = new THREE.Matrix4();
    PALMS.forEach((p, i) => {
      palm.compose(
        new THREE.Vector3(p.x, 0, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)),
        new THREE.Vector3(p.s, p.s, p.s)
      );
      trunkRef.current?.setMatrixAt(i, palm);
      out.multiplyMatrices(palm, crown);
      frondRef.current?.setMatrixAt(i, out);
    });
    if (trunkRef.current) trunkRef.current.instanceMatrix.needsUpdate = true;
    if (frondRef.current) frondRef.current.instanceMatrix.needsUpdate = true;
    // Geometria nova recria o InstancedMesh (args mudam); sem refazer as
    // matrizes, as instâncias caem todas na origem, na frente do pódio.
  }, [trunkGeometry, frondGeometry]);

  useEffect(
    () => () => {
      trunkGeometry.dispose();
      frondGeometry.dispose();
    },
    [trunkGeometry, frondGeometry]
  );

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeometry, undefined, PALMS.length]}>
        <meshStandardMaterial color={ARENA.trunk} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={frondRef} args={[frondGeometry, undefined, PALMS.length]}>
        <meshStandardMaterial
          color={ARENA.frond}
          emissive={ARENA.frondGlow}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  );
}

function Bushes() {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const light = new THREE.Color(ARENA.bushLight);
    const dark = new THREE.Color(ARENA.bushDark);
    BUSHES.forEach(([x, z, r], i) => {
      matrix.compose(
        new THREE.Vector3(x, r * 0.45, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.7, 0)),
        new THREE.Vector3(r * 1.3, r * 0.9, r * 1.2)
      );
      ref.current?.setMatrixAt(i, matrix);
      ref.current?.setColorAt(i, dark.clone().lerp(light, ((i * 37) % 10) / 10));
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  }, []);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BUSHES.length]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.8} flatShading />
    </instancedMesh>
  );
}

function Clouds() {
  const puffs = useMemo(() => {
    const offsets: [number, number, number, number][] = [
      [0, 0, 0, 0.75],
      [0.7, -0.1, 0.1, 0.55],
      [-0.7, -0.15, 0.05, 0.6],
      [0.3, 0.35, -0.1, 0.5],
      [-0.35, 0.3, 0.05, 0.45],
      [1.2, -0.25, -0.1, 0.38],
    ];
    return CLOUDS.flatMap((cloud) =>
      offsets.map(([ox, oy, oz, r]) => ({
        position: [
          cloud.position[0] + ox * cloud.scale,
          cloud.position[1] + oy * cloud.scale,
          cloud.position[2] + oz * cloud.scale,
        ] as [number, number, number],
        radius: r * cloud.scale,
      }))
    );
  }, []);

  return (
    <group>
      {puffs.map((puff, i) => (
        <mesh
          key={i}
          position={puff.position}
          scale={[puff.radius * 1.25, puff.radius, puff.radius]}
        >
          <sphereGeometry args={[1, 20, 14]} />
          <meshStandardMaterial
            color={ARENA.cloud}
            emissive={ARENA.cloudGlow}
            roughness={1}
            transparent
            opacity={0.78}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Scenery() {
  return (
    <group>
      <Buildings />
      <Palms />
      <Bushes />
      <Clouds />
    </group>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { createRibbonGeometry } from './geometry';
import { createIslandGroundTexture, createRiverTexture, createWaterfallTexture } from './textures';

export const ISLAND_RADIUS = 4.2;

// Ponto onde o rio cruza a borda da ilha (frente-direita) e vira cachoeira.
const FALLS_ANGLE = THREE.MathUtils.degToRad(35);
const FALLS_HEIGHT = 3.4;

// Passa na frente do pódio, da borda esquerda até a cachoeira.
const RIVER_POINTS: [number, number][] = [
  [-4.0, 0.9],
  [-2.6, 1.9],
  [-0.9, 2.35],
  [0.8, 2.0],
  [2.2, 2.05],
  [Math.cos(FALLS_ANGLE) * 4.28, Math.sin(FALLS_ANGLE) * 4.28],
];

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Block {
  x: number;
  z: number;
  height: number;
  color: THREE.Color;
}

function buildCityBlocks(): Block[] {
  const random = seededRandom(1958);
  const river = new THREE.CatmullRomCurve3(
    RIVER_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z))
  ).getSpacedPoints(80);
  const low = new THREE.Color('#1f3d5a');
  const high = new THREE.Color('#34638a');
  const blocks: Block[] = [];
  const step = 0.46;

  for (let ix = 0; ix < 18; ix += 1) {
    for (let iz = 0; iz < 18; iz += 1) {
      if (ix % 4 === 3 || iz % 3 === 2) continue;
      const x = -3.9 + ix * step;
      const z = -3.9 + iz * step;
      if (Math.hypot(x, z) > ISLAND_RADIUS - 0.4) continue;
      if (Math.abs(x) < 3.1 && z > -1.2) continue;
      if (river.some((p) => Math.hypot(p.x - x, p.z - z) < 0.8)) continue;

      const backBoost = z < -2.2 ? 0.2 : 0;
      blocks.push({
        x: x + (random() - 0.5) * 0.06,
        z: z + (random() - 0.5) * 0.06,
        height: 0.1 + random() * 0.32 + backBoost * random(),
        color: low.clone().lerp(high, random()),
      });
    }
  }
  return blocks;
}

function CityBlocks() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const blocks = useMemo(buildCityBlocks, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    blocks.forEach((block, i) => {
      matrix.compose(
        new THREE.Vector3(block.x, block.height / 2, block.z),
        new THREE.Quaternion(),
        new THREE.Vector3(0.34, block.height, 0.34)
      );
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, block.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blocks]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]}>
      <boxGeometry />
      <meshStandardMaterial roughness={0.7} metalness={0.1} />
    </instancedMesh>
  );
}

export function Island({ reducedMotion }: { reducedMotion: boolean }) {
  const groundTexture = useMemo(createIslandGroundTexture, []);
  const riverTexture = useMemo(() => {
    const texture = createRiverTexture();
    texture.repeat.set(1, 1 / 1.6);
    return texture;
  }, []);
  const waterfallTexture = useMemo(createWaterfallTexture, []);
  const bankGeometry = useMemo(() => createRibbonGeometry(RIVER_POINTS, 1.2), []);
  const waterGeometry = useMemo(() => createRibbonGeometry(RIVER_POINTS, 0.82), []);

  useEffect(
    () => () => {
      groundTexture.dispose();
      riverTexture.dispose();
      waterfallTexture.dispose();
      bankGeometry.dispose();
      waterGeometry.dispose();
    },
    [groundTexture, riverTexture, waterfallTexture, bankGeometry, waterGeometry]
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    riverTexture.offset.y -= delta * 0.45;
    waterfallTexture.offset.y += delta * 0.8;
  });

  const fallsX = Math.cos(FALLS_ANGLE) * (ISLAND_RADIUS + 0.04);
  const fallsZ = Math.sin(FALLS_ANGLE) * (ISLAND_RADIUS + 0.04);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ISLAND_RADIUS, 96]} />
        <meshStandardMaterial
          map={groundTexture}
          emissive="#ffffff"
          emissiveMap={groundTexture}
          emissiveIntensity={0.3}
          roughness={0.9}
        />
      </mesh>

      <mesh geometry={bankGeometry} position={[0, 0.01, 0]}>
        <meshStandardMaterial color="#0a3348" roughness={0.6} />
      </mesh>
      <mesh geometry={waterGeometry} position={[0, 0.022, 0]}>
        <meshBasicMaterial map={riverTexture} toneMapped={false} />
      </mesh>

      <CityBlocks />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <torusGeometry args={[ISLAND_RADIUS, 0.035, 12, 160]} />
        <meshBasicMaterial color="#3ee3ad" toneMapped={false} />
      </mesh>

      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[ISLAND_RADIUS, ISLAND_RADIUS - 0.12, 0.4, 96]} />
        <meshStandardMaterial color="#2a5474" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.8, 0]}>
        <cylinderGeometry args={[ISLAND_RADIUS - 0.12, 3.1, 0.8, 13]} />
        <meshStandardMaterial color="#2b4a63" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, -1.8, 0]}>
        <cylinderGeometry args={[3.1, 1.5, 1.2, 10]} />
        <meshStandardMaterial color="#223d55" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, -2.95, 0]} rotation={[Math.PI, 0.3, 0]}>
        <coneGeometry args={[1.5, 1.1, 8]} />
        <meshStandardMaterial color="#1a3248" roughness={1} flatShading />
      </mesh>

      <mesh
        position={[fallsX, -FALLS_HEIGHT / 2 + 0.02, fallsZ]}
        rotation={[0, Math.PI / 2 - FALLS_ANGLE, 0]}
      >
        <planeGeometry args={[0.8, FALLS_HEIGHT]} />
        <meshBasicMaterial
          map={waterfallTexture}
          color="#d2f8ff"
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <Sparkles
        position={[fallsX, -FALLS_HEIGHT + 0.2, fallsZ]}
        count={24}
        scale={[1, 0.6, 1]}
        size={2.4}
        speed={reducedMotion ? 0 : 0.6}
        color="#c6f6ff"
        opacity={0.7}
      />
    </group>
  );
}

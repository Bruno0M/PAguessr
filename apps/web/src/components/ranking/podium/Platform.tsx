import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { createRoadGeometries, flatCurve } from './geometry';
import {
  BRIDGE_CENTER,
  BRIDGE_HALF_SPAN,
  MAP_CENTER,
  MAP_WIDTH,
  PLATFORM_RADIUS,
  ROAD_POINTS,
  ROAD_WIDTH,
} from './layout';
import {
  CITY_CENTER_LNG_LAT,
  PAULO_AFONSO_OUTLINE,
  RIVER_BORDER_RANGE,
  projectToMap,
} from './pauloAfonsoMap';
import { createRoadTextures, glowColor } from './textures';

const R = PLATFORM_RADIUS;
const RIM_HEIGHT = 0.42;
const ROAD_BASE = 0.09;
const ROAD_THICKNESS = 0.12;
const BRIDGE_RISE = 0.3;

function Disc({ reflective }: { reflective: boolean }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[R, 128]} />
        {reflective ? (
          <MeshReflectorMaterial
            resolution={512}
            blur={[300, 80]}
            mixBlur={1}
            mixStrength={1.6}
            mirror={0.55}
            depthScale={0.4}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.3}
            color="#0c2238"
            metalness={0.55}
            roughness={0.75}
          />
        ) : (
          <meshStandardMaterial color="#0c2238" metalness={0.5} roughness={0.45} />
        )}
      </mesh>

      <mesh position-y={-RIM_HEIGHT / 2}>
        <cylinderGeometry args={[R + 0.06, R + 0.02, RIM_HEIGHT, 160, 1, true]} />
        <meshStandardMaterial
          color="#c3d2df"
          metalness={0.9}
          roughness={0.22}
          envMapIntensity={1.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <torusGeometry args={[R + 0.03, 0.055, 12, 200]} />
        <meshBasicMaterial color={glowColor('#3fdcff', 4.5)} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-RIM_HEIGHT + 0.04}>
        <torusGeometry args={[R + 0.04, 0.014, 8, 200]} />
        <meshBasicMaterial color={glowColor('#3fdcff', 1.3)} toneMapped={false} />
      </mesh>

      <mesh position-y={-RIM_HEIGHT - 0.8} rotation-x={Math.PI}>
        <coneGeometry args={[R + 0.02, 1.6, 128, 1, true]} />
        <meshStandardMaterial
          color="#0a1624"
          metalness={0.8}
          roughness={0.45}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function PauloAfonsoMap() {
  const { geometry, outline, river, city } = useMemo(() => {
    const [cx, cz] = MAP_CENTER;
    const project = (lng: number, lat: number): [number, number] => {
      const [x, z] = projectToMap(lng, lat, MAP_WIDTH);
      return [x + cx, z + cz];
    };
    const points = PAULO_AFONSO_OUTLINE.map(([lng, lat]) => project(lng, lat));
    // ShapeGeometry fica no plano XY; girado -90° em X, y do shape vira -z.
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    });
    const lift = 0.075;
    return {
      geometry: extruded,
      outline: points.map(([x, z]) => new THREE.Vector3(x, lift, z)),
      river: points
        .slice(RIVER_BORDER_RANGE[0], RIVER_BORDER_RANGE[1] + 1)
        .map(([x, z]) => new THREE.Vector3(x, lift + 0.004, z)),
      city: project(...CITY_CENTER_LNG_LAT),
    };
  }, []);

  const gridTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#123a5e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#2d7bab';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / 0.32, 1 / 0.32);
    texture.anisotropy = 8;
    return texture;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      gridTexture.dispose();
    },
    [geometry, gridTexture]
  );

  return (
    <group>
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={0.005}>
        <meshStandardMaterial
          map={gridTexture}
          emissive="#1d6fa3"
          emissiveIntensity={0.25}
          metalness={0.3}
          roughness={0.55}
        />
      </mesh>
      <Line points={outline} color={glowColor('#63d8ff', 2.4)} lineWidth={2} toneMapped={false} />
      <Line points={river} color={glowColor('#3fdcff', 4)} lineWidth={4.5} toneMapped={false} />
      <mesh position={[city[0], 0.1, city[1]]}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshBasicMaterial color={glowColor('#3ee3ad', 5)} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Road({ reducedMotion }: { reducedMotion: boolean }) {
  const curve = useMemo(() => flatCurve(ROAD_POINTS), []);

  const bridgeT = useMemo(() => {
    const target = new THREE.Vector3(BRIDGE_CENTER[0], 0, BRIDGE_CENTER[1]);
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i <= 400; i += 1) {
      const d = curve.getPointAt(i / 400).distanceTo(target);
      if (d < bestDistance) {
        bestDistance = d;
        best = i / 400;
      }
    }
    return best;
  }, [curve]);

  const heightAt = useMemo(() => {
    const ramp = BRIDGE_HALF_SPAN * 1.8;
    return (t: number) => {
      const d = Math.abs(t - bridgeT);
      if (d > ramp) return ROAD_BASE;
      return ROAD_BASE + BRIDGE_RISE * (0.5 + 0.5 * Math.cos((Math.PI * d) / ramp));
    };
  }, [bridgeT]);

  const { top, body } = useMemo(
    () => createRoadGeometries(curve, ROAD_WIDTH, ROAD_THICKNESS, heightAt),
    [curve, heightAt]
  );
  const textures = useMemo(createRoadTextures, []);

  const bridge = useMemo(() => {
    const t0 = bridgeT - BRIDGE_HALF_SPAN;
    const t1 = bridgeT + BRIDGE_HALF_SPAN;
    const arches: THREE.TubeGeometry[] = [];
    const struts: { position: THREE.Vector3; height: number }[] = [];
    const rails: THREE.TubeGeometry[] = [];

    for (const side of [1, -1]) {
      const archPoints: THREE.Vector3[] = [];
      const railPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i += 1) {
        const u = i / 24;
        const t = t0 + (t1 - t0) * u;
        const p = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t);
        const offset = side * (ROAD_WIDTH * 0.5 - 0.04);
        const x = p.x - tangent.z * offset;
        const z = p.z + tangent.x * offset;
        const archY = 0.03 + 0.22 * Math.sin(Math.PI * u);
        archPoints.push(new THREE.Vector3(x, archY, z));
        railPoints.push(new THREE.Vector3(x, heightAt(t) + 0.08, z));
        if (i > 2 && i < 22 && i % 3 === 0) {
          const deckBottom = heightAt(t) - ROAD_THICKNESS;
          struts.push({
            position: new THREE.Vector3(x, (archY + deckBottom) / 2, z),
            height: Math.max(0.01, deckBottom - archY),
          });
        }
      }
      arches.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPoints), 48, 0.03, 8));
      rails.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints), 48, 0.012, 6));
    }

    const center = curve.getPointAt(bridgeT);
    const tangent = curve.getTangentAt(bridgeT);
    const perpX = tangent.z;
    const perpZ = -tangent.x;
    const river = new THREE.CatmullRomCurve3([
      new THREE.Vector3(center.x - perpX * 1.05, 0, center.z - perpZ * 1.05),
      new THREE.Vector3(center.x, 0, center.z),
      new THREE.Vector3(center.x + perpX * 1.0, 0, center.z + perpZ * 1.0),
    ]);
    return {
      arches,
      struts,
      rails,
      river: createRoadGeometries(river, 0.62, 0.02, () => 0.018, 40).top,
    };
  }, [curve, bridgeT, heightAt]);

  useEffect(
    () => () => {
      top.dispose();
      body.dispose();
      textures.map.dispose();
      textures.glow.dispose();
      bridge.arches.forEach((g) => g.dispose());
      bridge.rails.forEach((g) => g.dispose());
      bridge.river.dispose();
    },
    [top, body, textures, bridge]
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    textures.glow.offset.y -= delta * 0.25;
    textures.map.offset.y -= delta * 0.25;
  });

  return (
    <group>
      <mesh geometry={top}>
        <meshStandardMaterial
          map={textures.map}
          emissive={glowColor('#4fe3ff', 3)}
          emissiveMap={textures.glow}
          roughness={0.6}
          metalness={0.2}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={body}>
        <meshStandardMaterial
          color="#6e7f90"
          metalness={0.5}
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh geometry={bridge.river}>
        <meshStandardMaterial
          color="#0b4a6e"
          emissive="#0b5f86"
          emissiveIntensity={0.6}
          metalness={0.3}
          roughness={0.12}
        />
      </mesh>
      {bridge.arches.map((geometry, i) => (
        <mesh key={`arch-${i}`} geometry={geometry}>
          <meshStandardMaterial color="#c9d4de" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      {bridge.rails.map((geometry, i) => (
        <mesh key={`rail-${i}`} geometry={geometry}>
          <meshStandardMaterial color="#dfe8ef" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {bridge.struts.map((strut, i) => (
        <mesh key={`strut-${i}`} position={strut.position}>
          <cylinderGeometry args={[0.012, 0.012, strut.height, 6]} />
          <meshStandardMaterial color="#c9d4de" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export function Platform({
  reflective,
  reducedMotion,
}: {
  reflective: boolean;
  reducedMotion: boolean;
}) {
  return (
    <group>
      <Disc reflective={reflective} />
      <PauloAfonsoMap />
      <Road reducedMotion={reducedMotion} />
    </group>
  );
}

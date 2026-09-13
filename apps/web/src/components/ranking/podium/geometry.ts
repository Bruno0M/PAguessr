import * as THREE from 'three';

export const PIN_DEPTH = 0.3;
export const PIN_HOLE_RADIUS = 0.6;
// Distância da ponta até o centro da cabeça do pin, em unidades do shape.
export const PIN_HEAD_OFFSET = 1.5;
export const PIN_HEIGHT = 2.5;

let pinGeometry: THREE.ExtrudeGeometry | null = null;

// Mesmo desenho do pin SVG da Home (viewBox 24x28), recentrado na cabeça e
// com o eixo Y para cima; a ponta fica em y=0 depois do translate.
export function getPinGeometry(): THREE.ExtrudeGeometry {
  if (pinGeometry) return pinGeometry;

  const shape = new THREE.Shape();
  shape.moveTo(1, 0);
  shape.bezierCurveTo(1, -0.8, 0, -1.5, 0, -1.5);
  shape.bezierCurveTo(0, -1.5, -1, -0.8, -1, 0);
  shape.absarc(0, 0, 1, Math.PI, 0, true);

  const hole = new THREE.Path();
  hole.absarc(0, 0, PIN_HOLE_RADIUS, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  pinGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: PIN_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 5,
    curveSegments: 40,
  });
  pinGeometry.translate(0, PIN_HEAD_OFFSET, -PIN_DEPTH / 2);
  return pinGeometry;
}

// Coordenadas dos avatares SVG (viewBox 64x64, centro em 32,32) já recentradas
// e com Y invertido; a escala final é aplicada no mesh.
const POLYGONS: Record<number, [number, number][]> = {
  2: [
    [0, 17],
    [17, -15],
    [-17, -15],
  ],
  3: [
    [0, 19],
    [19, 0],
    [0, -19],
    [-19, 0],
  ],
  4: [
    [0, 19],
    [16.5, 9.5],
    [16.5, -9.5],
    [0, -19],
    [-16.5, -9.5],
    [-16.5, 9.5],
  ],
  5: [
    [0, 19],
    [5, 5.5],
    [19, 5.5],
    [7.5, -2.8],
    [12, -16],
    [0, -7.7],
    [-12, -16],
    [-7.5, -2.8],
    [-19, 5.5],
    [-5, 5.5],
  ],
  8: [
    [-6, 17],
    [6, 17],
    [6, 6],
    [17, 6],
    [17, -6],
    [6, -6],
    [6, -17],
    [-6, -17],
    [-6, -6],
    [-17, -6],
    [-17, 6],
    [-6, 6],
  ],
};

function polygonShape(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], idx) => (idx === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

function circleShape(radius: number, holeRadius?: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  if (holeRadius) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

function extrudeSymbol(shape: THREE.Shape): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 2.5,
    bevelEnabled: true,
    bevelThickness: 0.8,
    bevelSize: 0.8,
    bevelSegments: 3,
    curveSegments: 32,
  });
  geometry.center();
  return geometry;
}

function waveGeometry(): THREE.BufferGeometry {
  const v = (x: number, y: number) => new THREE.Vector3(x, y, 0);
  const path = new THREE.CurvePath<THREE.Vector3>();
  path.add(new THREE.QuadraticBezierCurve3(v(-19, -5), v(-9.5, 12), v(0, -5)));
  path.add(new THREE.QuadraticBezierCurve3(v(0, -5), v(9.5, -22), v(19, -5)));
  return new THREE.TubeGeometry(path, 48, 2.8, 12, false);
}

// Faixa plana (no plano XZ) ao longo de uma curva: U atravessa, V acompanha o
// comprimento em unidades de mundo, pra textura de correnteza repetir sem esticar.
export function createRibbonGeometry(
  points: [number, number][],
  width: number,
  segments = 120
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const samples = curve.getSpacedPoints(segments);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let travelled = 0;

  samples.forEach((point, i) => {
    const tangent = curve.getTangentAt(i / segments);
    const nx = -tangent.z;
    const nz = tangent.x;
    if (i > 0) travelled += point.distanceTo(samples[i - 1]);
    positions.push(point.x + nx * width * 0.5, 0, point.z + nz * width * 0.5);
    positions.push(point.x - nx * width * 0.5, 0, point.z - nz * width * 0.5);
    uvs.push(0, travelled, 1, travelled);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const symbolCache = new Map<number, THREE.BufferGeometry | null>();

// Tamanho de referência dos símbolos: cabem num raio de ~19 unidades.
export const SYMBOL_EXTENT = 19;

export function getAvatarSymbolGeometry(avatarId: number): THREE.BufferGeometry | null {
  if (symbolCache.has(avatarId)) return symbolCache.get(avatarId)!;

  let geometry: THREE.BufferGeometry | null = null;
  if (avatarId === 1) geometry = extrudeSymbol(circleShape(14));
  else if (avatarId === 6) geometry = waveGeometry();
  else if (avatarId === 7) geometry = extrudeSymbol(circleShape(16, 10));
  else if (POLYGONS[avatarId]) geometry = extrudeSymbol(polygonShape(POLYGONS[avatarId]));

  symbolCache.set(avatarId, geometry);
  return geometry;
}

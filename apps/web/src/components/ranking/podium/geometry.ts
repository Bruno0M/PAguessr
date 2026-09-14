import * as THREE from 'three';

export const PIN_DEPTH = 0.42;
export const PIN_HOLE_RADIUS = 0.56;
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
    bevelThickness: 0.2,
    bevelSize: 0.1,
    bevelSegments: 8,
    curveSegments: 48,
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

export function flatCurve(points: [number, number][]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
}

// Pista elevada ao longo de uma curva no plano XZ. `heightAt(t)` define a
// altura do asfalto (a ponte sobe nesse trecho); o corpo desce `thickness`.
// Topo com U atravessando e V em unidades de mundo, pras faixas não esticarem.
export function createRoadGeometries(
  curve: THREE.CatmullRomCurve3,
  width: number,
  thickness: number,
  heightAt: (t: number) => number,
  segments = 220
): { top: THREE.BufferGeometry; body: THREE.BufferGeometry } {
  const samples = curve.getSpacedPoints(segments);
  const top: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];
  const body: number[] = [];
  const bodyIdx: number[] = [];
  let travelled = 0;

  samples.forEach((point, i) => {
    const t = i / segments;
    const tangent = curve.getTangentAt(t);
    const nx = -tangent.z;
    const nz = tangent.x;
    const y = heightAt(t);
    if (i > 0) travelled += point.distanceTo(samples[i - 1]);

    const lx = point.x + nx * width * 0.5;
    const lz = point.z + nz * width * 0.5;
    const rx = point.x - nx * width * 0.5;
    const rz = point.z - nz * width * 0.5;

    top.push(lx, y, lz, rx, y, rz);
    topUv.push(0, travelled, 1, travelled);
    // Corpo: esquerda-cima, direita-cima, direita-baixo, esquerda-baixo.
    body.push(lx, y, lz, rx, y, rz, rx, y - thickness, rz, lx, y - thickness, lz);

    if (i < segments) {
      const a = i * 2;
      topIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      const b = i * 4;
      const n = b + 4;
      // lado direito, fundo, lado esquerdo
      bodyIdx.push(b + 1, n + 1, b + 2, b + 2, n + 1, n + 2);
      bodyIdx.push(b + 2, n + 2, b + 3, b + 3, n + 2, n + 3);
      bodyIdx.push(b + 3, n + 3, b, b, n + 3, n);
    }
  });

  const topGeometry = new THREE.BufferGeometry();
  topGeometry.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  topGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeometry.setIndex(topIdx);
  topGeometry.computeVertexNormals();

  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(body, 3));
  bodyGeometry.setIndex(bodyIdx);
  bodyGeometry.computeVertexNormals();

  return { top: topGeometry, body: bodyGeometry };
}

// Dígitos do pódio desenhados à mão (altura 1, base em y=0): sem fonte
// externa, pra não carregar arquivo nem licença de terceiro.
function digitShape(digit: 1 | 2 | 3): THREE.Shape {
  const s = new THREE.Shape();
  if (digit === 1) {
    s.moveTo(0.3, 0);
    s.lineTo(0.58, 0);
    s.lineTo(0.58, 1);
    s.lineTo(0.38, 1);
    s.lineTo(0.08, 0.8);
    s.lineTo(0.08, 0.6);
    s.lineTo(0.3, 0.73);
  } else if (digit === 2) {
    s.moveTo(0.05, 0);
    s.lineTo(0.7, 0);
    s.lineTo(0.7, 0.19);
    s.lineTo(0.36, 0.19);
    s.lineTo(0.55, 0.39);
    s.bezierCurveTo(0.65, 0.5, 0.71, 0.6, 0.71, 0.71);
    s.bezierCurveTo(0.71, 0.9, 0.55, 1.01, 0.37, 1.01);
    s.bezierCurveTo(0.22, 1.01, 0.1, 0.95, 0.02, 0.85);
    s.lineTo(0.16, 0.72);
    s.bezierCurveTo(0.22, 0.79, 0.29, 0.83, 0.36, 0.83);
    s.bezierCurveTo(0.45, 0.83, 0.5, 0.78, 0.5, 0.7);
    s.bezierCurveTo(0.5, 0.62, 0.46, 0.55, 0.38, 0.46);
    s.lineTo(0.05, 0.13);
  } else {
    s.moveTo(0.02, 0.16);
    s.bezierCurveTo(0.11, 0.04, 0.23, -0.01, 0.37, -0.01);
    s.bezierCurveTo(0.58, -0.01, 0.72, 0.11, 0.72, 0.29);
    s.bezierCurveTo(0.72, 0.42, 0.63, 0.51, 0.52, 0.54);
    s.bezierCurveTo(0.62, 0.58, 0.68, 0.66, 0.68, 0.76);
    s.bezierCurveTo(0.68, 0.92, 0.55, 1.01, 0.37, 1.01);
    s.bezierCurveTo(0.24, 1.01, 0.13, 0.96, 0.04, 0.87);
    s.lineTo(0.16, 0.74);
    s.bezierCurveTo(0.22, 0.8, 0.29, 0.84, 0.36, 0.84);
    s.bezierCurveTo(0.45, 0.84, 0.49, 0.8, 0.49, 0.73);
    s.bezierCurveTo(0.49, 0.65, 0.43, 0.61, 0.33, 0.61);
    s.lineTo(0.25, 0.61);
    s.lineTo(0.25, 0.45);
    s.lineTo(0.35, 0.45);
    s.bezierCurveTo(0.46, 0.45, 0.52, 0.4, 0.52, 0.31);
    s.bezierCurveTo(0.52, 0.22, 0.45, 0.16, 0.36, 0.16);
    s.bezierCurveTo(0.27, 0.16, 0.2, 0.2, 0.14, 0.28);
  }
  s.closePath();
  return s;
}

const digitCache = new Map<number, THREE.ExtrudeGeometry>();

export function getDigitGeometry(digit: 1 | 2 | 3): THREE.ExtrudeGeometry {
  const cached = digitCache.get(digit);
  if (cached) return cached;
  const geometry = new THREE.ExtrudeGeometry(digitShape(digit), {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.04,
    bevelSegments: 6,
    curveSegments: 24,
  });
  geometry.center();
  digitCache.set(digit, geometry);
  return geometry;
}

let leafGeometry: THREE.ExtrudeGeometry | null = null;

// Folha do louro em volta do "1": elipse pontuda, fina.
export function getLaurelLeafGeometry(): THREE.ExtrudeGeometry {
  if (leafGeometry) return leafGeometry;
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.26, -0.25, 0.26, 0.25, 0, 0.5);
  s.bezierCurveTo(-0.26, 0.25, -0.26, -0.25, 0, -0.5);
  leafGeometry = new THREE.ExtrudeGeometry(s, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 12,
  });
  leafGeometry.center();
  return leafGeometry;
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

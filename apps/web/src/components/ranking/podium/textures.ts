import * as THREE from 'three';

// Cor acima de 1.0 com toneMapped={false}: é o que o Bloom (limiar 1) pega.
export function glowColor(hex: string, intensity: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(intensity);
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function canvasTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Asfalto (map) + faixas que brilham (emissiveMap): bordas contínuas e
// tracejado central. V repete ao longo da pista.
export function createRoadTextures(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const { canvas: base, ctx: b } = makeCanvas(128, 256);
  b.fillStyle = '#16212e';
  b.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 900; i += 1) {
    const shade = 30 + Math.random() * 25;
    b.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 18})`;
    b.fillRect(Math.random() * 128, Math.random() * 256, 1.5, 1.5);
  }
  b.fillStyle = '#9fdcea';
  b.fillRect(6, 0, 5, 256);
  b.fillRect(117, 0, 5, 256);
  b.fillRect(60, 0, 8, 110);

  const { canvas: glowCanvas, ctx: g } = makeCanvas(128, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff';
  g.fillRect(6, 0, 5, 256);
  g.fillRect(117, 0, 5, 256);
  g.fillRect(60, 0, 8, 110);

  const map = canvasTexture(base);
  const glow = canvasTexture(glowCanvas);
  for (const texture of [map, glow]) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1 / 1.1);
  }
  return { map, glow };
}

// Fachada com janelas; `lit` controla quantas acendem (mesma textura serve de
// emissiveMap, então só as janelas acesas brilham).
export function createFacadeTextures(
  seed: number,
  lit = 0.45
): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const { canvas: base, ctx: b } = makeCanvas(128, 256);
  const { canvas: glowCanvas, ctx: g } = makeCanvas(128, 256);
  b.fillStyle = '#2a3a4f';
  b.fillRect(0, 0, 128, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);

  for (let row = 0; row < 11; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 12 + col * 28;
      const y = 14 + row * 22;
      const on = random() < lit;
      b.fillStyle = on ? '#ffd58a' : '#16212e';
      b.fillRect(x, y, 16, 12);
      if (on) {
        g.fillStyle = `rgba(255, 200, 120, ${0.6 + random() * 0.4})`;
        g.fillRect(x, y, 16, 12);
      }
    }
  }
  return { map: canvasTexture(base), glow: canvasTexture(glowCanvas) };
}

export function createSignTexture(label: string): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '900 64px "Arial Black", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = ctx.measureText(label).width;
  if (size > 440) {
    ctx.font = `900 ${Math.floor((64 * 440) / size)}px "Arial Black", "Segoe UI", sans-serif`;
  }
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(4, 30, 40, 0.6)';
  ctx.strokeText(label, 256, 68);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 256, 68);
  return canvasTexture(canvas);
}

// Mancha radial branca pra halos e feixes (usada com blending aditivo).
export function createGlowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return canvasTexture(canvas, false);
}

// Feixe vertical: forte embaixo, some em cima e nas laterais.
export function createBeamTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 256);
  const vertical = ctx.createLinearGradient(0, 256, 0, 0);
  vertical.addColorStop(0, 'rgba(255,255,255,0.9)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 128, 256);
  ctx.globalCompositeOperation = 'destination-in';
  const horizontal = ctx.createLinearGradient(0, 0, 128, 0);
  horizontal.addColorStop(0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.5, 'rgba(0,0,0,1)');
  horizontal.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, 128, 256);
  return canvasTexture(canvas, false);
}

import * as THREE from 'three';

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Chão da ilha: só a grade de mapa da Home. Detalhe fino em textura borra no
// ângulo rasante da câmera, então rio e quarteirões são geometria (Island.tsx).
export function createIslandGroundTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const ground = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size / 2);
  ground.addColorStop(0, '#1a3a56');
  ground.addColorStop(1, '#112a40');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#2b4d6a';
  ctx.lineWidth = 2;
  for (let p = 0; p <= size; p += 32) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  return canvasTexture(canvas);
}

// Correnteza: faixas claras atravessadas no sentido do fluxo (eixo V).
export function createRiverTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const across = ctx.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, '#10516b');
  across.addColorStop(0.25, '#1f8fac');
  across.addColorStop(0.5, '#3cc3d8');
  across.addColorStop(0.75, '#1f8fac');
  across.addColorStop(1, '#10516b');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, 64, 256);

  ctx.fillStyle = 'rgba(210, 248, 255, 0.85)';
  ctx.fillRect(29, 0, 6, 70);
  ctx.fillRect(29, 128, 6, 70);
  ctx.fillStyle = 'rgba(210, 248, 255, 0.35)';
  ctx.fillRect(14, 60, 4, 40);
  ctx.fillRect(46, 190, 4, 40);

  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createNumeralTexture(place: 1 | 2 | 3, color: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.font = 'italic 900 176px "Arial Black", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const gradient = ctx.createLinearGradient(0, 40, 0, 216);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, color);
  gradient.addColorStop(1, new THREE.Color(color).multiplyScalar(0.35).getStyle());

  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#08131f';
  ctx.strokeText(String(place), size / 2, size / 2 + 8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = gradient;
  ctx.fillText(String(place), size / 2, size / 2 + 8);

  return canvasTexture(canvas);
}

export function createWaterfallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const body = ctx.createLinearGradient(0, 0, 128, 0);
  body.addColorStop(0, 'rgba(120, 220, 240, 0)');
  body.addColorStop(0.5, 'rgba(120, 220, 240, 0.35)');
  body.addColorStop(1, 'rgba(120, 220, 240, 0)');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 128, 512);

  for (let i = 0; i < 130; i += 1) {
    const x = 10 + Math.random() * 108;
    const y = Math.random() * 512;
    const length = 60 + Math.random() * 180;
    const alpha = 0.35 + Math.random() * 0.65;
    const streak = ctx.createLinearGradient(0, y, 0, y + length);
    streak.addColorStop(0, 'rgba(190, 245, 255, 0)');
    streak.addColorStop(0.5, `rgba(190, 245, 255, ${alpha})`);
    streak.addColorStop(1, 'rgba(190, 245, 255, 0)');
    ctx.strokeStyle = streak;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + length);
    ctx.stroke();
  }

  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

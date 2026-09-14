// Poeira e pólen flutuando na luz da capa, no espírito da poeira do menu do Stray.
// Canvas 2D: cada partícula é um carimbo de um sprite de brilho radial desenhado
// uma vez só, então dá pra ter uma centena delas sem pesar.

type Mote = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  vx: number;
  vy: number;
  phase: number;
  sway: number;
  alpha: number;
  twinkle: number;
  bokeh: boolean;
};

const WARM_LIGHT = '255, 238, 200';

function createSprite(): HTMLCanvasElement {
  const size = 64;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, `rgba(${WARM_LIGHT}, 1)`);
    glow.addColorStop(0.22, `rgba(${WARM_LIGHT}, 0.6)`);
    glow.addColorStop(1, `rgba(${WARM_LIGHT}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  }
  return sprite;
}

export function createDust(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { step: () => {}, destroy: () => {} };

  const sprite = createSprite();
  let width = 0;
  let height = 0;
  let motes: Mote[] = [];
  let time = 0;

  const spawn = (mote: Partial<Mote> = {}): Mote => {
    const depth = 0.35 + Math.random() * 0.65;
    const bokeh = Math.random() < 0.08;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: bokeh ? 10 + Math.random() * 14 : (1.5 + Math.random() * 2.8) * depth,
      depth,
      vx: (4 + Math.random() * 10) * depth,
      vy: -(3 + Math.random() * 9) * depth,
      phase: Math.random() * Math.PI * 2,
      sway: 6 + Math.random() * 16,
      alpha: bokeh ? 0.06 + Math.random() * 0.08 : 0.35 + Math.random() * 0.55,
      twinkle: 0.6 + Math.random() * 1.6,
      bokeh,
      ...mote,
    };
  };

  // Quem sai pela direita ou pelo topo volta pela esquerda ou por baixo, seguindo o vento.
  const respawnAtEdge = () => (Math.random() < 0.5 ? spawn({ x: -30 }) : spawn({ y: height + 30 }));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(110, Math.max(30, (width * height) / 16000)));
    motes = Array.from({ length: count }, () => spawn());
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // Na arte em paisagem o sol fica à esquerda, na altura do horizonte: a poeira
  // perto dele brilha mais. Em pé o sol sai do enquadramento e o brilho fica uniforme.
  const sunlight = (x: number, y: number) => {
    if (height > width) return 1;
    const dx = x - width * 0.09;
    const dy = y - height * 0.44;
    const spread = Math.max(width, height) * 0.32;
    return 0.75 + 1.1 * Math.exp(-(dx * dx + dy * dy) / (2 * spread * spread));
  };

  const step = (dt: number, pointerX: number, pointerY: number) => {
    time += dt;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < motes.length; i++) {
      let mote = motes[i];
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      if (mote.x > width + 40 || mote.y < -40) {
        mote = respawnAtEdge();
        motes[i] = mote;
      }

      // Partículas "mais perto" andam mais com o mouse que a arte: sensação de profundidade.
      const x = mote.x + Math.sin(time * 0.6 + mote.phase) * mote.sway - pointerX * 26 * mote.depth;
      const y = mote.y - pointerY * 16 * mote.depth;
      const flicker = 0.65 + 0.35 * Math.sin(time * mote.twinkle + mote.phase);
      const size = mote.bokeh ? mote.radius * 2 : mote.radius * 6;

      ctx.globalAlpha = Math.min(1, mote.alpha * flicker * sunlight(x, y));
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
  };

  return { step, destroy: () => observer.disconnect() };
}

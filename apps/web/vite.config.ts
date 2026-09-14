import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import packageJson from './package.json';

// O package.json não é incrementado a cada deploy, então a data do build (no
// fuso de Paulo Afonso) é o que diferencia uma versão da outra na tela de título.
const buildDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bahia' })
  .format(new Date())
  .replaceAll('-', '.');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:3333';

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __BUILD_DATE__: JSON.stringify(buildDate),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

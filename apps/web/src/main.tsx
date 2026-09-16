import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/saira/400.css';
import '@fontsource/saira/600.css';
import App from './App';
import './styles/tokens.css';
import './styles/gameUi.css';
import './index.css';
// Só efeito colateral: grava a preferência de reduzir movimento (sistema +
// override manual) em <html> antes do primeiro paint, pras animações em CSS
// puro já nascerem certas. Ver lib/motionPreference.ts.
import './lib/motionPreference';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

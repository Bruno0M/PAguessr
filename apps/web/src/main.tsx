import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/base.css';
import './styles/app.css';
import './styles/grille.css';

const racine = document.getElementById('racine');
if (!racine) throw new Error('Élément racine introuvable dans index.html');

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

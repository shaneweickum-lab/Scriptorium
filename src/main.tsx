import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { setUpdateAvailable } from './pwaUpdate';
import './index.css';
import App from './App';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    setUpdateAvailable(updateSW);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

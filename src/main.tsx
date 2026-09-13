import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './theme.css';
import 'antd/dist/reset.css';

// After a deploy, hashed lazy chunks change. Auto-reload once if a preload fails.
const CHUNK_RELOAD_KEY = 'spa-chunk-reload';
sessionStorage.removeItem(CHUNK_RELOAD_KEY);

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

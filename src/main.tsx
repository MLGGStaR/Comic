import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Apps have no browser context menus: suppress long-press/right-click menus
// on chrome (covers, buttons) while leaving text inputs alone.
document.addEventListener('contextmenu', (e) => {
  const t = e.target as Element | null;
  if (t?.closest?.('input, textarea')) return;
  e.preventDefault();
});

// App-shell caching → instant launches + offline
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

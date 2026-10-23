import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './views/App'
import AutoConsent from '@duckduckgo/autoconsent';
import { DuckDuckAutoConsent } from './services/duck-duck-auto-consent';

console.log('[CRXJS] Hello world from content script!', AutoConsent)

DuckDuckAutoConsent.getInstance().init();

const container = document.createElement('div')
container.id = 'crxjs-app'
document.body.appendChild(container)
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

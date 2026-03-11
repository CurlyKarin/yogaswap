// app/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { Amplify } from 'aws-amplify';
import axios from 'axios';

// Konfiguriere Axios für Tenant-Header
axios.defaults.headers.common['x-tenant-id'] = 'default-tenant';

// Checkmark DEBUG: Prüfe Config
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

console.log('Amplify Config:', {
  userPoolId,
  clientId,
});

// Validierung: Prüfe ob alle erforderlichen Werte vorhanden sind
if (!userPoolId || !clientId) {
  const errorMsg = `FEHLER: Cognito-Konfiguration unvollständig!
  VITE_COGNITO_USER_POOL_ID: ${userPoolId ? '✓' : '✗ FEHLT'}
  VITE_COGNITO_CLIENT_ID: ${clientId ? '✓' : '✗ FEHLT'}
  
  Bitte erstelle eine .env-Datei im app/ Verzeichnis mit diesen Werten.
  Die Region ist in der User Pool ID enthalten (z.B. eu-central-1_xxxxx).
  Siehe README.md für Details.`;
  
  console.error(errorMsg);
  
  // Zeige Fehler in der UI
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui; max-width: 600px; margin: 2rem auto;">
        <h1 style="color: #dc2626;">⚠️ Konfigurationsfehler</h1>
        <p style="color: #374151; line-height: 1.6;">
          Die Cognito-Umgebungsvariablen fehlen. Bitte erstelle eine <code style="background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px;">.env</code> 
          Datei im <code style="background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px;">app/</code> Verzeichnis mit folgenden Werten:
        </p>
        <pre style="background: #f3f4f6; padding: 1rem; border-radius: 8px; overflow-x: auto;">
VITE_COGNITO_USER_POOL_ID=eu-central-1_xxxxx
VITE_COGNITO_CLIENT_ID=xxxxx</pre>
        <p style="color: #374151; margin-top: 1rem;">
          <strong>Hinweis:</strong> Die Region ist bereits in der User Pool ID enthalten (z.B. <code>eu-central-1_xxxxx</code>).
        </p>
        <p style="color: #374151; margin-top: 1rem;">
          Siehe README.md für Details zur Einrichtung.
        </p>
      </div>
    `;
  }
  throw new Error(errorMsg);
}

// Checkmark Amplify Konfiguration
// Region wird automatisch aus der User Pool ID extrahiert (z.B. eu-central-1_xxxxx)
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId: clientId,
    },
  },
});

// Checkmark BrowserRouter um App
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

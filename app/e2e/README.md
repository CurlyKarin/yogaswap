# E2E-Tests (Playwright)

End-to-End-Tests für die YogaSwap-App. Aktuell **Basis abgedeckt**, Erweiterung geplant.

## Ausführen

```bash
cd app && npm run test:e2e
```

In CI laufen die Tests automatisch (siehe `.github/workflows/ci.yml`).

## Aktueller Stand

- **Startseite:** Lädt, YogaSwap-Überschrift sichtbar
- **Impressum:** Link im Footer, Seite zeigt „Impressum“
- **Kein Login-Flow** – Tests laufen ohne eingeloggten User

## Geplante Erweiterung

Weitere Tests (z. B. Kursliste, Tauschen, Admin) brauchen einen **Testuser-Login**.

**Empfohlener Weg:** Mock-Login nur für E2E

1. App so erweitern, dass sie bei **E2E-Umgebung** (z. B. `VITE_E2E=true` oder wenn `PLAYWRIGHT_TEST` gesetzt) den **Mock-Auth** aus `shared` nutzt statt Cognito.
2. In der Login-Komponente dann in diesem Modus `useAppAuth()` statt `useCognitoAuth()` verwenden.
3. In den Tests: Login-Formular mit Testuser aus `shared/data/mockUsers.ts` ausfüllen (z. B. Luna / 1234), absenden, danach eingeloggte Flows testen.

Vorteile: Kein AWS/Cognito in CI nötig, schnell, stabil. Alternative: echter Cognito-Testuser mit Secrets in GitHub (aufwendiger).

## Konfiguration

- `app/playwright.config.ts` – Testverzeichnis, Base-URL, Web-Server (Vite), Browser
- Server wird von Playwright gestartet (`npm run dev`), in CI mit frischem Start

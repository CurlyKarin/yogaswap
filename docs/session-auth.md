# Session-Gültigkeit und Auto-Logout (#318)

Kurzentscheidung für YogaSwap SPA + Cognito/Amplify.

## Modell

| Mechanismus | Rolle | YogaSwap |
|---|---|---|
| **Access-/ID-Token** | Kurzlebig; API-Auth | **60 Minuten** (Cognito App Client) |
| **Refresh-Token** | Hält die Session am Leben | **30 Tage**; Amplify `fetchAuthSession` refreshed automatisch |
| **API 401** | Token abgelehnt / Membership weg | → Logout + Hinweis „Sitzung nicht mehr gültig“ |
| **Visibility/Focus** | Tab wieder aktiv | lokale User-Anzeige vs. Cognito abgleichen |
| **Idle-Timeout** | Lange offener Tab ohne Interaktion | **8 Stunden** Inaktivität → Logout + Hinweis |

Idle ist bewusst **kein** Bank-Timeout (15 Min.): Studios lassen Tabs oft offen; Sicherheit kommt primär von Token-Expiry, Global Sign-Out bei E-Mail-Wechsel und 401-Handling.

## UX

- Forced Logout setzt einen einmaligen Hinweis (`sessionStorage` / Login-Banner).
- Re-Login über das normale Login-Formular (kein Modal).
- Anderer Tab Logout bleibt über `storage`-Event (#338).

## Manuell testen (Console)

Auf Staging / lokal erscheint in der Konsole ein Hinweis. Eingeloggt:

```js
// Sofort Idle-Logout + Banner
__yogaswapSession.endIdle()

// Sofort „Sitzung abgelaufen“
__yogaswapSession.endExpired()

// Sofort wie nach API-401
__yogaswapSession.endUnauthorized()

// Echten Idle-Timer auf 60s setzen — danach Tab liegen lassen, nicht klicken
__yogaswapSession.startShortIdle(60000)
```

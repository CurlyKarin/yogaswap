# Kontakt-Alias support@yogaswap.de (#87)

Öffentliche Kontaktadresse für Impressum, Datenschutz und Hinweise in Auth-Mails (z. B. Kontolöschung).  
**Versand** von App-/Cognito-Mails bleibt `noreply@yogaswap.de` (#80/#106).

## Zielbild

| Adresse | Zweck |
|---|---|
| `noreply@yogaswap.de` | Systemversand (kein Postfach nötig) |
| `support@yogaswap.de` | Empfang / Impressum / Support (Weiterleitung) |

Optional später: `privacy@` / `legal@` — für den Pilot reicht ein Alias.

## IONOS: Weiterleitung einrichten

1. IONOS → Domain **yogaswap.de** → E-Mail / E-Mail-Adressen  
2. Adresse **`support@yogaswap.de`** anlegen (Postfach **oder** nur Weiterleitung)  
3. Weiterleitung auf deine private Adresse (z. B. `kaschra@online.de` / `karin.schrader@online.de`)  
4. Test: Mail an `support@yogaswap.de` → kommt im Zielpostfach an  

**Status:** Weiterleitung bei IONOS ist eingerichtet (2026-07-28).

Kein Extra-DNS für den Alias nötig, solange die Domain bei IONOS gehostet ist und MX auf IONOS zeigt.

## App

Impressum und Datenschutz verlinken `support@yogaswap.de` und die Produktions-URL `https://app.yogaswap.de` (Demo weiterhin erwähnt).

## Abgrenzung

- Studio-Name in Auth-Mail-Texten: [#268](https://github.com/CurlyKarin/yogaswap/issues/268) (zurückgestellt)  
- SES/DMARC/SPF: [ses-production.md](./ses-production.md)

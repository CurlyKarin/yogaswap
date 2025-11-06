# YogaSwap Demo (S3)

Dies ist die **Demo-Version** von YogaSwap, die lokal gebaut und anschließend auf ein öffentlich zugängliches S3-Bucket hochgeladen werden kann. Sie dient ausschließlich der Präsentation und zum Testen – nicht für den produktiven Betrieb.

---

## Voraussetzungen

Bevor du die Demo nutzen kannst, musst du folgendes installiert haben:

- **Node.js** (>=18) und **npm** – zum Bauen der Frontend-Anwendung
- **OpenTofu** (alternativ Terraform) – zum Erstellen der AWS-Infrastruktur
- Ein **AWS-Konto** mit entsprechenden Rechten (S3-Bucket erstellen, Objekte hochladen, Bucket Policy anpassen)

---

## Projektstruktur

```bash
yogaswap-demo/
  src/
    data/
      courseOverrides.ts
      swapes.ts
    components/
    assets/
    lib/
  projects/
    demo/
      main.tf
  app/
  README.md
```

### Demodaten

Die Demodaten liegen im Verzeichnis `src/data/` und bestehen aus TypeScript-Dateien:

- `courseOverrides.ts` – überschreibt bestimmte Kurse für die Demo, z.B. Preise, Bezeichnungen  
- `swapes.ts` – definiert Beispiel-Swaps, die in der Demo verfügbar sind

> ⚠️ Hinweis: Die Daten können im Laufe der Zeit veraltet sein. Passe sie ggf. an, bevor du die Demo präsentierst.

---

## Deployment mit OpenTofu

1. **Frontend bauen**

```bash
cd app
npm install
npm run build
```

2. **OpenTofu Projekt anwenden**

```bash
cd projects/demo
tofu apply
```

- Wenn du den Bucket-Namen ändern möchtest, passe aws_s3_bucket.spa.bucket in main.tf an.
- OpenTofu erstellt ein S3-Bucket, lädt die gebauten Frontend-Dateien hoch und konfiguriert die Website.

3. **Demo aufrufen**
Nach erfolgreichem Apply gibt OpenTofu die URL der Demo zurück:

```bash
Output:
spa_url = "<dein-bucket-website-endpunkt>"
```
Beispiel: http://yogaswap-demo-2025.s3-website.eu-central-1.amazonaws.com

4. **Demo wieder abräumen**
```bash
tofu destroy
```
Damit werden das S3-Bucket und alle hochgeladenen Dateien wieder gelöscht. Nützlich, um Kosten zu sparen.

## Hinweise

- **Kosten:** Das Hochladen der Demo-Dateien auf S3 verursacht nur geringe Kosten. Prüfe dein AWS-Free-Tier Limit, falls du die Demo über einen längeren Zeitraum laufen lassen möchtest.

- **Branch / Version:** Diese Demo entspricht einem bestimmten Entwicklungsstand von YogaSwap. Für produktive Weiterentwicklung wird empfohlen, die Hauptversion in einem separaten Branch zu pflegen.

- **S3 Bucket ACLs:** Achte darauf, dass die OpenTofu-Konfiguration die richtigen Public-Access-Einstellungen verwendet. Sonst kann die Website nicht öffentlich zugänglich sein.

Viel Spaß beim Testen der YogaSwap-Demo!




-----------------------
User groups anlegen:
$ tofu output cognito_user_pool_id
"eu-central-1_N0bwRFdoZ"
$ node ../../backend/scripts/createGroups.js eu-central-1_N0bwRFdoZ
{
    "Groups": [
        {
            "GroupName": "admin",
            "UserPoolId": "eu-central-1_N0bwRFdoZ",
            "LastModifiedDate": "2025-11-05T15:13:57.684000+01:00",
            "CreationDate": "2025-11-05T15:13:57.684000+01:00"
        },
        {
            "GroupName": "instructor",
            "UserPoolId": "eu-central-1_N0bwRFdoZ",
            "LastModifiedDate": "2025-11-05T15:13:57.817000+01:00",
            "CreationDate": "2025-11-05T15:13:57.817000+01:00"
        },
        {
            "GroupName": "participant",
            "UserPoolId": "eu-central-1_N0bwRFdoZ",
            "LastModifiedDate": "2025-11-05T15:13:57.963000+01:00",
            "CreationDate": "2025-11-05T15:13:57.963000+01:00"
        }
    ]
}
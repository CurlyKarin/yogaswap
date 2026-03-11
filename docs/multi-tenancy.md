## Multi-Tenancy & Kurs-Sichtbarkeit

Dieses Dokument beschreibt, wie YogaSwap von einem Single-Tenant-System (ein Studio) zu einem Multi-Tenant-System (mehrere Studios/Organisationen) weiterentwickelt wird – inklusive Rollen und Sichtbarkeitsregeln für Kurse.

Ziel: **Klare Mandantentrennung**, ohne die Domänenlogik unnötig zu verkomplizieren, und eine saubere Basis für zukünftige Features (mehrere Studios, mehrere Räume, mehr Kursleiter).

---

## Begriffe und Ebenen

- **Tenant**  
  - Repräsentiert eine Organisation / ein Yogastudio-Unternehmen (z. B. „YogaStudio Berlin GmbH“).  
  - **Harte Sicherheits- und Daten-Grenze**: Alle Daten eines Tenants sind logisch von anderen getrennt.  
  - Alle zentralen Domänenobjekte werden künftig ein Pflichtfeld `tenantId: string` haben.

- **Studio / Standort (optional)**  
  - Optionale Unterstruktur innerhalb eines Tenants (z. B. „Studio Mitte“, „Studio West“).  
  - Dient primär der Gruppierung von Kursen und Räumen, **nicht** der Sicherheitsgrenze.

- **Raum**  
  - Konkreter physischer oder virtueller Trainingsraum.  
  - Quelle für **zeitliche Konflikte**: Ein Raum kann nicht zwei Kurse gleichzeitig haben.  
  - Räume gehören zu genau einem Tenant (und optional zu einem Studio).

- **User**  
  - Identität einer realen Person (einmalig im System).  
  - Ein User kann mehreren Tenants zugeordnet sein (z. B. Admin von zwei Studios).

- **User–Tenant-Membership**  
  - Verknüpft `User` und `Tenant` mit einer Rolle und optionalen Rechten/Scopes.  
  - Beispiel: `UserTenantMembership { userId, tenantId, role: 'admin' | 'instructor' | 'participant', scopes?: ... }`.

---

## Tenancy-Modell

### Zielbild

- Ein **globaler User** kann Mitglied in mehreren Tenants sein.  
- Alle fachlichen Daten (Kurse, Swaps, Overrides, Teilnehmer) sind immer **einem Tenant eindeutig zugeordnet**.  
- Jede Backend-Operation arbeitet **genau in einem Tenant-Kontext**.

### Technische Konsequenzen

1. **`tenantId` als Pflichtfeld**  
   - Folgende Typen in `shared/src/types.ts` werden erweitert:
     - `Course`
     - `CourseDateOverride`
     - `Swap`
     - `User` (oder eine abgeleitete Participant-Entität)
   - Weitere Tabellen/Entities (z. B. `Room`, `Studio`, `Tenant`) werden von Anfang an mit `tenantId` entworfen.

2. **DynamoDB-Schlüssel-Design**  
   - Alle Tabellen verwenden Schlüssel, in denen `tenantId` Teil des Partition Keys ist. Beispiele:
     - Kurse: `PK = TENANT#<tenantId>`, `SK = COURSE#<courseId>`
     - Kurs-Termine/Overrides: `PK = TENANT#<tenantId>#COURSE#<courseId>`, `SK = DATE#<dateIso>`
     - Swaps: `PK = TENANT#<tenantId>#USER#<nickname>`, `SK = SWAP#<fromDate>#<fromCourseId>#<toDate>#<toCourseId>`
   - Sekundärindizes (z. B. auf Status oder User) werden ebenfalls so entworfen, dass **jeder Query immer mit bekannter `tenantId`** erfolgt.

3. **Keine Cross-Tenant-Scans**  
   - Es gibt keine Standard-Queries, die Daten ohne `tenantId` lesen.  
   - Aggregationen über mehrere Tenants (z. B. für „Super-Admins“) sind explizite Spezialpfade und nicht der Normalfall.

---

## User, Rollen und Memberships

### User

- `User` beschreibt eine Person im System (heute primär über `nickname`, `email`, `role`).  
- Künftig wird die globale Identität von der Rolle im einzelnen Tenant getrennt:
  - `User` bleibt die Basis-Identität (Login, E-Mail, globale Einstellungen).
  - Tenant-spezifische Eigenschaften (Rolle, Berechtigungen) wandern in `UserTenantMembership`.

### User–Tenant-Membership

- Neue Struktur (konkrete Typdefinition folgt in `shared/src/types.ts`):

  ```ts
  type UserTenantRole = 'admin' | 'instructor' | 'participant';

  interface UserTenantMembership {
    userId: string;      // Referenz auf User (z. B. nickname oder eigene userId)
    tenantId: string;
    role: UserTenantRole;
    // Optional: zusätzliche Flags, z. B. ob Instructor alle Kurse sehen darf
    // canSeeAllCourses?: boolean;
  }
  ```

- Ein User kann mehrere Memberships haben (z. B. Admin in Tenant A, Instructor in Tenant B).

---

## Sichtbarkeitsregeln für Kurse

### Rollen

- **Admin**
  - Voller Zugriff auf alle Daten eines Tenants.  
  - Kann Kurse, Räume, Instructoren und Teilnehmer verwalten.  
  - Kann optional mehreren Tenants zugeordnet sein, arbeitet aber pro Request in **einem** Tenant-Kontext.

- **Instructor**
  - Standardfall: sieht und verwaltet nur Kurse, in denen er als Instructor eingetragen ist.  
  - Optionales Studio-Flag: „Instructor sieht alle Kurse des Tenants“ (konfigurierbar auf Tenant-/Studio-Ebene).

- **Participant / Trial**
  - Sieht nur Kurse/Termine, für die er gebucht ist oder buchen darf (später über Buchungs-/Berechtigungslogik).

### Scope-Logik

- Alle API-Handler für Kurs-Listen (z. B. `getCourses`, `getSwaps`, `getOverrides`) werden zukünftig so strukturiert:
  1. `tenantId` und `userId` aus dem Auth-Token lesen.  
  2. Membership für `(userId, tenantId)` laden.  
  3. Aus der Rolle + Scopes die Filter ableiten:
     - Admin: alle Kurse des Tenants.
     - Instructor:
       - „alle Kurse“ oder
       - nur Kurse, in denen der Instructor eingetragen ist.
     - Participant: nur relevante Kurse des Teilnehmers.

---

## Studios, Räume und zeitliche Konflikte

- **Studios/Standorte**  
  - Optionale Ebene zur Gruppierung von Räumen und Kursen innerhalb eines Tenants.  
  - Kein Einfluss auf Sicherheitsgrenzen, nur für Organisation und UI (z. B. Tabs pro Standort).

- **Räume**  
  - Jede Kursinstanz (Termin) referenziert einen `roomId`.  
  - Zeitliche Regeln:
    - Ein Raum kann nicht zwei Kurse gleichzeitig haben.
    - Ein Instructor kann nicht zwei Kurse gleichzeitig haben (raumunabhängig).
  - Konfliktprüfung findet beim Anlegen/Ändern von Kursen/Terminen im Backend statt.

**Aktueller Stand:** Studio und Raum sind derzeit nur als optionale IDs am Kurs vorgesehen (`Course.studioId`, `Course.roomId`). Eigene Tabellen/Entitäten für Room und Studio kommen später.

---

## Aktueller Stand der Typen (shared)

Die folgenden Erweiterungen sind in `shared/src/types.ts` umgesetzt (alle neuen Felder optional, damit bestehende Daten und Deploys unverändert laufen):

- **Course:** `tenantId?`, `instructors?` (Kursleiter), `studioId?`, `roomId?`
- **CourseDateOverride:** `tenantId?`, `anonymousTrialCount?` (anonyme Schnupperplätze/Blocker ohne User)
- **Swap:** `tenantId?`
- **User:** `authUserId?` (Login-Verknüpfung; leer bei NoInternet-/verwalteten Teilnehmern), `managedByUserId?` (z. B. verwaltender Trainer)
- **UserTenantMembership:** `userId`, `tenantId`, `role`, `canSeeAllCourses?`

**Rollen:** Nur noch `admin` | `instructor` | `participant` (keine Rolle `trial`; Schnupper über `anonymousTrialCount`, Springer später als `participant` mit Settings).  
**E-Mail:** Ist bewusst nicht eindeutig; mehrere User pro E-Mail sind erlaubt (Tests, verwaltete Teilnehmer).

---

## Request-Kontext & Sicherheit

- Jede Backend-Funktion wird künftig nach demselben Muster arbeiten:

  1. **Auth prüfen** und `userId` + `tenantId` aus dem JWT/Context extrahieren.  
  2. Membership `(userId, tenantId)` laden und Rolle/Scopes bestimmen.  
  3. Erst danach auf DynamoDB zugreifen – immer mit `tenantId` im Schlüssel.  
  4. Keine API nimmt `tenantId` blind aus dem Request-Body, um Manipulation zu vermeiden.

- Für Support-/„Super-Admin“-Fälle kann es separate Pfade geben, die mehrere Tenants sehen, diese sind aber explizit und streng limitiert.

---

## Implementierungsschritte (Roadmap)

1. **Typen erweitern**  
   - `tenantId` in den Shared-Domain-Typen ergänzen (`Course`, `CourseDateOverride`, `Swap`, `User`).  
   - `UserTenantMembership` definieren.

2. **DynamoDB-Schema anpassen**  
   - Key-Design pro Tabelle auf `tenantId` ausrichten.  
   - Terraform-Definitionen und Seeds anpassen.

3. **Backend-Lambdas umbauen**  
   - Alle Handler (`getCourses`, `getOverrides`, `getSwaps`, `create*/update*/delete*`) auf `tenantId`-basiertes Lesen/Schreiben umstellen.  
   - `tenantId` aus dem Auth-Kontext lesen, nicht aus dem Request-Body.

4. **Migration bestehender Daten**  
   - Alle bestehenden Items mit einem Default-`tenantId` versehen (z. B. `default-tenant`).  
   - Übergangsweise Fallbacks (`tenantId ?? 'default-tenant'`) im Code, bis Migration abgeschlossen ist.

5. **UI anpassen**  
   - Einführung eines „aktiven Tenant“-Kontexts in der App (und später ggf. Studio-/Raum-Filter).  
   - Instructor- und Admin-Ansichten auf die neuen Sichtbarkeitsregeln umstellen.


# Kurs-Identifikatoren: `courseUid` und Legacy-`courseId`

## Kurzfassung

- **`courseUid`**: UUID (v4), stabile technische Kurs-ID. Wird u. a. in REST-Pfaden und für übergreifende Referenzen genutzt; in DynamoDB über den Global Secondary Index **`GSI_CourseUid`** (`tenantId` + `courseUid`) auffindbar.
- **Legacy numerische ID**: Feld **`id`** im Client-Modell, Entsprechung **`courseId`** als String in DynamoDB (Sort-Key der Courses-Tabelle pro Tenant).

Beide existieren **parallel**. Die Migration (#122) führt `courseUid` ein und befüllt bestehende Datensätze (Backfill); der Cutover (#125) erlaubt UUIDs in API-Pfaden mit Auflösung auf die Legacy-SK.

## Warum die numerische ID nicht „nur Anzeige“ ist

Die Legacy-ID bleibt Bestandteil des Datenmodells und der Speicherung:

| Bereich | Rolle der Legacy-ID |
|--------|----------------------|
| **Courses (DynamoDB)** | Sort-Key `courseId` neben Partition `tenantId`. |
| **Overrides** | Schlüsselteil `courseId_date` (String-Konkatenation aus Legacy-Kurs-ID und Datum). |
| **Swaps** | Zusammengesetzte IDs und GSI-Range-Felder enthalten die numerische Kurs-ID (z. B. `fromDate_fromCourseId_status`, `toDate_toCourseId_status`, `swapId`) – **lesbar** und kompatibel mit dem bestehenden Design. |
| **API (kompatibel)** | Clients und ältere Aufrufe können weiter die numerische ID in Pfaden verwenden. |

`courseUid` und `fromCourseUid` / `toCourseUid` an Swaps bzw. Overrides sind **Dual-Write**-Felder für die neue Referenz, ohne die bestehenden Schlüsselpfade sofort zu ersetzen.

## Operatives

- **Backfill** (bestehende Kurse/Referenzen): im Verzeichnis `backend` z. B. `npm run backfill:course-uids` (siehe Skript `src/scripts/backfill_course_uids.ts`).
- **Infra**: GSI `GSI_CourseUid` auf der Courses-Tabelle (Terraform: `projects/yogaswap/dynamodb.tf`).
- **Code**: Zentrale Pfadlogik im Frontend z. B. `courseApiPathKey` in `app/src/lib/courseUid.ts`; Auflösung im Backend in `backend/src/lambdas/shared/courseUid.ts`.

## Siehe auch

- Typdefinitionen und JSDoc: `shared/src/types.ts` (`Course`, `Swap`, `CourseDateOverride`).

import { useState } from "react";
import { inviteUser } from "../api/participants";

export default function AdminPanel() {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"participant" | "instructor" | "admin">("participant");
  const [foreignManaged, setForeignManaged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleInvite = async () => {
    if (!nickname) return;
    if (!foreignManaged && !email) return;
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const effectiveRole = foreignManaged ? "participant" : role;
      const payload = foreignManaged
        ? { nickname, role: effectiveRole }
        : { email, nickname, role: effectiveRole };

      const result = await inviteUser(payload);

      if (result.error === "Nickname already exists") {
        setError("Dieser Spitzname ist bereits vergeben.");
      } else if (result.success) {
        if (foreignManaged) {
          setMessage(
            `✅ Teilnehmer '${nickname}' wurde ohne Login angelegt.\n` +
            `Hinweis: Es wird keine Einladung per E-Mail verschickt.`
          );
        } else if (result.emailSent) {
          setMessage(`✅ Einladung per E-Mail gesendet an ${email}`);
        } else {
          // E-Mail nicht versendet - zeige temporäres Passwort
          const tempPw = result.tempPassword || "(Passwort nicht verfügbar)";
          setMessage(
            `⚠️ User erstellt, aber E-Mail konnte nicht versendet werden.\n` +
            `Temporäres Passwort für '${nickname}': ${tempPw}\n` +
            `Bitte Passwort persönlich übermitteln.`
          );
        }
        setEmail("");
        setNickname("");
        setForeignManaged(false);
        setRole("participant");
      } else {
        setError("Fehler beim Senden");
      }
    } catch (err: unknown) {
      console.error(err);
      setError("Fehler beim Senden");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{ padding: "1rem", border: "1px solid #ccc", margin: "1rem 0", borderRadius: 8 }}>
      <h3>Teilnehmer einladen</h3>
      <div style={{ display: "grid", gap: "0.5rem", maxWidth: 400 }}>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={foreignManaged}
            onChange={(e) => {
              const checked = e.target.checked;
              setForeignManaged(checked);
              if (checked) {
                setEmail("");
                setRole("participant");
              }
            }}
            disabled={loading}
          />
          Fremdverwalteter Teilnehmer (ohne Login)
        </label>

        <input
          type="text"
          placeholder="Spitzname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={loading}
        />
        {!foreignManaged && (
          <input
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        )}
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "participant" | "instructor" | "admin")
          }
          disabled={loading || foreignManaged}
        >
          <option value="participant">Teilnehmer</option>
          <option value="instructor">Kursleiter</option>
          <option value="admin">Admin</option>
        </select>
        <button
          onClick={handleInvite}
          disabled={loading || !nickname || (!foreignManaged && !email)}
        >
          {loading
            ? foreignManaged
              ? "Wird angelegt..."
              : "Wird gesendet..."
            : foreignManaged
              ? "Anlegen"
              : "Einladen"}
        </button>

        {message && (
          <p style={{ margin: "0.5rem 0", color: message.includes("⚠️") ? "orange" : "green", whiteSpace: "pre-line" }}>
            {message}
          </p>
        )}
        {error && <p style={{ margin: "0.5rem 0", color: "red" }}>{error}</p>}
 
      </div>
    </div>
  );
}
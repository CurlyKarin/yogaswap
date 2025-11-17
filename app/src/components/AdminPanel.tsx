import { useState } from "react";
import { inviteUser } from "../api/participants";

export default function AdminPanel() {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"participant" | "instructor" | "admin">("participant");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleInvite = async () => {
    if (!email || !nickname) return;
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const result = await inviteUser({ email, nickname, role });

      if (result.error === "Nickname already exists") {
        setError("Dieser Spitzname ist bereits vergeben.");
      } else if (result.success) {
        setMessage(`Einladung gesendet an ${email}`);
        setEmail("");
        setNickname("");
      } else {
        setError("Fehler beim Senden");
      }
    } catch (err: any) {
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
        <input
          type="text"
          placeholder="Spitzname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={loading}
        />
        <input
          type="email"
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as any)} disabled={loading}>
          <option value="participant">Teilnehmer</option>
          <option value="instructor">Kursleiter</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={handleInvite} disabled={loading || !email || !nickname}>
          {loading ? "Wird gesendet..." : "Einladen"}
        </button>

        {message && <p style={{ margin: "0.5rem 0", color: "green" }}>{message}</p>}
        {error && <p style={{ margin: "0.5rem 0", color: "red" }}>{error}</p>}
 
      </div>
    </div>
  );
}
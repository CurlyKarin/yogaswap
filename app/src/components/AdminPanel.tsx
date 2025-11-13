import { useState } from "react";
import { inviteUser } from "../api/participants";

export default function AdminPanel() {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"participant" | "instructor" | "admin">("participant");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // const inviteUser = async () => {
  //   if (!email || !nickname) return;
  //   setLoading(true);
  //   setMessage("");

  //   try {
  //     const res = await fetch("/api/participants", {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ email, nickname, role }),
  //     });

  //     if (res.ok) {
  //       setMessage(`Einladung gesendet an ${email}`);
  //       setEmail("");
  //       setNickname("");
  //     } else {
  //       setMessage("Fehler beim Senden");
  //     }
  //   } catch {
  //     setMessage("Netzwerkfehler");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleInvite = async () => {
    if (!email || !nickname) return;
    setLoading(true);
    setMessage("");

    const success = await inviteUser({ email, nickname, role });

    if (success) {
      setMessage(`Einladung gesendet an ${email}`);
      setEmail("");
      setNickname("");
    } else {
      setMessage("Fehler beim Senden");
    }

    setLoading(false);
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
        {message && <p style={{ margin: "0.5rem 0", color: message.includes("gesendet") ? "green" : "red" }}>
          {message}
        </p>}
      </div>
    </div>
  );
}
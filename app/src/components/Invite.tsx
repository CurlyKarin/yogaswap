// src/components/Invite.tsx
import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { signIn } from "@aws-amplify/auth";

export default function Invite({ onSuccess }: { onSuccess?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // nickname (username) and optional email for display
  const nicknameParam = searchParams.get("nickname") || "";
  const emailDisplay = searchParams.get("email") || "";

  // user inputs
  const [tempPassword, setTempPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  
  // Defensive normalization: if your pool is case-insensitive, sign in with lowercase
  const usernameForSignIn = nicknameParam ? nicknameParam.toLowerCase() : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!nicknameParam) {
      setError("Ungültiger Link.");
      setLoading(false);
      return;
    }
    if (!tempPassword) {
      setError("Bitte das temporäre Passwort aus der E-Mail eingeben.");
      setLoading(false);
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      setLoading(false);
      return;
    }

    try {
      // 1) Sign in with temporary password
      const user = await signIn({ username: usernameForSignIn, password: tempPassword }) as any;

      // 2) If challenge required -> respond
      if (user?.challengeName === "NEW_PASSWORD_REQUIRED" && typeof user.respondToAuthChallenge === "function") {
        await user.respondToAuthChallenge({
          challengeName: "NEW_PASSWORD_REQUIRED",
          challengeResponses: {
            USERNAME: usernameForSignIn,
            NEW_PASSWORD: newPassword,
          },
        });
      }

      // success
      onSuccess?.();
      navigate("/", { replace: true });
    } catch (err: any) {
      console.error("Invite error:", err);
      const msg = err?.message || String(err);
      if (msg.includes("Incorrect username or password") || msg.includes("NotAuthorizedException")) {
        setError("Benutzername oder temporäres Passwort ist falsch. Bitte Admin um neue Einladung.");
      } else if (msg.includes("UserNotFoundException")) {
        setError("Benutzer nicht gefunden. Bitte Admin um Einladung.");
      } else if (msg.includes("expired") || msg.includes("expired or not found")) {
        setError("Der temporäre Account oder Link ist abgelaufen. Bitte Admin um neue Einladung.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!nicknameParam) return <p>Ungültiger Link.</p>;

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", padding: "1rem", border: "1px solid #eee", borderRadius: 8 }}>
      <h2>Passwort-Setup</h2>
      {emailDisplay && <p>Für: <strong>{emailDisplay}</strong></p>}
      <p>Benutzername: <strong>{nicknameParam}</strong></p>

      <form onSubmit={handleSubmit}>
        <label style={{ fontSize: 14 }}>
          Temporäres Passwort (aus der E-Mail)
          <input
            type="text"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value.trim())}
            disabled={loading}
            style={{ width: "100%", padding: "0.5rem", marginTop: 6, marginBottom: 12 }}
            placeholder="Temporäres Passwort hier eingeben"
          />
        </label>

        <label style={{ fontSize: 14 }}>
          Neues Passwort (min. 6 Zeichen)
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={loading}
            style={{ width: "100%", padding: "0.5rem", marginTop: 6, marginBottom: 12 }}
            placeholder="Neues Passwort"
            minLength={6}
          />
        </label>

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ width: "100%", padding: "0.6rem", marginTop: 8 }}>
          {loading ? "Verarbeite…" : "Passwort setzen"}
        </button>
      </form>
    </div>
  );
}

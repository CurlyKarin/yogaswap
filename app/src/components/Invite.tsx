// src/components/Invite.tsx
import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { signIn, confirmSignIn, fetchAuthSession } from "@aws-amplify/auth";
import { saveCurrentUser } from "shared/lib/storage";
import { User, UserRole } from "shared/types";

export default function Invite({ onSuccess }: { onSuccess?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // nickname (username) and optional email for display
  const nicknameParam = searchParams.get("nickname") || "";
  const emailDisplay = searchParams.get("email") || "";

  // Beim Aufruf der Invite-Seite: localStorage leeren, falls anderer User
  useEffect(() => {
    if (nicknameParam) {
      const stored = localStorage.getItem('yogaswap_user');
      if (stored) {
        try {
          const storedUser = JSON.parse(stored);
          if (storedUser.nickname && storedUser.nickname.toLowerCase() !== nicknameParam.toLowerCase()) {
            console.log(`Lösche localStorage für ${storedUser.nickname}, da neuer User ${nicknameParam} Passwort setzt`);
            localStorage.removeItem('yogaswap_user');
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [nicknameParam]);

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
      const result = await signIn({ username: usernameForSignIn, password: tempPassword });

      // 2) If challenge required -> confirm with new password
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        await confirmSignIn({ challengeResponse: newPassword });
      }

      // 3) Nach erfolgreichem Passwort-Setzen: User-Information aus Cognito holen
      const session = await fetchAuthSession();
      if (session.tokens?.idToken) {
        const payload = session.tokens.idToken.payload;
        const user: User = {
          nickname: payload.nickname as string,
          email: payload.email as string,
          role: (payload['custom:role'] as UserRole) || 'participant',
        };
        saveCurrentUser(user);
        console.log('User nach Passwort-Setzen gespeichert:', user);
      }

      // success
      onSuccess?.();
      navigate("/", { replace: true });
    } catch (err: unknown) {
      console.error("Invite error:", err);
      const msg = err instanceof Error ? err.message : String(err);
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

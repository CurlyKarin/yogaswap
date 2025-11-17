// src/components/Invite.tsx
import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { signIn } from "@aws-amplify/auth";

export default function Invite({ onSuccess }: { onSuccess?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const nickname = searchParams.get("nickname") || "";
  const emailForDisplay = searchParams.get("email") || "";
  const tempEncoded = searchParams.get("temp") || "";
  const tempPassword = tempEncoded ? atob(tempEncoded) : "";

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!nickname || !tempPassword) {
      setError("Ungültiger Link.");
      setIsLoading(false);
      return;
    }

    try {
      // defensive lowercase normalization (minimal change)
      const nicknameNormalized = nickname.toLowerCase();
      // 1) Sign in with the temporary password
      const user = await signIn({ username: nicknameNormalized, password: tempPassword }) as any;

      // 2) If Cognito requires new password, respond to the challenge
      if (user?.challengeName === "NEW_PASSWORD_REQUIRED") {
        if (!newPassword || newPassword.length < 6) {
          throw new Error("Bitte gib ein neues Passwort mit mindestens 6 Zeichen ein.");
        }
        // respondToAuthChallenge interface from v6 user object
        if (typeof user.respondToAuthChallenge === "function") {
          await user.respondToAuthChallenge({
            challengeName: "NEW_PASSWORD_REQUIRED",
            challengeResponses: {
              USERNAME: nickname,
              NEW_PASSWORD: newPassword,
            },
          });
        } else {
          // Fallback nur für den Fall, dass das Objekt anders aussieht
          throw new Error("Konnte Passwort-Challenge nicht ausführen.");
        }
      }

      // optional: onSuccess callback oder navigate
      onSuccess?.();
      navigate("/", { replace: true });
    } catch (err: any) {
      console.error("Invite sign-in error:", err);
      // Typische Fehlererkennung
      const msg = err?.message || String(err);
      if (msg.includes("Incorrect username or password") || msg.includes("NotAuthorizedException")) {
        setError("Benutzername oder temporäres Passwort ist falsch. Bitte Admin um neue Einladung.");
      } else if (msg.includes("UserNotFoundException")) {
        setError("Benutzer existiert nicht. Bitte Admin um erneute Einladung.");
      } else if (msg.includes("expired") || msg.includes("expired or not found")) {
        setError("Der Invite-Link ist abgelaufen. Bitte Admin um erneute Einladung.");
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!nickname || !tempPassword) return <p>Ungültiger Link.</p>;

  return (
    <div style={{ maxWidth: 420, margin: "2rem auto", padding: "1rem" }}>
      <h2>Passwort setzen</h2>
      {emailForDisplay && <p>Für: <strong>{emailForDisplay}</strong></p>}
      <p>Benutzername: <strong>{nickname}</strong></p>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Neues Passwort (min. 6 Zeichen)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={6}
          disabled={isLoading}
          style={{ width: "100%", padding: "0.5rem", marginBottom: 8 }}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={isLoading || newPassword.length < 6} style={{ width: "100%", padding: "0.5rem" }}>
          {isLoading ? "Wird gesetzt..." : "Passwort setzen"}
        </button>
      </form>
    </div>
  );
}

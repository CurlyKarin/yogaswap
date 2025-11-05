// app/src/components/Invite.tsx
import { useSearchParams, useNavigate } from "react-router-dom";
import { signIn, confirmSignIn } from "aws-amplify/auth";
import { useState } from "react";

interface InviteProps {
  onSuccess?: () => void;
}

export default function Invite({ onSuccess }: InviteProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get("email");
  const tempPassword = searchParams.get("temp");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!email || !tempPassword) {
      setError("Ungültiger Link");
      setIsLoading(false);
      return;
    }

    try {
      // 1. Mit Temp-Passwort einloggen
      await signIn({ username: email, password: tempPassword });

      // 2. Neues Passwort setzen
      await confirmSignIn({ challengeResponse: newPassword });

      // 3. Erfolg! → Weiterleitung
      onSuccess?.(); // Checkmark Aufruf aus App.tsx
      // navigate("/") wird in App.tsx gemacht
    } catch (err: any) {
      setError(err.message || "Fehler beim Setzen des Passworts");
    } finally {
      setIsLoading(false);
    }
  };

  if (!email || !tempPassword) {
    return <p>Ungültiger Link.</p>;
  }

  return (
    <div className="auth-form" style={{ maxWidth: 400, margin: "2rem auto", padding: "1rem" }}>
      <h2>Passwort setzen</h2>
      <p>Für: <strong>{email}</strong></p>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Neues Passwort (min. 6 Zeichen)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={6}
          disabled={isLoading}
          style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button
          type="submit"
          disabled={isLoading || newPassword.length < 6}
          style={{ width: "100%", padding: "0.5rem" }}
        >
          {isLoading ? "Wird gesetzt..." : "Passwort setzen"}
        </button>
      </form>
    </div>
  );
}
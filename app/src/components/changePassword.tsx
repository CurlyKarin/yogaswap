import { useState } from "react";
import { confirmSignIn, fetchAuthSession } from "aws-amplify/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { saveCurrentUser } from "shared/lib/storage";
import { User, UserRole } from "shared/types";

export default function ChangePassword() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { state } = useLocation();
  const navigate = useNavigate();

  const { username } = (state as { username: string }) || {};

  if (!username) {
    navigate("/login");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await confirmSignIn({ challengeResponse: password });
      const session = await fetchAuthSession();
      if (session.tokens?.idToken) {
        const payload = session.tokens.idToken.payload;
        const user: User = {
          nickname: payload.nickname as string,
          email: payload.email as string,
          role: (payload["custom:role"] as UserRole) || "participant",
        };
        saveCurrentUser(user);
      }
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form" style={{ padding: "2rem", maxWidth: 400, margin: "auto" }}>
      <h2>Neues Passwort</h2>
      <p>
        Willkommen <strong>{username}</strong>!
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Neues Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ fontSize: 16 }}
          required
        />
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary btn-block">
          Passwort festlegen
        </button>
      </form>
    </div>
  );
}
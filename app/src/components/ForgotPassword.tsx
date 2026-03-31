import { useState } from "react";
import { confirmResetPassword, fetchAuthSession, resetPassword } from "aws-amplify/auth";
import { useNavigate } from "react-router-dom";
import { saveCurrentUser } from "shared/lib/storage";
import { User, UserRole } from "shared/types";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    const user = username.trim();
    if (!user) {
      setError("Bitte Spitzname eingeben.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ username: user });
      setCodeSent(true);
      setInfo("Wenn ein Konto existiert, wurde ein Code per E-Mail versendet.");
    } catch {
      // Avoid user enumeration details.
      setCodeSent(true);
      setInfo("Wenn ein Konto existiert, wurde ein Code per E-Mail versendet.");
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    const user = username.trim();
    if (!user) {
      setError("Bitte Spitzname eingeben.");
      return;
    }
    if (!code.trim()) {
      setError("Bitte den Code aus der E-Mail eingeben.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      await confirmResetPassword({
        username: user,
        confirmationCode: code.trim(),
        newPassword,
      });
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.idToken) {
          const payload = session.tokens.idToken.payload;
          const signedInUser: User = {
            nickname: payload.nickname as string,
            email: payload.email as string,
            role: (payload["custom:role"] as UserRole) || "participant",
          };
          saveCurrentUser(signedInUser);
          navigate("/", { replace: true });
          return;
        }
      } catch {
        // If no session exists, continue to login route.
      }
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Passwort konnte nicht zurückgesetzt werden.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form" style={{ padding: "2rem", maxWidth: 420, margin: "auto" }}>
      <h2>Passwort vergessen</h2>
      <p className="muted">Fordere einen Code an und setze danach ein neues Passwort.</p>

      <form onSubmit={codeSent ? submitNewPassword : requestCode} className="todo-form">
        <input
          type="text"
          placeholder="Spitzname"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          required
        />

        {codeSent && (
          <>
            <input
              type="text"
              placeholder="Code aus E-Mail"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              required
            />
            <input
              type="password"
              placeholder="Neues Passwort"
              value={newPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              minLength={6}
              required
            />
          </>
        )}

        {info && <p style={{ color: "#374151" }}>{info}</p>}
        {error && <p style={{ color: "crimson" }}>{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary btn-block">
          {loading
            ? "Verarbeite..."
            : codeSent
              ? "Neues Passwort speichern"
              : "Code anfordern"}
        </button>
      </form>
    </div>
  );
}

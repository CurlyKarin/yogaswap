import { useState } from "react";
import { Link } from "react-router-dom";
import { requestSelfPasswordReset } from "../api/auth";

export default function ForgotPassword() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const mapResetRequestErrorMessage = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    const lowered = msg.toLowerCase();
    if (
      lowered.includes("toomanyrequestsexception") ||
      lowered.includes("limitexceededexception") ||
      lowered.includes("attempt limit exceeded") ||
      lowered.includes("too many")
    ) {
      return "Zu viele Anfragen. Bitte warte kurz und versuche es dann erneut.";
    }
    return "Wenn ein Konto existiert, wurde ein Reset-Link per E-Mail versendet.";
  };

  const requestResetLink = async () => {
    setError("");
    setInfo("");
    const user = username.trim();
    if (!user) {
      setError("Bitte Spitzname eingeben.");
      return;
    }

    setLoading(true);
    try {
      await requestSelfPasswordReset({ nickname: user });
      setRequested(true);
      setInfo("Wenn ein Konto existiert, wurde ein Reset-Link per E-Mail versendet.");
    } catch (err: unknown) {
      // Keep enumeration-safe default, but surface rate-limit feedback.
      const mapped = mapResetRequestErrorMessage(err);
      setInfo(mapped);
      setRequested(true);
    } finally {
      setLoading(false);
    }
  };
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestResetLink();
  };

  return (
    <div className="auth-form" style={{ padding: "2rem", maxWidth: 420, margin: "auto" }}>
      <h2>Passwort vergessen</h2>
      <p className="muted">
        Mit "Reset-Link anfordern" erhältst du eine E-Mail mit einem Link, über den du ein neues
        Passwort setzen kannst.
      </p>

      <form onSubmit={onSubmit} className="todo-form" autoComplete="on">
        <input
          type="text"
          name="username"
          placeholder="Spitzname"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          required
        />

        {info && (
          <p style={{ color: "#374151" }} role="status" aria-live="polite">
            {info}
          </p>
        )}
        {error && (
          <p style={{ color: "crimson" }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary btn-block">
          {loading ? "Verarbeite..." : requested ? "Link erneut senden" : "Reset-Link anfordern"}
        </button>
      </form>
      <p style={{ marginTop: 12, fontSize: 14 }}>
        <Link to="/login">Zur Anmeldung</Link>
      </p>
    </div>
  );
}

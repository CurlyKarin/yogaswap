import { useRef, useState } from "react";
import { confirmResetPassword, resetPassword, signOut } from "aws-amplify/auth";
import { useNavigate } from "react-router-dom";
import { clearCurrentUser } from "shared/lib/storage";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const newPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [lastSetPassword, setLastSetPassword] = useState("");
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);

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
    return "Wenn ein Konto existiert, wurde ein Code per E-Mail versendet.";
  };

  const startResendCooldown = (seconds = 30) => {
    setResendCooldownSeconds(seconds);
    const id = window.setInterval(() => {
      setResendCooldownSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const getUsernameValue = () => {
    const fromState = username.trim();
    if (fromState) return fromState;
    const fromInput = usernameInputRef.current?.value?.trim() ?? "";
    return fromInput;
  };

  /** Keychain/Safari setzt generierte Passwörter oft per input-Event, nicht change — State sonst leer beim Submit. */
  const getNewPasswordValue = () => {
    const fromState = newPassword;
    if (fromState.trim()) return fromState;
    return newPasswordInputRef.current?.value ?? "";
  };

  const requestCodeForUser = async () => {
    setError("");
    setInfo("");
    setResetDone(false);
    const user = getUsernameValue();
    if (!user) {
      setError("Bitte Spitzname eingeben.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ username: user });
      setCodeSent(true);
      setInfo("Wenn ein Konto existiert, wurde ein Code per E-Mail versendet.");
      startResendCooldown();
    } catch (err: unknown) {
      // Keep enumeration-safe default, but surface rate-limit feedback.
      const mapped = mapResetRequestErrorMessage(err);
      setInfo(mapped);
    } finally {
      setLoading(false);
    }
  };
  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestCodeForUser();
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    const user = getUsernameValue();
    if (!user) {
      setError("Bitte Spitzname eingeben.");
      return;
    }
    if (!code.trim()) {
      setError("Bitte den Code aus der E-Mail eingeben.");
      return;
    }
    const pw = getNewPasswordValue();
    if (!pw || pw.length < 6) {
      setError("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      await confirmResetPassword({
        username: user,
        confirmationCode: code.trim(),
        newPassword: pw,
      });
      // Password reset should never "auto-login" from this view.
      // We force a clean auth state and redirect to login.
      try {
        await signOut({ global: true });
      } catch {
        // ignore when no active session exists
      }
      clearCurrentUser();
      setLastSetPassword(pw);
      // Kurz warten, damit der Browser die erfolgreiche Passwort-Übermittlung (inkl. Keychain) abarbeiten kann,
      // bevor React das Formular neu rendert.
      queueMicrotask(() => {
        setResetDone(true);
        setInfo("Passwort wurde zurueckgesetzt. Du kannst jetzt zur Anmeldung wechseln.");
      });
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
      <p className="muted">
        {codeSent
          ? "Gib den Code aus der E-Mail ein und setze ein neues Passwort."
          : "Fordere einen Code an und setze danach ein neues Passwort."}
      </p>

      <form
        onSubmit={codeSent ? submitNewPassword : requestCode}
        className="todo-form"
        autoComplete={codeSent ? "on" : "off"}
      >
        <input
          ref={usernameInputRef}
          type="text"
          name="username"
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
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code aus E-Mail"
              aria-label="Code aus E-Mail"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              required
            />
            <input
              ref={newPasswordInputRef}
              type="password"
              name="new-password"
              placeholder="Neues Passwort"
              value={newPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
              onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
              disabled={loading}
              minLength={6}
              required
            />
          </>
        )}

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
          {loading
            ? "Verarbeite..."
            : codeSent
              ? "Neues Passwort setzen"
              : "Code anfordern"}
        </button>
        {codeSent && !resetDone && (
          <button
            type="button"
            className="btn-block"
            disabled={loading || resendCooldownSeconds > 0}
            onClick={() => {
              void requestCodeForUser();
            }}
          >
            {resendCooldownSeconds > 0
              ? `Code erneut anfordern (${resendCooldownSeconds}s)`
              : "Code erneut anfordern"}
          </button>
        )}
        {resetDone && (
          <button
            type="button"
            className="btn-block"
            onClick={() =>
              navigate("/login", {
                replace: true,
                state: {
                  info:
                    "Passwort wurde zurueckgesetzt. Bitte melde dich mit deinem neuen Passwort an.",
                  prefillUsername: username.trim(),
                  prefillPassword: lastSetPassword,
                },
              })
            }
          >
            Zur Anmeldung
          </button>
        )}
      </form>
    </div>
  );
}

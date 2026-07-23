// app/src/components/Login.tsx
import { User } from "shared/types";
import { loadCurrentUser } from "shared/lib/storage";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCognitoAuth } from "../auth/useCognitoAuth";
import { isDemoLoginEnabled } from "../lib/demoLoginFlag";

type Props = {
  onLogin: (user: User) => void;
};
type LoginRouteState = {
  info?: unknown;
  prefillUsername?: unknown;
  prefillPassword?: unknown;
};

const DEMO_USERNAME = "Luna";
const DEMO_PASSWORD = "Hallo123!";

export default function Login({ onLogin }: Props) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const prefillUsername =
    typeof (state as LoginRouteState | null)?.prefillUsername === "string"
      ? ((state as LoginRouteState).prefillUsername as string).trim()
      : "";
  const prefillPassword =
    typeof (state as LoginRouteState | null)?.prefillPassword === "string"
      ? ((state as LoginRouteState).prefillPassword as string)
      : "";
  const fromPasswordResetFlow = prefillUsername.length > 0;
  const useDemoPrefill = isDemoLoginEnabled() && !fromPasswordResetFlow;
  const [username, setUsername] = useState(useDemoPrefill ? DEMO_USERNAME : prefillUsername);
  const [password, setPassword] = useState(useDemoPrefill ? DEMO_PASSWORD : prefillPassword);
  const { login, isLoading, error } = useCognitoAuth();
  const infoMessage = typeof (state as LoginRouteState | null)?.info === "string"
    ? ((state as LoginRouteState).info as string)
    : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login({ username, password });
    if (success) {
      if (fromPasswordResetFlow && username.trim() && password) {
        // Best-effort trigger for password managers after reset flows.
        // Some browsers (especially with generated passwords) only offer save/update
        // when Credential Management API is explicitly touched.
        try {
          const maybeCtor = (window as unknown as { PasswordCredential?: new (data: { id: string; password: string }) => unknown })
            .PasswordCredential;
          const credsApi = (navigator as Navigator & { credentials?: { store?: (credential: unknown) => Promise<unknown> } })
            .credentials;
          if (maybeCtor && credsApi?.store) {
            const credential = new maybeCtor({ id: username.trim(), password });
            void credsApi.store(credential);
          }
        } catch {
          // ignore: unsupported browser or blocked API
        }
      }
      const user = loadCurrentUser();
      if (user) {
        onLogin(user);
      }
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="login-wrap">
      <h1>YogaSwap Login</h1>
      <form onSubmit={handleSubmit} className="todo-form">
        <input
          aria-label="Spitzname"
          type="text"
          name="username"
          placeholder="Spitzname"
          value={username}
          autoComplete="username"
          onChange={e => setUsername(e.target.value)}
          disabled={isLoading}
        />
        <input
          aria-label="Passwort"
          type="password"
          name="password"
          placeholder="Passwort"
          value={password}
          autoComplete={fromPasswordResetFlow ? "new-password" : "current-password"}
          onChange={e => setPassword(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading} className="btn-primary btn-block">
          {isLoading ? "Lädt..." : "Login"}
        </button>
      </form>
      <p style={{ marginTop: 8, fontSize: 14 }}>
        <Link to="/forgot-password">Passwort vergessen?</Link>
      </p>

      {infoMessage && (
        <p style={{ color: "#374151" }} role="status" aria-live="polite">
          {infoMessage}
        </p>
      )}
      {fromPasswordResetFlow && (
        <p className="muted" style={{ marginTop: 0 }}>
          Bitte gib dein neu gesetztes Passwort ein.
        </p>
      )}
      {error && (
        <p style={{ color: "crimson" }} role="alert">
          {error}
        </p>
      )}

      {useDemoPrefill && (
        <p style={{ fontSize: 12, opacity: 0.8 }}>
          Demo: <code>{DEMO_USERNAME}</code> / <code>{DEMO_PASSWORD}</code>
        </p>
      )}
    </div>
  );
}

// app/src/components/Login.tsx
import { User } from "shared/types";
import { loadCurrentUser } from "shared/lib/storage";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCognitoAuth } from "../auth/useCognitoAuth";

type Props = {
  onLogin: (user: User) => void;
};

// Demo: voreingestellter Nutzer (später nur in Demo-Variante oder ganz entfernen)
const DEMO_USERNAME = "Luna";
const DEMO_PASSWORD = "Hallo123!";

export default function Login({ onLogin }: Props) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState(DEMO_USERNAME);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const { login, isLoading, error } = useCognitoAuth();
  const infoMessage = typeof (state as { info?: unknown } | null)?.info === "string"
    ? (state as { info: string }).info
    : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login({ username, password });
    if (success) {
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
          type="text"
          placeholder="Spitzname"
          value={username}
          autoComplete="username"
          onChange={e => setUsername(e.target.value)}
          disabled={isLoading}
        />
        <input
          type="password"
          placeholder="Passwort"
          value={password}
          autoComplete="current-password"
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

      {infoMessage && <p style={{ color: "#374151" }}>{infoMessage}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ fontSize: 12, opacity: 0.8 }}>
        Demo: <code>{DEMO_USERNAME}</code> / <code>{DEMO_PASSWORD}</code>
      </p>
    </div>
  );
}

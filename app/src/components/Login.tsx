// app/src/components/Login.tsx
import { User } from "shared/types";
import { loadCurrentUser } from "shared/lib/storage";
import { useState } from "react";
import { useCognitoAuth } from "../auth/useCognitoAuth";

type Props = {
  onLogin: (user: User) => void;
};

// Demo: voreingestellter Nutzer (später nur in Demo-Variante oder ganz entfernen)
const DEMO_USERNAME = "Luna";
const DEMO_PASSWORD = "Hallo123!";

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState(DEMO_USERNAME);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const { login, isLoading, error } = useCognitoAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login({ username, password });
    if (success) {
      const user = loadCurrentUser();
      onLogin(user!);
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
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Lädt..." : "Login"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ fontSize: 12, opacity: 0.8 }}>
        Demo: <code>{DEMO_USERNAME}</code> / <code>{DEMO_PASSWORD}</code>
      </p>
    </div>
  );
}

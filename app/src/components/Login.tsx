
import { User } from "shared/types";
import { loadCurrentUser } from "shared/lib/storage";
import { useState } from "react";
import { LoginCredentials, useAuth } from "shared/auth";

type Props = {
  onLogin: (user: User) => void;
};

export default function Login({ onLogin }: Props) {
  const [nickname, setNickname] = useState("Admin");  // Checkmark Standard: Admin
  const [password, setPassword] = useState("Admin123!");
  const { login, isLoading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login({ email:nickname, password } as LoginCredentials);
    if (success) {
      const user = loadCurrentUser(); // Checkmark direkt aufrufen
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
          value={nickname}
          autoComplete="username"
          onChange={e => setNickname(e.target.value)}
          disabled={isLoading}
        />
        <input
          type="password"
          placeholder="password"
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
        Demo: <code>Admin</code> / <code>Admin123!</code>
      </p>
    </div>
  );
}


import { User } from "shared/types";
import { loadCurrentUser } from "shared/lib/storage";
import { useState } from "react";
import { LoginCredentials, useAuth } from "shared/auth";

type Props = {
  onLogin: (user: User) => void;
};

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("luna@example.com");
  const [password, setPassword] = useState("1234");
  //const [error, setError] = useState<string | null>(null);
  const { login, isLoading, error } = useAuth();

  // const handleSubmit = (e: React.FormEvent) => {
  //   e.preventDefault();
  //   const user = users.find(u => u.email === email);
  //   if (user && password === '1234') { // Fallback-Password für Demo
  //     saveCurrentUser(user);
  //     onLogin(user);
  //   } else {
  //     setError("Invalid email or password");
  //   }
  // };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login({ email, password } as LoginCredentials);
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
          type="email"
          placeholder="email"
          value={email}
          autoComplete="username"
          onChange={e => setEmail(e.target.value)}
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
        Demo-Zugang: z. B. <code>luna@example.com</code> / <code>1234</code>
      </p>
    </div>
  );
}

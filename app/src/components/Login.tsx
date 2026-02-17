// app/src/components/Login.tsx
import { User } from "shared/types";
import { loadCurrentUser } from "shared/lib/storage";
import { useState } from "react";
import { useCognitoAuth } from "../auth/useCognitoAuth";

type Props = {
  onLogin: (user: User) => void;
};

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("admin");  // Checkmark Spitzname!
  const [password, setPassword] = useState("Hallo123!");
  const { login, isLoading, error } = useCognitoAuth();

  console.log('Login component rendered');
  console.log('Using auth: useCognitoAuth');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login button clicked!');  // Checkmark DEBUG!
    console.log('Credentials:', { username, password });

    const success = await login({ username, password }); 
    console.log('Login success?', success);

    if (success) {
      const user = loadCurrentUser();
      console.log('User loaded:', user);
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
        Demo: <code>admin</code> / <code>Hallo123!</code>
      </p>
    </div>
  );
}

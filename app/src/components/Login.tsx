import { useState } from "react";
import { users } from "../data/users";
import { saveCurrentUser } from "../lib/storage";
import type { User } from "../types";
import React from "react";
//import "./Login.css"; // optional, falls du eigenes login-css möchtest

type Props = {
  onLogin: (user: User) => void;
};

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("luna@example.com");
  const [password, setPassword] = useState("1234");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
      saveCurrentUser(user);
      onLogin(user);
    } else {
      setError("Invalid email or password");
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
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          autoComplete="current-password"
          onChange={e => setPassword(e.target.value)}
        />
        <button type="submit">Login</button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ fontSize: 12, opacity: 0.8 }}>
        Demo-Zugang: z. B. <code>luna@example.com</code> / <code>1234</code>
      </p>
    </div>
  );
}

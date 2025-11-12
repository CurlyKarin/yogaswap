// app/src/components/ChangePassword.tsx
import { useState } from 'react';
import { confirmSignIn } from 'aws-amplify/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveCurrentUser } from 'shared/lib/storage';

export default function ChangePassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { state } = useLocation();
  const navigate = useNavigate();

  const { username } = state as { username: string } || {};

  if (!username) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await confirmSignIn({ challengeResponse: password });

      saveCurrentUser({ nickname: username, email: `${username}@yogaswap.de`, role: 'admin' });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Fehler');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form" style={{ padding: '2rem', maxWidth: 400, margin: 'auto' }}>
      <h2>Neues Passwort</h2>
      <p>Willkommen <strong>{username}</strong>!</p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Neues Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={loading}>
          Speichern
        </button>
      </form>
    </div>
  );
}
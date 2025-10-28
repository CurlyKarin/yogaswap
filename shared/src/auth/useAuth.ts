// shared/src/auth/useAuth.ts
import { useCallback, useState } from 'react';
import { User } from '..';
import { saveCurrentUser, loadCurrentUser, clearCurrentUser } from '../lib/storage';
import { users } from '../data/mockUsers';

// Typ für Login-Credentials
export type LoginCredentials = {
  email: string;
  password: string;
};

// Auth-Hook (aktuell: Fake-Login, später: Cognito)
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(loadCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Checkmark Fake-Login (später ersetzt durch Cognito)
      const foundUser = users.find(u => u.email === credentials.email);
      if (foundUser && credentials.password === '1234') { // Demo-Passwort
        saveCurrentUser(foundUser);
        setUser(foundUser);
        return true;
      } else {
        setError('Ungültige E-Mail oder Passwort');
        return false;
      }
    } catch (err) {
      setError('Login fehlgeschlagen');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearCurrentUser();
    setUser(null);
  }, []);

  const refreshUser = useCallback(() => {
    const stored = loadCurrentUser();
    setUser(stored);
  }, []);

  return {
    user,
    isLoading,
    error,
    login,
    logout,
    refreshUser,
  };
};
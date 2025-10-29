// shared/src/auth/useAuth.ts
import { useCallback, useState } from 'react';
import { User, UserRole } from '..';
import { saveCurrentUser, loadCurrentUser, clearCurrentUser } from '../lib/storage';
import { users } from '../data/mockUsers';

export type LoginCredentials = { email: string; password: string };

// Auth-Hook (aktuell: Fake-Login, später: Cognito)
export const useAuth = (useCognito: boolean = false) => {
  const [user, setUser] = useState<User | null>(loadCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    setError(null);

    try {
      if (useCognito) {
        // Checkmark Wird später in app überschrieben
        throw new Error('Cognito nicht verfügbar');
      } else {
        const foundUser = users.find(u => u.email === credentials.email);
        if (foundUser && credentials.password === '1234') {
          saveCurrentUser(foundUser);
          setUser(foundUser);
          return true;
        } else {
          setError('Ungültige E-Mail oder Passwort');
          return false;
        }
      }
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
      return false;
    } finally {
      setIsLoading(false);
    }
 }, [useCognito]);

  const logout = useCallback(() => {
    clearCurrentUser();
    setUser(null);
  }, []);

  return { user, isLoading, error, login, logout };
};
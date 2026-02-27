// shared/src/auth/useAuth.ts
import { useCallback, useState } from 'react';
import { loadCurrentUser, saveCurrentUser, clearCurrentUser } from "shared/lib/storage";
import { useCognitoAuth } from './useCognitoAuth';
import { User } from 'shared/types';
import { users } from 'shared/data/mockUsers';

export type LoginCredentials = { 
  username: string; 
  password: string; 
};

// Auth-Hook (DEV: Fake-Login, Prod: Cognito)
export const useAuth = () => {
  const cognito = useCognitoAuth();
  const [user, setUser] = useState<User | null>(loadCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const foundUser = users.find((u) => u.nickname === credentials.username);
      if (foundUser && credentials.password === "1234") {
        saveCurrentUser(foundUser);
        setUser(foundUser);
        return true;
      }
      setError("Ungültiger Spitzname oder Passwort");
      return false;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearCurrentUser();
    setUser(null);
  }, []);

  if (import.meta.env.DEV) {
    return { user, isLoading, error, login, logout };
  }
  return cognito;
};
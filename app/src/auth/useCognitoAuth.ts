// app/src/auth/useCognitoAuth.ts
import { signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { saveCurrentUser, loadCurrentUser, clearCurrentUser } from 'shared/lib/storage';
import { useCallback, useState } from 'react';
import { User, UserRole } from 'shared/types';
import { useNavigate } from 'react-router-dom';

type AuthReturn = {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (credentials: { username: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
};

export const useCognitoAuth = (): AuthReturn => {
  const [user, setUser] = useState<User | null>(loadCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const login = useCallback(async (credentials: { username: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      let result;
      try {
        result = await signIn({
          username: credentials.username,
          password: credentials.password,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("UserAlreadyAuthenticatedException")) {
          try {
            await signOut({ global: true });
          } catch {
            // continue with local cleanup and retry
          }
          clearCurrentUser();
          setUser(null);
          result = await signIn({
            username: credentials.username,
            password: credentials.password,
          });
        } else {
          throw err;
        }
      }

      if (result.nextStep?.signInStep?.includes('NEW_PASSWORD_REQUIRED')) {
        navigate('/change-password', {
          state: { username: credentials.username },
        });
        setIsLoading(false);
        return false;
      }

      const session = await fetchAuthSession();
      const payload = session.tokens?.idToken?.payload;

      const user: User = {
        nickname: payload?.nickname as string,
        email: payload?.email as string,
        role: (payload?.['custom:role'] as UserRole) || 'participant',
      };

      saveCurrentUser(user);
      setUser(user);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      await signOut({ global: true });
    } catch {
      // User ist lokal trotzdem ausgeloggt
    }
    clearCurrentUser();
    setUser(null);
  }, []);

  return { user, isLoading, error, login, logout };
};
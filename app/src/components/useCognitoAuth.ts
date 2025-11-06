// app/src/auth/useCognitoAuth.ts
import { signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { saveCurrentUser, loadCurrentUser, clearCurrentUser } from 'shared/lib/storage';
import { useCallback, useState } from 'react';
import { User, UserRole } from 'shared/types';

export const useCognitoAuth = () => {
  const [user, setUser] = useState<User | null>(loadCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn({ username, password });  // Checkmark username = nickname!
      const session = await fetchAuthSession();
      const payload = session.tokens?.idToken?.payload;

      const user: User = {
        nickname: payload?.nickname as string,
        email: payload?.email as string,
        role: (payload?.role as UserRole) || 'participant',  // Checkmark role direkt
      };

      saveCurrentUser(user);
      setUser(user);
      return true;
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch {}
    clearCurrentUser();
    setUser(null);
  }, []);

  const refreshUser = useCallback(() => {
    const stored = loadCurrentUser();
    setUser(stored);
  }, []);

  return { user, isLoading, error, login, logout, refreshUser };
};
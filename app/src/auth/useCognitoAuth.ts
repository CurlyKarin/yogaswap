// app/src/auth/useCognitoAuth.ts
import { signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { saveCurrentUser, loadCurrentUser, clearCurrentUser } from 'shared/lib/storage';
import { useCallback, useState } from 'react';
import { User, UserRole } from 'shared/types';
import { useNavigate } from 'react-router-dom';  // Checkmark IMPORT!

// Checkmark Rückgabetyp definieren
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
    console.log('useCognitoAuth.login called!');  // Checkmark MUSS ERSCHEINEN!
    setIsLoading(true);
    setError(null);
    try {
      console.log('Calling signIn...');
      const result = await signIn({
        username: credentials.username,
        password: credentials.password,
      });

      console.log('signIn SUCCESS:', result);

      // Checkmark Alle möglichen NEW_PASSWORD Fälle
      if (
        result.nextStep?.signInStep?.includes('NEW_PASSWORD_REQUIRED')
      ) {
        console.log('Redirecting to /change-password');
        navigate('/change-password', {
          state: { username: credentials.username },
        });
        setIsLoading(false);
        return false;
      }

      // Normaler Login
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
    } catch (err: any) {
      console.error('LOGIN FAILED!');
      console.error('Error:', err);
      console.error('Name:', err.name);
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
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

  return { user, isLoading, error, login, logout };
};
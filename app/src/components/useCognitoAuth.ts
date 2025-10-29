// app/src/auth/useCognitoAuth.ts
import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { saveCurrentUser, loadCurrentUser, clearCurrentUser } from 'shared/lib/storage';
import { useCallback, useState } from 'react';
import { User, UserRole } from 'shared/types';

export const useCognitoAuth = () => {
  const [user, setUser] = useState<User | null>(loadCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

//   const login = useCallback(async (email: string, password: string) => {
//     setIsLoading(true);
//     setError(null);

//     try {
//       const result = await signIn({ username: email, password });
      
//       if (result.isSignedIn) {
//         // Checkmark v6: Kein .user → Nutze getCurrentUser oder attributes
//         const session = await fetchAuthSession(); // Checkmark aus aws-amplify/auth
//         const attributes = session.tokens?.idToken?.payload;
        
//         const user: User = {
//           nickname: (attributes?.['custom:nickname'] as string) || email,
//           email: attributes?.email as string,
//           role: attributes?.['custom:role'] as UserRole || 'participant',
//         };

//         saveCurrentUser(user);
//         setUser(user);
//         return true;
//       }
//     } catch (err: any) {
//       setError(err.message || 'Login fehlgeschlagen');
//     } finally {
//       setIsLoading(false);
//     }
//     return false;
//   }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
        await signIn({ username: email, password });

        const session = await fetchAuthSession();
        const attributes = session.tokens?.idToken?.payload;

        const user: User = {
            nickname: (attributes?.['custom:nickname'] as string) || email,
            email: attributes?.email as string,
            role: attributes?.['custom:role'] as UserRole || 'participant',
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
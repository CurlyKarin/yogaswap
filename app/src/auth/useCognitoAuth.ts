// app/src/auth/useCognitoAuth.ts
import { signIn, fetchAuthSession } from "aws-amplify/auth";
import { saveCurrentUser, loadCurrentUser } from "shared/lib/storage";
import { useCallback, useState } from "react";
import { User, UserRole } from "shared/types";
import { clearCognitoSession, isUserAlreadyAuthenticatedError } from "./cognitoSession";

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

  const login = useCallback(async (credentials: { username: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      // Vor signIn immer Session clearen — sonst "There is already a signed in user."
      // (Amplify message enthält nicht den Exception-Namen; Catch allein war unzuverlässig.)
      await clearCognitoSession();
      setUser(null);

      let result;
      try {
        result = await signIn({
          username: credentials.username,
          password: credentials.password,
        });
      } catch (err: unknown) {
        if (isUserAlreadyAuthenticatedError(err)) {
          await clearCognitoSession();
          setUser(null);
          result = await signIn({
            username: credentials.username,
            password: credentials.password,
          });
        } else {
          throw err;
        }
      }

      if (result.nextStep?.signInStep?.includes("NEW_PASSWORD_REQUIRED")) {
        await clearCognitoSession();
        setUser(null);
        setError(
          "Dieser Zugang erwartet einen veralteten Temp-Passwort-Flow. Bitte nutze 'Passwort vergessen?'.",
        );
        return false;
      }

      const session = await fetchAuthSession();
      const payload = session.tokens?.idToken?.payload;

      const nextUser: User = {
        nickname: payload?.nickname as string,
        email: payload?.email as string,
        role: (payload?.["custom:role"] as UserRole) || "participant",
      };

      saveCurrentUser(nextUser);
      setUser(nextUser);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await clearCognitoSession();
    setUser(null);
  }, []);

  return { user, isLoading, error, login, logout };
};

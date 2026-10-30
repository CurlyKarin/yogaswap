// app/src/auth/useCognitoAuth.ts
import { signIn, fetchAuthSession } from "aws-amplify/auth";
import { saveCurrentUser, loadCurrentUser } from "shared/lib/storage";
import { useCallback, useState } from "react";
import { User, UserRole } from "shared/types";
import { resolveLogin } from "../api/auth";
import { clearCognitoSession, isUserAlreadyAuthenticatedError } from "./cognitoSession";

type AuthReturn = {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (credentials: { username: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
};

/** Amplify liefert bei RESET_REQUIRED kein Throw, sondern signInStep RESET_PASSWORD (#413). */
function messageForIncompleteSignIn(signInStep: string | undefined): string {
  if (!signInStep || signInStep === "DONE") {
    return "Login fehlgeschlagen. Bitte erneut versuchen.";
  }
  if (signInStep === "RESET_PASSWORD") {
    return "Für diesen Zugang ist ein Passwort-Reset nötig. Bitte nutze „Passwort vergessen?“.";
  }
  if (signInStep.includes("NEW_PASSWORD_REQUIRED")) {
    return "Dieser Zugang erwartet einen veralteten Temp-Passwort-Flow. Bitte nutze „Passwort vergessen?“.";
  }
  if (signInStep === "CONFIRM_SIGN_UP") {
    return "Dieser Zugang ist noch nicht bestätigt. Bitte den Link aus der Einladungs-Mail nutzen.";
  }
  return "Login konnte nicht abgeschlossen werden. Bitte erneut versuchen oder „Passwort vergessen?“ nutzen.";
}

export const useCognitoAuth = (): AuthReturn => {
  const [user, setUser] = useState<User | null>(loadCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: { username: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      // Studio-Login-Name → Cognito Username (#324); Legacy: oft identisch.
      let cognitoUsername = credentials.username.trim();
      let studioNickname = cognitoUsername;
      try {
        const resolved = await resolveLogin({ nickname: cognitoUsername });
        if (resolved.cognitoUsername?.trim()) {
          cognitoUsername = resolved.cognitoUsername.trim();
        }
        if (resolved.nickname?.trim()) {
          studioNickname = resolved.nickname.trim();
        }
      } catch {
        setError("Login fehlgeschlagen");
        return false;
      }

      // Vor signIn immer Session clearen — sonst "There is already a signed in user."
      // (Amplify message enthält nicht den Exception-Namen; Catch allein war unzuverlässig.)
      await clearCognitoSession();
      setUser(null);

      let result;
      try {
        result = await signIn({
          username: cognitoUsername,
          password: credentials.password,
        });
      } catch (err: unknown) {
        if (isUserAlreadyAuthenticatedError(err)) {
          await clearCognitoSession();
          setUser(null);
          result = await signIn({
            username: cognitoUsername,
            password: credentials.password,
          });
        } else {
          throw err;
        }
      }

      const signInStep = result.nextStep?.signInStep;
      const signedInCompletely = result.isSignedIn === true && signInStep === "DONE";
      if (!signedInCompletely) {
        await clearCognitoSession();
        setUser(null);
        setError(messageForIncompleteSignIn(signInStep));
        return false;
      }

      const session = await fetchAuthSession();
      const payload = session.tokens?.idToken?.payload;
      if (!payload) {
        await clearCognitoSession();
        setUser(null);
        setError("Login fehlgeschlagen. Bitte erneut versuchen.");
        return false;
      }

      const nextUser: User = {
        // Actor = Studio-Login-Name (Tenant), nicht opaque Cognito-Username / JWT-nickname anderer Studios.
        nickname: studioNickname || (payload.nickname as string) || credentials.username,
        email: payload.email as string,
        role: (payload["custom:role"] as UserRole) || "participant",
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

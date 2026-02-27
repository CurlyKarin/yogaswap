// app/src/auth/useAppAuth.ts

import { useAuth } from "./useAuth";
import { useCognitoAuth } from "./useCognitoAuth";

export const useAppAuth = () => {
  const devAuth = useAuth();
  const cognitoAuth = useCognitoAuth();
  return import.meta.env.DEV ? devAuth : cognitoAuth;
};
// app/src/auth/useAppAuth.ts

import { useCognitoAuth } from './useCognitoAuth';
import { useAuth } from './useAuth';


export const useAppAuth = () => {
  return import.meta.env.DEV ? useAuth() : useCognitoAuth();
};
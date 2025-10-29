// app/src/auth/useAppAuth.ts
import { useAuth } from 'shared/auth';
import { useCognitoAuth } from '../components/useCognitoAuth';


export const useAppAuth = () => {
  return import.meta.env.DEV ? useAuth() : useCognitoAuth();
};
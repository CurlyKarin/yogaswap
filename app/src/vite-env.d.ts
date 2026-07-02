/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_DEFAULT_TENANT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_DEFAULT_TENANT_ID?: string;
  /** Parent-Host für Studio-Subdomains, z. B. app.yogaswap.de (#249). */
  readonly VITE_MULTI_TENANT_PARENT_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
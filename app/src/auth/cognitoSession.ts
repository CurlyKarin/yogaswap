import { signOut } from "aws-amplify/auth";
import { clearCurrentUser } from "shared/lib/storage";

/** Amplify AuthError: name=UserAlreadyAuthenticatedException, message="There is already a signed in user." */
export function isUserAlreadyAuthenticatedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  return (
    name === "UserAlreadyAuthenticatedException" ||
    code === "UserAlreadyAuthenticatedException" ||
    message.includes("UserAlreadyAuthenticatedException") ||
    /already a signed in user/i.test(message)
  );
}

/** Cognito + lokaler User-Cache leeren (Invite-/Login-Flows). */
export async function clearCognitoSession(): Promise<void> {
  try {
    await signOut({ global: true });
  } catch {
    // Niemand eingeloggt → No-Op.
  }
  clearCurrentUser();
}

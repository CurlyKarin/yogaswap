// src/components/Invite.tsx
import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { signIn, fetchAuthSession, signOut, confirmResetPassword } from "@aws-amplify/auth";
import { saveCurrentUser, clearCurrentUser } from "shared/lib/storage";
import { User, UserRole } from "shared/types";
import { updateParticipant } from "../api/participants";
import { startPasswordResetFromToken } from "../api/auth";

type AuthViewMode = "invite_activation" | "password_recovery" | "admin_reset";

function parseMode(modeRaw: string | null): AuthViewMode | null {
  const v = (modeRaw || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "invite_activation" || v === "password_recovery" || v === "admin_reset") return v;
  // Backward compatibility for older links
  if (v === "invite-activation") return "invite_activation";
  if (v === "password-recovery") return "password_recovery";
  if (v === "admin-reset") return "admin_reset";
  return null;
}

function mapTokenStartErrorMessage(rawMessage: string): string {
  const msg = rawMessage.trim();
  if (!msg) return "Token konnte nicht verarbeitet werden.";
  if (msg.includes("Token purpose is invalid")) {
    return "Dieser Link gehoert zu einem anderen Vorgang. Bitte nutze den neuesten Link aus deiner E-Mail.";
  }
  if (msg.includes("Token superseded by newer link")) {
    return "Dieser Link wurde durch einen neueren Link ersetzt. Bitte nutze die zuletzt gesendete E-Mail.";
  }
  return msg;
}

export default function Invite({ onSuccess }: { onSuccess?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // nickname (username) and optional email for display
  const nicknameParam = searchParams.get("nickname") || "";
  const emailDisplay = searchParams.get("email") || "";
  const tokenParam = searchParams.get("token");
  const tenantIdParam = searchParams.get("tenantId");
  const modeParam = parseMode(searchParams.get("mode"));
  const tokenMode = !!tokenParam && !!tenantIdParam;
  const authMode: AuthViewMode = modeParam ?? "password_recovery";

  const modeCopy: Record<AuthViewMode, { subtitle: string; submitLabel: string }> = {
    invite_activation: {
      subtitle: "Aktiviere deinen Zugang, indem du den Code aus der E-Mail eingibst.",
      submitLabel: "Zugang aktivieren",
    },
    password_recovery: {
      subtitle: "Setze jetzt ein neues Passwort. Gib dazu den Code aus der E-Mail ein.",
      submitLabel: "Passwort setzen",
    },
    admin_reset: {
      subtitle: "Dein Passwort wurde durch das Studio zurueckgesetzt. Gib den Code aus der E-Mail ein.",
      submitLabel: "Passwort setzen",
    },
  };

  const subtitleText = modeCopy[authMode].subtitle;

  // Beim Aufruf der Invite-Seite: localStorage leeren, falls anderer User
  useEffect(() => {
    if (nicknameParam) {
      const stored = localStorage.getItem('yogaswap_user');
      if (stored) {
        try {
          const storedUser = JSON.parse(stored);
          if (storedUser.nickname && storedUser.nickname.toLowerCase() !== nicknameParam.toLowerCase()) {
            console.log(`Lösche localStorage für ${storedUser.nickname}, da neuer User ${nicknameParam} Passwort setzt`);
            localStorage.removeItem('yogaswap_user');
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [nicknameParam]);

  // Invite-Flow: sicherstellen, dass kein anderer Cognito-User eingeloggt ist.
  // Sonst wirft Amplify bei signIn() -> UserAlreadyAuthenticatedException.
  useEffect(() => {
    if (!tokenMode) return;
    setAuthCleared(false);
    (async () => {
      try {
        await signOut({ global: true });
      } catch {
        // Wenn niemand eingeloggt ist, ist signOut ein No-Op.
      }
      // Token-Flow ist "public": wir wollen auf keinen Fall einen alten localStorage-User behalten.
      try {
        clearCurrentUser();
      } catch {
        // ignore
      }
      setAuthCleared(true);
    })();
  }, [nicknameParam, tokenMode]);

  // user inputs
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [usernameForReset, setUsernameForReset] = useState("");

  // Wir blockieren den Submit, bis ein eventuelles vorheriges signOut abgeschlossen ist.
  // Sonst kann Amplify bei signIn() -> UserAlreadyAuthenticatedException werfen.
  const [authCleared, setAuthCleared] = useState(false);

  
  // Token-Flow: Beim Laden wird serverseitig der Cognito-Code-Reset angestoßen.
  useEffect(() => {
    if (!tokenMode) return;
    if (!authCleared) return;
    if (!tokenParam || !tenantIdParam) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setCodeSent(false);
      setUsernameForReset("");
      try {
        const resp = await startPasswordResetFromToken({
          token: tokenParam,
          tenantId: tenantIdParam,
        });
        if (cancelled) return;

        setUsernameForReset(resp.username as string);
        setCodeSent(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(mapTokenStartErrorMessage(msg));
        setCodeSent(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenMode, authCleared, tokenParam, tenantIdParam]);

  const handleSubmitTokenReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!tokenMode) {
      setError("Ungültiger Modus.");
      setLoading(false);
      return;
    }
    if (!usernameForReset) {
      setError("Token konnte nicht aufgelöst werden.");
      setLoading(false);
      return;
    }
    if (!code.trim()) {
      setError("Bitte den Code aus der E-Mail eingeben.");
      setLoading(false);
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      setLoading(false);
      return;
    }

    try {
      await confirmResetPassword({
        username: usernameForReset,
        confirmationCode: code.trim(),
        newPassword,
      });

      // Wichtig: confirmResetPassword setzt nicht zwingend eine Session.
      // Deshalb explizit mit neuem Passwort einloggen, damit Axios danach ein JWT hat.
      try {
        await signOut({ global: true });
      } catch {
        // ignore
      }
      await signIn({ username: usernameForReset, password: newPassword });

      const session = await fetchAuthSession();
      if (session.tokens?.idToken) {
        const payload = session.tokens.idToken.payload;
        const user: User = {
          nickname: payload.nickname as string,
          email: payload.email as string,
          role: (payload["custom:role"] as UserRole) || "participant",
        };
        saveCurrentUser(user);

        const sub = payload.sub as string | undefined;
        if (typeof sub === "string" && sub.trim()) {
          try {
            await updateParticipant(usernameForReset, { authUserId: sub });
          } catch (err) {
            console.error("Failed to link participant authUserId", err);
          }
        }
      }

      onSuccess?.();
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Passwort konnte nicht gesetzt werden.");
    } finally {
      setLoading(false);
    }
  };

  if (!tokenMode) return <p>Ungültiger Link.</p>;

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", padding: "1rem", border: "1px solid #eee", borderRadius: 8 }}>
      <h2>Willkommen bei YogaSwap</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Hallo <strong>{nicknameParam || usernameForReset}</strong>,
      </p>
      <p className="muted" style={{ marginTop: 0 }}>{subtitleText}</p>
      {emailDisplay && (
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          Code wird an {emailDisplay} gesendet
        </p>
      )}

      <form onSubmit={handleSubmitTokenReset} className="invite-form">
        {/* Password managers need an explicit username field in reset flows. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={usernameForReset || nicknameParam}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-10000px",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          placeholder="Code aus E-Mail"
          value={code}
          autoComplete="one-time-code"
          onChange={(e) => setCode(e.target.value)}
          disabled={loading || !codeSent}
          required
          style={{ marginBottom: 12 }}
          aria-label="Code aus E-Mail"
        />
        <input
          type="password"
          name="new-password"
          autoComplete="new-password"
          aria-label="Neues Passwort"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading || !codeSent}
          className="dialog-field"
          style={{ marginBottom: 12 }}
          placeholder="Neues Passwort"
          minLength={6}
          required
        />

        {error && (
          <p style={{ color: "red" }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading || !authCleared || !codeSent} className="btn-primary btn-block">
          {loading ? "Verarbeite…" : modeCopy[authMode].submitLabel}
        </button>
      </form>
    </div>
  );
}

// app/src/App.tsx
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Routes, Route, useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import "./App.css";
import Login from "./components/Login";
import CoursesShell from "./components/CoursesShell";
import AdminPanelFallback from "./components/AdminPanelFallback";
import LegalPageFallback from "./components/LegalPageFallback";
import Invite from "./components/Invite";
import ForgotPassword from "./components/ForgotPassword";
import DelegationPickerDialog from "./components/DelegationPickerDialog";
import UserSettingsSection from "./components/UserSettingsSection";
import { loadCurrentUser, saveCurrentUser, clearCurrentUser } from "shared/lib/storage";
import { User, Tenant, UserTenantMembership } from "shared/types";
import { useAppAuth } from "./auth/useAppAuth";
import { fetchAuthSession } from "aws-amplify/auth";
import {
  SESSION_ENDED_EVENT,
  consumeSessionNotice,
  reconcileLocalUserWithCognitoSession,
  setSessionNotice as persistSessionNotice,
  startSessionIdleWatchdog,
} from "./auth/sessionExpiry";
import { restoreStudioUserFromSession } from "./auth/restoreSessionUser";
import { resolveLogin } from "./api/auth";
import { getTenantContext, TenantNotFoundError } from "./api/tenantContext";
import UnknownStudio from "./components/UnknownStudio";
import {
  canInviteParticipants,
  canManageParticipantStatusInDelegation,
  canUseDelegation,
} from "shared/permissions";
import { getParticipants, type ParticipantWithStatus } from "./api/participants";
import { setActingForUserId, setActorUserId } from "./api/delegation";
import { filterParticipantsBySearch } from "./lib/participants";
import { scrollIntoViewWithStickyChrome } from "./lib/scrollWithStickyChrome";
import LayoutDebugBanner from "./components/LayoutDebugBanner";

const AdminPanel = lazy(() => import("./components/AdminPanel"));
const Impressum = lazy(() => import("./components/Impressum"));
const Datenschutz = lazy(() => import("./components/Datenschutz"));
const OpenSourceLicenses = lazy(() => import("./components/OpenSourceLicenses"));

function LegalPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LegalPageFallback />}>{children}</Suspense>;
}

type StudioGate = "loading" | "ready" | "not_found";

// Checkmark Haupt-App als Komponente
function MainApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [membership, setMembership] = useState<UserTenantMembership | null>(null);
  const [studioGate, setStudioGate] = useState<StudioGate>("loading");
  const [unknownTenantId, setUnknownTenantId] = useState<string>("");
  const [canInvite, setCanInvite] = useState(false);
  const [canDelegate, setCanDelegate] = useState(false);
  const [delegationCandidates, setDelegationCandidates] = useState<ParticipantWithStatus[]>([]);
  const [actingForUserIdState, setActingForUserIdState] = useState<string | null>(null);
  const [pendingActingForUserId, setPendingActingForUserId] = useState<string | null>(null);
  const [delegationPickerOpen, setDelegationPickerOpen] = useState(false);
  const [delegationSearch, setDelegationSearch] = useState("");
  const [sessionNotice, setSessionNotice] = useState(() => consumeSessionNotice());
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const { logout, isLoading, error } = useAppAuth();

  const inDelegation = Boolean(actingForUserIdState);

  const openUserSettings = useCallback(() => {
    if (inDelegation) return;
    setUserSettingsOpen(true);
    window.requestAnimationFrame(() => {
      const section = document.getElementById("user-settings");
      if (section) {
        scrollIntoViewWithStickyChrome(section);
      }
    });
  }, [inDelegation]);

  // Persönliche Settings gehören zum Actor — im Vertretungsmodus schließen/ausblenden.
  useEffect(() => {
    if (inDelegation) setUserSettingsOpen(false);
  }, [inDelegation]);

  // Studio-Existenz vor Login prüfen (#261) — GET /tenant-context ist öffentlich.
  useEffect(() => {
    let cancelled = false;
    const checkStudio = async () => {
      try {
        const ctx = await getTenantContext();
        if (cancelled) return;
        setTenant(ctx.tenant);
        setStudioGate("ready");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof TenantNotFoundError) {
          setUnknownTenantId(err.tenantId);
          setStudioGate("not_found");
          return;
        }
        console.error("Studio-Check fehlgeschlagen:", err);
        // Netzwerk/5xx: Login nicht blockieren (Tenant kommt ggf. nach Auth).
        setStudioGate("ready");
      }
    };
    void checkStudio();
    return () => {
      cancelled = true;
    };
  }, []);

  // Session-Restore: Studio-Login-Name behalten, nicht blind JWT-nickname (#412 / #324).
  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = await fetchAuthSession();
        const payload = session.tokens?.idToken?.payload;
        if (payload) {
          const stored = loadCurrentUser();
          const user = await restoreStudioUserFromSession({
            payload: payload as Record<string, unknown>,
            stored,
            resolveLogin,
          });
          saveCurrentUser(user);
          setActorUserId(user.nickname);
          setCurrentUser(user);
          return;
        }
      } catch {
        // keine aktive Cognito-Session
      }

      // No valid session: clear stale storage and logged-in state.
      const stored = loadCurrentUser();
      if (stored) {
        clearCurrentUser();
      }
      setCurrentUser(null);
      setActorUserId(null);
    };

    void initAuth();
  }, []);

  // Anderer Tab hat ausgeloggt / Session gecleared (#338).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "currentUser" && e.key !== "yogaswap_current_user") return;
      if (e.newValue != null) return;
      setCurrentUser(null);
      setActorUserId(null);
      setActingForUserId(null);
      setActingForUserIdState(null);
      setPendingActingForUserId(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // #318: Session beendet (401 / Idle / Token weg) → UI auf Login + Hinweis.
  useEffect(() => {
    const onSessionEnded = () => {
      setSessionNotice(consumeSessionNotice());
      setCurrentUser(null);
      setActorUserId(null);
      setActingForUserId(null);
      setActingForUserIdState(null);
      setPendingActingForUserId(null);
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, []);

  // #318: Tab wieder sichtbar → lokale User-Anzeige mit Cognito abgleichen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void reconcileLocalUserWithCognitoSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // #318: Idle-Timeout (nur solange UI eingeloggt wirkt).
  useEffect(() => {
    if (!currentUser) return;
    return startSessionIdleWatchdog();
  }, [currentUser]);

  // Sticky Kurs-Toolbar unter dem Header (#287): Offset an Header-/Toolbar-Höhe koppeln.
  useEffect(() => {
    const header = document.querySelector(".app-top");
    if (!(header instanceof HTMLElement)) return;

    let lastHeaderHeight = 0;
    let lastToolbarHeight = 0;

    const syncOffset = () => {
      const measuredHeader = Math.floor(header.getBoundingClientRect().height);
      if (measuredHeader > 0) lastHeaderHeight = measuredHeader;
      const headerHeight = measuredHeader > 0 ? measuredHeader : lastHeaderHeight;

      const toolbar = document.getElementById("course-toolbar");
      const measuredToolbar =
        toolbar instanceof HTMLElement ? Math.floor(toolbar.getBoundingClientRect().height) : 0;
      if (measuredToolbar > 0) lastToolbarHeight = measuredToolbar;
      const toolbarHeight = measuredToolbar > 0 ? measuredToolbar : lastToolbarHeight;

      document.documentElement.style.setProperty("--app-top-offset", `${Math.max(0, headerHeight)}px`);
      document.documentElement.style.setProperty(
        "--app-sticky-chrome-height",
        `${Math.max(0, headerHeight + toolbarHeight)}px`,
      );
    };

    syncOffset();
    window.addEventListener("resize", syncOffset);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(syncOffset);
      observer.observe(header);
      const toolbar = document.getElementById("course-toolbar");
      if (toolbar) observer.observe(toolbar);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncOffset);
      document.documentElement.style.removeProperty("--app-top-offset");
      document.documentElement.style.removeProperty("--app-sticky-chrome-height");
    };
  }, [currentUser, actingForUserIdState, studioGate]);

  // Tenant-Kontext laden, sobald ein User existiert
  useEffect(() => {
    if (!currentUser || studioGate !== "ready") {
      if (!currentUser) {
        setMembership(null);
        setCanInvite(false);
      }
      return;
    }

    const loadTenantContext = async () => {
      try {
        const ctx = await getTenantContext(currentUser.nickname);
        setTenant(ctx.tenant);
        setMembership(ctx.membership);

        if (ctx.membership) {
          setCanInvite(
            canInviteParticipants(ctx.membership, ctx.tenant?.settings),
          );
          setCanDelegate(canUseDelegation(ctx.membership, ctx.tenant?.settings));
        } else {
          // Fallback: Admins ohne Membership dürfen weiterhin einladen
          setCanInvite(currentUser.role === "admin");
          setCanDelegate(currentUser.role === "admin");
        }
      } catch (err) {
        console.error("Fehler beim Laden des Tenant-Kontexts:", err);
        if (err instanceof TenantNotFoundError) {
          setUnknownTenantId(err.tenantId);
          setStudioGate("not_found");
          setTenant(null);
          setMembership(null);
          return;
        }
        setMembership(null);
        // Im Fehlerfall ebenfalls auf Admin-Rolle zurückfallen
        setCanInvite(currentUser.role === "admin");
        setCanDelegate(currentUser.role === "admin");
      }
    };

    loadTenantContext();
  }, [currentUser, studioGate]);

  useEffect(() => {
    if (!currentUser || !canDelegate) {
      setDelegationCandidates([]);
      setPendingActingForUserId(null);
      setActingForUserIdState(null);
      setActingForUserId(null);
      return;
    }

    const loadCandidates = async () => {
      try {
        const participants = await getParticipants({ includeOrphaned: false });
        setDelegationCandidates(participants);
      } catch (err) {
        console.error("Fehler beim Laden der Vertretungs-Kandidaten:", err);
        setDelegationCandidates([]);
      }
    };
    loadCandidates();
  }, [currentUser, canDelegate]);

  // Login-Handler
  const handleLogin = (loggedInUser: User) => {
    setSessionNotice("");
    saveCurrentUser(loggedInUser);
    setActorUserId(loggedInUser.nickname);
    setCurrentUser(loggedInUser);
  };

  // Logout-Handler
  const handleLogout = async () => {
    await logout();
    setActingForUserId(null);
    setActorUserId(null);
    setActingForUserIdState(null);
    setPendingActingForUserId(null);
    clearCurrentUser();
    setCurrentUser(null);
  };

  /** Self-service email change (#435): session invalid after #350 password reset. */
  const handleEmailChangeRequiresReauth = async () => {
    persistSessionNotice(
      "E-Mail geändert. Bitte neues Passwort über den Link an deine neue Adresse setzen und dich danach anmelden.",
    );
    setUserSettingsOpen(false);
    await handleLogout();
    setSessionNotice(consumeSessionNotice());
  };

  /** Self-service password change (#434): re-login with the new password. */
  const handlePasswordChangedRequiresReauth = async () => {
    persistSessionNotice("Passwort geändert. Bitte mit dem neuen Passwort anmelden.");
    setUserSettingsOpen(false);
    await handleLogout();
    setSessionNotice(consumeSessionNotice());
  };

  const handleDelegationChange = (nextUserId: string) => {
    if (!nextUserId) {
      setActingForUserIdState(null);
      setPendingActingForUserId(null);
      setActingForUserId(null);
      return;
    }
    setPendingActingForUserId(nextUserId);
  };

  const eligibleDelegationCandidates = useMemo(
    () =>
      delegationCandidates.filter((participant) =>
        canManageParticipantStatusInDelegation(participant.status, tenant?.settings),
      ),
    [delegationCandidates, tenant?.settings],
  );

  const filteredDelegationCandidates = useMemo(() => {
    return filterParticipantsBySearch(eligibleDelegationCandidates, delegationSearch);
  }, [eligibleDelegationCandidates, delegationSearch]);

  // Setting aus oder Statuswechsel: laufende Vertretung beenden, wenn Subject nicht mehr erlaubt.
  useEffect(() => {
    if (!actingForUserIdState) return;
    const subject = delegationCandidates.find(
      (participant) =>
        participant.userId.toLowerCase() === actingForUserIdState.toLowerCase(),
    );
    if (!subject) return;
    if (canManageParticipantStatusInDelegation(subject.status, tenant?.settings)) return;
    setActingForUserIdState(null);
    setActingForUserId(null);
    setPendingActingForUserId(null);
  }, [actingForUserIdState, delegationCandidates, tenant?.settings]);

  const confirmDelegation = () => {
    if (!pendingActingForUserId) return;
    const subject = eligibleDelegationCandidates.find(
      (participant) =>
        participant.userId.toLowerCase() === pendingActingForUserId.toLowerCase(),
    );
    if (!subject) {
      setPendingActingForUserId(null);
      return;
    }
    setActingForUserIdState(pendingActingForUserId);
    setActingForUserId(pendingActingForUserId);
    setPendingActingForUserId(null);
  };

  const cancelDelegationConfirm = () => {
    setPendingActingForUserId(null);
  };

  const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const focusFirstIn = (root: HTMLElement | null) => {
    if (!root) return;
    const firstFocusable = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus({ preventScroll: true });
  };

  const handleSkipToMenu = () => {
    const nav = document.getElementById("site-nav");
    if (nav) {
      focusFirstIn(nav);
      return;
    }
    focusFirstIn(document.getElementById("main-content"));
  };

  const handleSkipToContent = () => {
    const target = document.getElementById("course-toolbar") ?? document.getElementById("main-content");
    if (!target) return;
    scrollIntoViewWithStickyChrome(target, { extraOffset: 0 });
    focusFirstIn(target);
  };

  const handleSkipToFooter = () => {
    const footerNav = document.getElementById("site-footer-nav");
    if (!footerNav) return;
    scrollIntoViewWithStickyChrome(footerNav, { extraOffset: 0 });
    focusFirstIn(footerNav);
  };

  const effectiveUser: User | null = currentUser
    ? actingForUserIdState
      ? {
          ...currentUser,
          nickname: actingForUserIdState,
          role: "participant",
        }
      : currentUser
    : null;

  return (
    <div className="app-shell">
      <div className="app-scroll-root">
        <div className="app-container">
      <nav className="skip-links" aria-label="Seitenüberspringen">
        <button type="button" className="skip-link" onClick={handleSkipToMenu}>
          Zum Menü
        </button>
        <button type="button" className="skip-link" onClick={handleSkipToContent}>
          Zum Inhalt
        </button>
        <button type="button" className="skip-link" onClick={handleSkipToFooter}>
          Zum Fußbereich
        </button>
      </nav>
      {/* Deckt Safari-Titlebar/Overscroll hinter dem Sticky-Header (#287). */}
      <div className="app-safari-chrome-fill" aria-hidden="true" />
      <header className="app-top">
        <h1 className="app-top-title">YogaSwap</h1>
        {currentUser && (
          <nav id="site-nav" className="userbox" aria-label="Benutzer-Menü">
            <span className="userbox-greeting">Hi, {currentUser.nickname}</span>
            <div className="header-action-group">
              <button
                type="button"
                className="header-action-btn header-action-btn--icon"
                onClick={openUserSettings}
                disabled={inDelegation}
                aria-controls={inDelegation ? undefined : "user-settings"}
                aria-label={
                  inDelegation
                    ? "Einstellungen im Vertretungsmodus nicht verfügbar"
                    : "Einstellungen"
                }
                title={
                  inDelegation
                    ? "Im Vertretungsmodus nicht verfügbar — zuerst Vertretung beenden"
                    : "Einstellungen"
                }
              >
                <Settings size={18} aria-hidden="true" />
              </button>
              <button
                id="logout-btn"
                type="button"
                className="header-action-btn"
                onClick={handleLogout}
                disabled={isLoading}
              >
                {isLoading ? "..." : "Logout"}
              </button>
              {canDelegate && (
                <button
                  type="button"
                  className="header-action-btn"
                  onClick={() => {
                    setDelegationSearch("");
                    setDelegationPickerOpen(true);
                  }}
                  aria-label="Vertretung"
                >
                  Vertretung
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      {error && (
        <div className="app-error" role="alert">
          {error}
        </div>
      )}

      {actingForUserIdState && (
        <div className="delegation-banner" role="status" aria-live="polite">
          <span>
            Vertretung aktiv: Du handelst im Auftrag von <strong>{actingForUserIdState}</strong>.
          </span>
          <button
            type="button"
            className="modal-action-btn"
            onClick={() => {
              setActingForUserIdState(null);
              setPendingActingForUserId(null);
              setActingForUserId(null);
            }}
          >
            Vertretung beenden
          </button>
        </div>
      )}

      <main>
        {studioGate === "loading" ? (
          <section id="main-content" className="main-section" aria-busy="true" aria-label="Studio wird geprüft">
            <p className="muted">Studio wird geprüft …</p>
          </section>
        ) : studioGate === "not_found" ? (
          <UnknownStudio tenantId={unknownTenantId} />
        ) : !effectiveUser ? (
          <section id="main-content" className="main-section" aria-label="Anmeldung">
            <Login onLogin={handleLogin} sessionNotice={sessionNotice} />
          </section>
        ) : (
          <section
            id="main-content"
            className={`main-section main-section-courses${actingForUserIdState ? " is-delegation-active" : ""}`}
            aria-labelledby="courses-heading"
          >
            <h2 id="courses-heading" className="visually-hidden">
              Kurse
            </h2>
            <CoursesShell
              currentUser={effectiveUser}
              tenant={tenant ?? undefined}
              membership={membership ?? undefined}
              forceParticipantView={Boolean(actingForUserIdState)}
            />
          </section>
        )}

        {studioGate === "ready" && currentUser && !inDelegation && (
          <div className="main-section main-section-user-settings">
            <UserSettingsSection
              nickname={currentUser.nickname}
              email={currentUser.email}
              authUserId={currentUser.authUserId}
              open={userSettingsOpen}
              onOpenChange={setUserSettingsOpen}
              onEmailChangeRequiresReauth={handleEmailChangeRequiresReauth}
              onPasswordChangedRequiresReauth={handlePasswordChangedRequiresReauth}
            />
          </div>
        )}

        {studioGate === "ready" && currentUser && canInvite && !inDelegation && (
          <section className="main-section main-section-admin" aria-labelledby="admin-heading">
            <h2 id="admin-heading" className="visually-hidden">
              Verwaltung
            </h2>
            <Suspense fallback={<AdminPanelFallback />}>
              <AdminPanel
                canEditRoles={(membership?.role ?? currentUser.role) === "admin"}
                tenant={tenant}
                onTenantUpdated={(updated) => setTenant(updated)}
              />
            </Suspense>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span className="copyright">© {new Date().getFullYear()} Karin Schrader</span>
        <nav id="site-footer-nav" className="app-footer-nav" aria-label="Rechtliches und Lizenzen">
          <Link to="/impressum">Impressum</Link>
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <Link to="/datenschutz">Datenschutz</Link>
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <Link to="/open-source-lizenzen">Open-Source-Lizenzen</Link>
        </nav>
      </footer>
        </div>
      </div>

      {pendingActingForUserId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Vertretung bestätigen">
          <div className="modal modal-compact">
            <div className="modal-header">
              <h4>Vertretung übernehmen</h4>
            </div>
            <div className="modal-body">
              <p className="course-editor-note">
                Du handelst im Auftrag von <strong>{pendingActingForUserId}</strong>.
              </p>
              <p className="course-editor-note">Bitte bestätigen, dass du für diese Person Aktionen durchführen darfst.</p>
              <div className="modal-actions">
                <button type="button" className="modal-action-btn" onClick={cancelDelegationConfirm}>
                  Abbrechen
                </button>
                <button type="button" className="btn-primary modal-action-btn" onClick={confirmDelegation}>
                  Bestätigen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DelegationPickerDialog
        open={delegationPickerOpen}
        search={delegationSearch}
        candidates={filteredDelegationCandidates}
        onSearchChange={setDelegationSearch}
        onSelectUser={(userId) => {
          handleDelegationChange(userId);
          setDelegationPickerOpen(false);
        }}
        onClose={() => setDelegationPickerOpen(false)}
      />
      {/* DOM am Ende, optisch fixed oben — Skip-Links bleiben erste Tab-Stops (#409). */}
      <LayoutDebugBanner />
    </div>
  );
}

// Checkmark Invite mit Weiterleitung nach Erfolg
function InviteWithRedirect() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate("/", { replace: true });
  };

  return <Invite onSuccess={handleSuccess} />;
}

// Checkmark Hauptkomponente mit Routing
// app/src/App.tsx
export default function App() {
  return (
    <Routes>
      <Route path="/invite" element={<InviteWithRedirect />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/login" element={<Login onLogin={() => {}} guestRoute />} />
      <Route
        path="/impressum"
        element={
          <LegalPage>
            <div className="app-container">
              <Impressum />
            </div>
          </LegalPage>
        }
      />
      <Route
        path="/datenschutz"
        element={
          <LegalPage>
            <div className="app-container">
              <Datenschutz />
            </div>
          </LegalPage>
        }
      />
      <Route
        path="/open-source-lizenzen"
        element={
          <LegalPage>
            <div className="app-container">
              <OpenSourceLicenses />
            </div>
          </LegalPage>
        }
      />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}
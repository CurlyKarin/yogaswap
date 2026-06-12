// app/src/App.tsx
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";
import Login from "./components/Login";
import CoursesShell from "./components/CoursesShell";
import AdminPanelFallback from "./components/AdminPanelFallback";
import LegalPageFallback from "./components/LegalPageFallback";
import Invite from "./components/Invite";
import ForgotPassword from "./components/ForgotPassword";
import DelegationPickerDialog from "./components/DelegationPickerDialog";
import { loadCurrentUser, saveCurrentUser, clearCurrentUser } from "shared/lib/storage";
import { User, UserRole, Tenant, UserTenantMembership } from "shared/types";
import { useAppAuth } from "./auth/useAppAuth";
import { fetchAuthSession } from "aws-amplify/auth";
import { getTenantContext } from "./api/tenantContext";
import { canInviteParticipants, canManageParticipants } from "shared/permissions";
import { getParticipants, type ParticipantWithStatus } from "./api/participants";
import { setActingForUserId, setActorUserId } from "./api/delegation";
import { filterParticipantsBySearch } from "./lib/participants";

const AdminPanel = lazy(() => import("./components/AdminPanel"));
const Impressum = lazy(() => import("./components/Impressum"));
const Datenschutz = lazy(() => import("./components/Datenschutz"));
const OpenSourceLicenses = lazy(() => import("./components/OpenSourceLicenses"));

function LegalPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LegalPageFallback />}>{children}</Suspense>;
}

// Checkmark Haupt-App als Komponente
function MainApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [membership, setMembership] = useState<UserTenantMembership | null>(null);
  const [canInvite, setCanInvite] = useState(false);
  const [canDelegate, setCanDelegate] = useState(false);
  const [delegationCandidates, setDelegationCandidates] = useState<ParticipantWithStatus[]>([]);
  const [actingForUserIdState, setActingForUserIdState] = useState<string | null>(null);
  const [pendingActingForUserId, setPendingActingForUserId] = useState<string | null>(null);
  const [delegationPickerOpen, setDelegationPickerOpen] = useState(false);
  const [delegationSearch, setDelegationSearch] = useState("");
  const { logout, isLoading, error } = useAppAuth();

  // App.tsx
  useEffect(() => {
    const initAuth = async () => {
      // Always verify Cognito session first. localStorage is only a fallback cache.
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.idToken) {
          const payload = session.tokens.idToken.payload;

          const user: User = {
            nickname: payload.nickname as string,
            email: payload.email as string,
            role: (payload['custom:role'] as UserRole) || 'participant',
          };

          saveCurrentUser(user);  // Checkmark Speichern für später!
          setActorUserId(user.nickname);
          setCurrentUser(user);
          console.log('User aus Cognito-Session geladen:', user);
          return;
        }
      } catch (err) {
        console.log('Keine aktive Session:', err);
      }

      // No valid session: clear stale storage and logged-in state.
      const stored = loadCurrentUser();
      if (stored) {
        clearCurrentUser();
      }
      setCurrentUser(null);
      setActorUserId(null);
    };

    initAuth();
  }, []); 

  // Tenant-Kontext laden, sobald ein User existiert
  useEffect(() => {
    if (!currentUser) {
      setTenant(null);
      setMembership(null);
      setCanInvite(false);
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
          setCanDelegate(
            canManageParticipants(ctx.membership, ctx.tenant?.settings),
          );
        } else {
          // Fallback: Admins ohne Membership dürfen weiterhin einladen
          setCanInvite(currentUser.role === "admin");
          setCanDelegate(currentUser.role === "admin");
        }
      } catch (err) {
        console.error("Fehler beim Laden des Tenant-Kontexts:", err);
        setTenant(null);
        setMembership(null);
        // Im Fehlerfall ebenfalls auf Admin-Rolle zurückfallen
        setCanInvite(currentUser.role === "admin");
        setCanDelegate(currentUser.role === "admin");
      }
    };

    loadTenantContext();
  }, [currentUser]);

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

  const handleDelegationChange = (nextUserId: string) => {
    if (!nextUserId) {
      setActingForUserIdState(null);
      setPendingActingForUserId(null);
      setActingForUserId(null);
      return;
    }
    setPendingActingForUserId(nextUserId);
  };

  const filteredDelegationCandidates = useMemo(() => {
    return filterParticipantsBySearch(delegationCandidates, delegationSearch);
  }, [delegationCandidates, delegationSearch]);

  const confirmDelegation = () => {
    if (!pendingActingForUserId) return;
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
    target.scrollIntoView({ block: "start" });
    focusFirstIn(target);
  };

  const handleSkipToFooter = () => {
    const footerNav = document.getElementById("site-footer-nav");
    if (!footerNav) return;
    footerNav.scrollIntoView({ block: "end" });
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
      <header className="app-top">
        <h1>YogaSwap</h1>
        {currentUser && (
          <nav id="site-nav" className="userbox" aria-label="Benutzer-Menü">
            <span>Hi, {currentUser.nickname}</span>
            <div className="header-action-group">
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
        {!effectiveUser ? (
          <section id="main-content" className="main-section" aria-label="Anmeldung">
            <Login onLogin={handleLogin} />
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

        {currentUser && canInvite && !actingForUserIdState && (
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

      {pendingActingForUserId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Vertretung bestätigen">
          <div className="modal modal-compact">
            <h4>Vertretung übernehmen</h4>
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
      <Route path="/login" element={<Login onLogin={() => {}} />} />
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
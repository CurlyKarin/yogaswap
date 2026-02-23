// app/src/App.tsx
import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";
import Login from "./components/Login";
import CourseList from "./components/CourseList";
import AdminPanel from "./components/AdminPanel";
import Invite from "./components/Invite";
import ChangePassword from "./components/changePassword";
import Impressum from "./components/Impressum";
import Datenschutz from "./components/Datenschutz";
import { Link } from "react-router-dom";
import { loadCurrentUser, saveCurrentUser, clearCurrentUser } from "shared/lib/storage";
import { User, UserRole } from "shared/types";

// Checkmark useAppAuth ZUERST definieren
// app/src/App.tsx
// NACH der Definition von useAppAuth
export const useAppAuth = () => {
  console.log("useAppAuth called, DEV:", import.meta.env.DEV);
  return import.meta.env.DEV ? useAuth() : useCognitoAuth();
};

// Checkmark Imports NACH useAppAuth
import { useCognitoAuth } from "./auth/useCognitoAuth";
import { useAuth } from "./auth/useAuth";
import { fetchAuthSession } from "aws-amplify/auth";

// Checkmark Haupt-App als Komponente
function MainApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { login, logout, isLoading, error } = useAppAuth();

  // App.tsx
  useEffect(() => {
    const initAuth = async () => {
      // 1. Versuche, User aus localStorage zu laden
      const stored = loadCurrentUser();
      if (stored) {
        console.log('User aus localStorage geladen:', stored);
        setCurrentUser(stored);
        return;  // Checkmark Fertig!
      }

      // 2. Falls kein localStorage: Prüfe Cognito-Session
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
          setCurrentUser(user);
          console.log('User aus Cognito-Session geladen:', user);
        }
      } catch (err) {
        console.log('Keine aktive Session:', err);
        // Kein User → Login-Seite
      }
    };

    initAuth();
  }, []); 

  // Login-Handler
  const handleLogin = (loggedInUser: User) => {
    saveCurrentUser(loggedInUser);
    setCurrentUser(loggedInUser);
  };

  // Logout-Handler
  const handleLogout = async () => {
    logout();
    clearCurrentUser();
    setCurrentUser(null);
  };

  return (
    <div className="app-container">
      <header className="app-top">
        <h1>YogaSwap</h1>
        {currentUser && (
          <div className="userbox">
            <span>Hi, {currentUser.nickname}</span>
            <button onClick={handleLogout} disabled={isLoading}>
              {isLoading ? "..." : "Logout"}
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="error" style={{ color: "red", textAlign: "center", margin: "1rem" }}>
          {error}
        </div>
      )}

      {!currentUser ? (
        <Login onLogin={handleLogin} />
      ) : (
        <>
          <p className="muted" style={{ textAlign: "center", marginBottom: 16 }}>
            Klicke in deinen Kursen auf <em>„Termin absagen“</em> oder <em>„Tauschen anfragen“</em>.
          </p>
          <CourseList currentUser={currentUser} />
        </>
      )}

      {currentUser?.role === "admin" && <AdminPanel />}

      <footer className="app-footer">
        <span className="copyright">© {new Date().getFullYear()} Karin Schrader</span>
        <span className="sep">·</span>
        <Link to="/impressum">Impressum</Link>
        <span className="sep">·</span>
        <Link to="/datenschutz">Datenschutz</Link>
        <span className="sep">·</span>
        <a href="https://github.com/curlykarin/yogaswap" target="_blank" rel="noopener noreferrer">Lizenz (MIT)</a>
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
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/login" element={<Login onLogin={() => {}} />} />
      <Route path="/impressum" element={<div className="app-container"><Impressum /></div>} />
      <Route path="/datenschutz" element={<div className="app-container"><Datenschutz /></div>} />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}
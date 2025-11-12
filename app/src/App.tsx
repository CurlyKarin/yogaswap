// app/src/App.tsx
import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";
import Login from "./components/Login";
import CourseList from "./components/CourseList";
import AdminPanel from "./components/AdminPanel";
import Invite from "./components/Invite";
import ChangePassword from "./components/changePassword";
import { loadCurrentUser, saveCurrentUser, clearCurrentUser } from "shared/lib/storage";
import { User } from "shared/types";

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

// Checkmark Haupt-App als Komponente
function MainApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { login, logout, isLoading, error } = useAppAuth();

  // Beim Laden: User aus localStorage
  useEffect(() => {
    const stored = loadCurrentUser();
    if (stored) {
      setCurrentUser(stored);
    } 
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
      <Route path="/change-password" element={<ChangePassword />} />  // Checkmark OBEN!
      <Route path="/login" element={<Login onLogin={() => {}} />} />   // Checkmark Optional
      <Route path="*" element={<MainApp />} />                        // Checkmark ZULETZT!
    </Routes>
  );
}
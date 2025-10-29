import { useEffect, useState } from "react";
import "./App.css";
import Login from "./components/Login";
import CourseList from "./components/CourseList";
import { getCurrentUser, clearCurrentUser } from "./lib/storage";
import { User } from "shared/types";

const useAppAuth = () => {
  return import.meta.env.DEV ? useAuth() : useCognitoAuth();
};

import { useCognitoAuth } from "./components/useCognitoAuth";
import { useAuth } from "shared/auth";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { user, login, logout, isLoading, error } = useAppAuth(); 

// Beim Laden: User aus localStorage
  useEffect(() => {
    const storedUser = getCurrentUser();
    if (storedUser) {
      setCurrentUser(storedUser);
    } else if (user) {
      setCurrentUser(user);
    }
  }, [user]);

// Login-Handler
  const handleLogin = (loggedInUser: User) => {
    setCurrentUser(loggedInUser);
  };

  const handleLogout = () => {
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
    </div>
  );
}

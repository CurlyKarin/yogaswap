import { useEffect, useState } from "react";
import "./App.css";
import Login from "./components/Login";
import CourseList from "./components/CourseList";
import { getCurrentUser, clearCurrentUser } from "./lib/storage";
import { User } from "shared/types";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Beim Laden schauen, ob ein User in localStorage ist
  useEffect(() => {
    const u = getCurrentUser();
    if (u) setCurrentUser(u);
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
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
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>

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

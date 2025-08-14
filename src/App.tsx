import { useEffect, useState } from "react";
import "./App.css";
import Login from "./components/Login";
import CourseList from "./components/CourseList";
import type { User } from "./types";
import {
  getCurrentUser,
  clearCurrentUser,
  getUserActions,
  toggleAbsence,
  toggleSwap,
} from "./lib/storage";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [absences, setAbsences] = useState<number[]>([]);
  const [swapRequests, setSwapRequests] = useState<number[]>([]);

  // Beim Laden schauen, ob ein User in localStorage ist
  useEffect(() => {
    const u = getCurrentUser();
    if (u) {
      setCurrentUser(u);
      const a = getUserActions(u.email);
      setAbsences(a.absences);
      setSwapRequests(a.swapRequests);
    }
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    const a = getUserActions(user.email);
    setAbsences(a.absences);
    setSwapRequests(a.swapRequests);
  };

  const handleLogout = () => {
    clearCurrentUser();
    setCurrentUser(null);
    setAbsences([]);
    setSwapRequests([]);
  };

  const onToggleAbsence = (courseId: number) => {
    if (!currentUser) return;
    toggleAbsence(currentUser.email, courseId);
    const a = getUserActions(currentUser.email);
    setAbsences(a.absences);
  };

  const onToggleSwap = (courseId: number) => {
    if (!currentUser) return;
    toggleSwap(currentUser.email, courseId);
    const a = getUserActions(currentUser.email);
    setSwapRequests(a.swapRequests);
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
          <CourseList
            currentUser={currentUser}
            absences={absences}
            swapRequests={swapRequests}
            onToggleAbsence={onToggleAbsence}
            onToggleSwap={onToggleSwap}
          />
        </>
      )}
    </div>
  );
}

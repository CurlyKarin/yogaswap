// app/src/components/AdminPanel.tsx
export default function AdminPanel() {
  const inviteUser = async () => {
    const email = prompt("E-Mail?");
    const nickname = prompt("Spitzname?");
    if (!email || !nickname) return;

    await fetch("/api/participants", {
      method: "POST",
      body: JSON.stringify({ email, nickname, role: "participant" }),
      headers: { "Content-Type": "application/json" },
    });
    alert("Einladung gesendet!");
  };

  return (
    <div style={{ padding: "1rem", border: "1px solid #ccc", margin: "1rem" }}>
      <h3>Admin: Teilnehmer einladen</h3>
      <button onClick={inviteUser}>Neuen Teilnehmer einladen</button>
    </div>
  );
}
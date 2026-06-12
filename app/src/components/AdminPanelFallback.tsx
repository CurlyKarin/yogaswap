export default function AdminPanelFallback() {
  return (
    <div
      className="admin-panel admin-panel-fallback"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Verwaltung wird geladen"
    >
      <span className="visually-hidden">Verwaltung wird geladen</span>
      <div className="admin-panel-fallback-studio" aria-hidden="true">
        <div className="admin-panel-fallback-line admin-panel-fallback-line-title" />
        <div className="admin-panel-fallback-grid">
          <div className="admin-panel-fallback-line" />
          <div className="admin-panel-fallback-line" />
          <div className="admin-panel-fallback-line" />
        </div>
      </div>
      <div className="admin-panel-fallback-participants" aria-hidden="true">
        <div className="admin-panel-fallback-line admin-panel-fallback-line-toolbar" />
        <div className="admin-panel-fallback-table">
          <div className="admin-panel-fallback-line" />
          <div className="admin-panel-fallback-line" />
          <div className="admin-panel-fallback-line" />
          <div className="admin-panel-fallback-line" />
        </div>
      </div>
    </div>
  );
}

export default function NavigationSidebar({
  activeTab,
  setActiveTab,
  status,
  vesselCount = 6,
  onResetScenario,
  isPanelOpen,
  setIsPanelOpen,
  onToggleAiChat,
}) {
  return (
    <aside className="mt-sidebar" aria-label="Marine Operations Navigation">
      {/* Brand Header */}
      <div className="mt-sidebar-header">
        <div className="mt-brand-logo">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <polygon points="16,2 30,10 30,26 16,30 2,26 2,10" fill="#2563eb" stroke="#60a5fa" strokeWidth="2" />
            <polygon points="16,6 26,12 26,23 16,26 6,23 6,12" fill="#1e3a8a" opacity="0.8" />
            <circle cx="16" cy="16" r="3.5" fill="#38bdf8" />
          </svg>
        </div>
        <div className="mt-brand-text">
          <span className="mt-brand-sub">OCEANTRACE</span>
          <span className="mt-brand-main">MarineTraffic</span>
        </div>
      </div>

      {/* Primary Operations Navigation */}
      <nav className="mt-nav-list">
        <button
          className={`mt-nav-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('map')
          }}
          title="Live Map Overview"
        >
          <span className="mt-nav-icon">🌐</span>
          <span className="mt-nav-label">Live Map</span>
        </button>

        <button
          className={`mt-nav-item ${activeTab === 'simulation' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('simulation')
            setIsPanelOpen(true)
          }}
          title="Spill Drift & AI Model Controls"
        >
          <span className="mt-nav-icon">🌊</span>
          <span className="mt-nav-label">Drift & AI Model</span>
          <span className="mt-badge">AI</span>
        </button>

        <button
          className={`mt-nav-item ${activeTab === 'leads' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('leads')
            setIsPanelOpen(true)
          }}
          title="Suspect Vessel Investigation"
        >
          <span className="mt-nav-icon">🚢</span>
          <span className="mt-nav-label">Vessel Leads</span>
          <span className="mt-count-pill">{vesselCount}</span>
        </button>

        <button
          className="mt-nav-item"
          onClick={onToggleAiChat}
          title="Open Gemma / Gemini AI Maritime Copilot"
        >
          <span className="mt-nav-icon">🤖</span>
          <span className="mt-nav-label">AI Copilot</span>
          <span className="mt-badge" style={{ background: '#0284c7', color: '#fff' }}>GEMMA</span>
        </button>

        <div className="mt-nav-divider" />

        <button
          className="mt-nav-item"
          onClick={onResetScenario}
          title="Reset Incident Scenario to Default"
        >
          <span className="mt-nav-icon">🎯</span>
          <span className="mt-nav-label">Reset Incident</span>
        </button>
      </nav>

      {/* Backend Status & Toggle */}
      <div className="mt-sidebar-footer">
        <div className="mt-status-badge" title={status?.message || 'Backend API Connection'}>
          <span className={`mt-status-dot ${status?.state === 'online' ? 'online' : 'offline'}`} />
          <span className="mt-status-label">
            {status?.state === 'online' ? 'API Online' : 'Local Mode'}
          </span>
        </div>
      </div>
    </aside>
  )
}

import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import IdentityPage from './pages/IdentityPage';
import NetworkPage from './pages/NetworkPage';
import RumorsPage from './pages/RumorsPage';
import ScoringPage from './pages/ScoringPage';
import StatePage from './pages/StatePage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* ── Sidebar Navigation ── */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <h1>Afwaah</h1>
            <span>Campus Rumor System</span>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">&#9670;</span> Identity
            </NavLink>
            <NavLink to="/network" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">&#9678;</span> Network
            </NavLink>
            <NavLink to="/rumors" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">&#9998;</span> Rumors & Voting
            </NavLink>
            <NavLink to="/scoring" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">&#9733;</span> Scoring
            </NavLink>
            <NavLink to="/state" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">&#9881;</span> State & Admin
            </NavLink>
          </nav>
          <div style={{ padding: '16px 24px', fontSize: 11, opacity: 0.4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            Decentralized &middot; Anonymous &middot; ZK
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<IdentityPage />} />
            <Route path="/network" element={<NetworkPage />} />
            <Route path="/rumors" element={<RumorsPage />} />
            <Route path="/scoring" element={<ScoringPage />} />
            <Route path="/state" element={<StatePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

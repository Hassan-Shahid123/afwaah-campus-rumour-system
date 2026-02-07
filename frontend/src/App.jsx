import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { UserProvider } from './UserContext';
import { useUser } from './useUser';
import IdentityPage from './pages/IdentityPage';
import NetworkPage from './pages/NetworkPage';
import RumorsPage from './pages/RumorsPage';
import ScoringPage from './pages/ScoringPage';
import StatePage from './pages/StatePage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <AppLayout />
      </UserProvider>
    </BrowserRouter>
  );
}

/* Gate routes behind email verification */
function ProtectedRoute({ children }) {
  const { user } = useUser();
  if (!user?.emailVerified) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppLayout() {
  const { user } = useUser();

  return (
    <div className="app-layout">
      {/* ── Sidebar Navigation ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Afwaah</h1>
          <span>Campus Rumor System</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/rumors" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">&#9998;</span> Feed
          </NavLink>
          <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">&#9670;</span> {user ? 'My Account' : 'Sign In'}
          </NavLink>
          <NavLink to="/scoring" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">&#9733;</span> Reputation
          </NavLink>
          <NavLink to="/network" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">&#9678;</span> How It Works
          </NavLink>
          <NavLink to="/state" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">&#9881;</span> Admin
          </NavLink>
        </nav>
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{user.nullifier.substring(5, 7).toUpperCase()}</div>
            <div className="sidebar-user-id">{user.nullifier}</div>
          </div>
        )}
        <div style={{ padding: '16px 24px', fontSize: 11, opacity: 0.4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          Decentralized &middot; Anonymous &middot; ZK
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<IdentityPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/rumors" element={<ProtectedRoute><RumorsPage /></ProtectedRoute>} />
          <Route path="/scoring" element={<ProtectedRoute><ScoringPage /></ProtectedRoute>} />
          <Route path="/state" element={<ProtectedRoute><StatePage /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

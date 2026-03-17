import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../App.css';

const IconProfile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconLogout = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-logo">
          <span className="admin-logo-mark">VIN</span>
          <span className="admin-logo-text">Admin</span>
        </div>
        <nav className="admin-nav">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`}
          >
            <span className="admin-nav-indicator" />
            <span className="admin-nav-label">Dashboard</span>
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`}
          >
            <span className="admin-nav-indicator" />
            <span className="admin-nav-label">Users</span>
          </NavLink>
        </nav>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header-left">
            <h1 className="admin-header-title">Admin</h1>
          </div>
          <div className="admin-header-right">
            <div className="admin-user-dropdown">
              <button type="button" className="admin-user-trigger">
                <div className="admin-avatar">
                  {user?.email?.[0]?.toUpperCase() ?? 'A'}
                </div>
                <div className="admin-user-meta">
                  <span className="admin-user-email">{user?.email ?? 'Admin'}</span>
                  <span className="admin-user-role">Administrator</span>
                </div>
              </button>
              <div className="admin-user-menu">
                <button
                  type="button"
                  className="admin-user-menu-item"
                  onClick={() => navigate('/admin/profile')}
                >
                  <IconProfile />
                  <span>Profile</span>
                </button>
                <button type="button" className="admin-user-menu-item admin-user-menu-item-logout" onClick={handleLogout}>
                  <IconLogout />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}


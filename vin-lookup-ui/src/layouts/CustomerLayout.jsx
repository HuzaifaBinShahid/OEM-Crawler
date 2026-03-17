import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../App.css';

const IconProfile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconKey = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const IconLogout = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default function CustomerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const isLookupPage = location.pathname === '/';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="customer-shell">
      <header className="customer-navbar">
        <div className="customer-navbar-left">
          <NavLink to="/" end className="customer-logo">
            <span className="customer-logo-mark">VIN</span>
            <span className="customer-logo-text">Lookup</span>
          </NavLink>
          <nav className="customer-nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `customer-nav-link${isActive ? ' customer-nav-link-active' : ''}`}
            >
              Lookup
            </NavLink>
            <NavLink
              to="/stats"
              className={({ isActive }) => `customer-nav-link${isActive ? ' customer-nav-link-active' : ''}`}
            >
              Stats
            </NavLink>
          </nav>
        </div>
        <div className="customer-navbar-right" ref={dropdownRef}>
          <div className="customer-user-dropdown">
            <button
              type="button"
              className="customer-user-trigger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <div className="customer-avatar">
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="customer-user-meta">
                <span className="customer-user-email">{user?.email ?? 'User'}</span>
                <span className="customer-user-role">{user?.role ?? 'User'}</span>
              </div>
            </button>
            {dropdownOpen && (
              <div className="customer-user-menu">
                <button
                  type="button"
                  className="customer-user-menu-item"
                  onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                >
                  <IconProfile />
                  <span>Profile</span>
                </button>
                <button
                  type="button"
                  className="customer-user-menu-item customer-user-menu-item-logout"
                  onClick={handleLogout}
                >
                  <IconLogout />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className={`customer-main${isLookupPage ? ' customer-main--lookup' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}

import { useAuth } from '../context/AuthContext';

export default function Admin() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <div className="card">
        <h1 className="title">Admin Dashboard</h1>
        <p className="subtitle">Welcome, {user?.email ?? 'Admin'}.</p>
        <p style={{ color: '#6b6b6b', marginBottom: '1rem' }}>
          You are logged in as an administrator. Additional admin features can be added here.
        </p>
        <button type="button" className="btn" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}

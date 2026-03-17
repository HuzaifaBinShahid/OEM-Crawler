import { useAuth } from '../../context/AuthContext';

export default function Profile() {
  const { user } = useAuth();

  return (
    <div className="admin-dashboard">
      <section className="card admin-stat-card">
        <h2 className="admin-section-title">Profile</h2>
        <p className="admin-section-subtitle">Details for your administrator account.</p>
        <div style={{ marginTop: '1.25rem', display: 'grid', gap: '0.5rem', maxWidth: '360px' }}>
          <div>
            <div className="admin-stat-label">Email</div>
            <div className="admin-stat-value" style={{ fontSize: '1rem' }}>
              {user?.email ?? '—'}
            </div>
          </div>
          <div>
            <div className="admin-stat-label">Role</div>
            <div className="admin-stat-value" style={{ fontSize: '1rem' }}>
              {user?.role ?? '—'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


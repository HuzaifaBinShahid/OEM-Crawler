import { useAuth } from '../../context/AuthContext';

export default function ProfileSection() {
  const { user } = useAuth();

  return (
    <section className="card customer-profile-card">
      <h2 className="admin-section-title">Profile</h2>
      <p className="admin-section-subtitle">Your account details.</p>
      <div className="customer-profile-fields">
        <div>
          <div className="admin-stat-label">Email</div>
          <div className="admin-stat-value" style={{ fontSize: '1rem' }}>
            {user?.email ?? '—'}
          </div>
        </div>
        <div>
          <div className="admin-stat-label">Role</div>
          <div className="admin-stat-value" style={{ fontSize: '1rem', textTransform: 'capitalize' }}>
            {user?.role ?? '—'}
          </div>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { getAdminStats } from '../../api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const ROLE_COLORS = {
  admin: '#1a1a1a',
  internal: '#6366f1',
  customer: '#10b981',
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAdminStats();
        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load stats');
          setShowToast(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!error) return undefined;
    setShowToast(true);
    const id = setTimeout(() => {
      setShowToast(false);
    }, 4000);
    return () => clearTimeout(id);
  }, [error]);

  const roleData = stats
    ? [
        { name: 'Admin', value: stats.usersByRole.admin, key: 'admin' },
        { name: 'Internal', value: stats.usersByRole.internal, key: 'internal' },
        { name: 'Customer', value: stats.usersByRole.customer, key: 'customer' },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="admin-dashboard">
      <section className="admin-stat-grid">
        <article className="card admin-stat-card">
          <h2 className="admin-stat-label">Total users</h2>
          <p className="admin-stat-value">{stats?.totalUsers ?? (loading ? '—' : 0)}</p>
        </article>
        <article className="card admin-stat-card">
          <h2 className="admin-stat-label">Total lookups</h2>
          <p className="admin-stat-value">{stats?.totalLookups ?? (loading ? '—' : 0)}</p>
        </article>
        <article className="card admin-stat-card">
          <h2 className="admin-stat-label">Lookups (last 7 days)</h2>
          <p className="admin-stat-value">{stats?.lookupsLast7Days ?? (loading ? '—' : 0)}</p>
        </article>
      </section>

      <section className="admin-charts-grid">
        <article className="card admin-chart-card">
          <div className="admin-chart-header">
            <h2 className="admin-chart-title">Lookups over time</h2>
            <p className="admin-chart-subtitle">Last 30 days</p>
          </div>
          <div className="admin-chart-body">
            {stats && stats.lookupsByDay && stats.lookupsByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats.lookupsByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="date" tickLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} tickMargin={8} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#1a1a1a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="admin-chart-empty">{loading ? 'Loading…' : 'No data yet.'}</p>
            )}
          </div>
        </article>

        <article className="card admin-chart-card">
          <div className="admin-chart-header">
            <h2 className="admin-chart-title">Users by role</h2>
            <p className="admin-chart-subtitle">Distribution of accounts</p>
          </div>
          <div className="admin-chart-body">
            {roleData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={roleData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {roleData.map((entry) => (
                      <Cell key={entry.key} fill={ROLE_COLORS[entry.key] || '#1a1a1a'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="admin-chart-empty">{loading ? 'Loading…' : 'No users yet.'}</p>
            )}
          </div>
        </article>
      </section>
      {showToast && error && (
        <div className="admin-toast admin-toast-error">
          {error}
        </div>
      )}
    </div>
  );
}


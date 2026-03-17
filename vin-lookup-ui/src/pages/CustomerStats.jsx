import { useState, useEffect } from 'react';
import { getMyStats } from '../api';
import Loader from '../components/Loader';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function CustomerStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMyStats()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load stats');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="customer-stats-loading">
        <Loader message="Loading your stats…" showProgress={false} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-stats-error card">
        <p>{error}</p>
      </div>
    );
  }

  const total = data?.totalLookups ?? 0;
  const lookups = data?.lookups ?? [];

  return (
    <div className="customer-dashboard">
      <section className="card customer-stats-card customer-stats-summary">
        <h2 className="admin-section-title">Your scraping stats</h2>
        <p className="admin-section-subtitle">Total lookups performed by you.</p>
        <div className="customer-stats-total-wrap">
          <span className="customer-stats-total" data-value={total}>
            {total}
          </span>
          <span className="customer-stats-total-label">total lookups</span>
        </div>
      </section>

      <section className="card customer-stats-card">
        <h2 className="admin-section-title">Recent records</h2>
        <p className="admin-section-subtitle">Your last 100 lookups. Only your data is shown.</p>
        {lookups.length === 0 ? (
          <p className="customer-stats-empty">No lookups yet. Use the Lookup page to run your first search.</p>
        ) : (
          <div className="customer-stats-table-wrap">
            <table className="customer-stats-table">
              <thead>
                <tr>
                  <th>VIN</th>
                  <th>Cart</th>
                  <th>SKU query</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {lookups.map((row) => (
                  <tr key={row.id}>
                    <td><code className="customer-stats-vin">{row.query_vin || '—'}</code></td>
                    <td>{row.query_cart_name || '—'}</td>
                    <td>{row.query_sku_query ? <code>{row.query_sku_query}</code> : '—'}</td>
                    <td className="customer-stats-date">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

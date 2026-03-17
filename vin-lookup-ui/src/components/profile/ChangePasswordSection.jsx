import { useState } from 'react';
import { changeMyPassword } from '../../api';

export default function ChangePasswordSection() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setLoading(true);
    try {
      await changeMyPassword({ password });
      setMessage({ type: 'success', text: 'Password updated successfully' });
      setPassword('');
      setConfirm('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card customer-profile-card">
      <h2 className="admin-section-title">Change password</h2>
      <p className="admin-section-subtitle">Set a new password for your account.</p>
      <form onSubmit={handleSubmit} className="customer-change-password-form">
        <div className="customer-form-group">
          <label htmlFor="customer-new-password">New password</label>
          <input
            id="customer-new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            autoComplete="new-password"
            disabled={loading}
          />
        </div>
        <div className="customer-form-group">
          <label htmlFor="customer-confirm-password">Confirm password</label>
          <input
            id="customer-confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat new password"
            autoComplete="new-password"
            disabled={loading}
          />
        </div>
        {message.text && (
          <div className={`customer-form-message customer-form-message-${message.type}`}>
            {message.text}
          </div>
        )}
        <button type="submit" className="customer-form-submit" disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  );
}

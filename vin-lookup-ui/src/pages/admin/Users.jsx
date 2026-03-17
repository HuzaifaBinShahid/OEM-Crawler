import { useEffect, useState } from 'react';
import { createInternalUser, deleteUser, getAdminUsers, updateUser } from '../../api';
import Loader from '../../components/Loader';

const MIN_PASSWORD_LENGTH = 8;

function RoleBadge({ role }) {
  const label = role === 'admin' ? 'Admin' : role === 'internal' ? 'Internal' : 'Customer';
  return <span className={`admin-role-badge admin-role-${role}`}>{label}</span>;
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [showToast, setShowToast] = useState(false);

  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [activeUser, setActiveUser] = useState(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const openCreate = () => {
    setModalMode('create');
    setActiveUser(null);
    setFormEmail('');
    setFormPassword('');
    setFormError('');
  };

  const openEdit = (user) => {
    setModalMode('edit');
    setActiveUser(user);
    setFormEmail(user.email);
    setFormPassword('');
    setFormError('');
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveUser(null);
    setFormEmail('');
    setFormPassword('');
  };

  const loadUsers = async () => {
    setLoading(true);
    setPageError('');
    try {
      const data = await getAdminUsers();
      setUsers(data || []);
    } catch (err) {
      const msg = err.message || 'Failed to load users';
      setPageError(msg);
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const emailTrim = formEmail.trim().toLowerCase();
    const passwordTrim = formPassword.trim();
    if (!emailTrim) {
      setFormError('Email is required.');
      return;
    }
    if (!emailTrim.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (modalMode === 'create') {
      if (!passwordTrim) {
        setFormError('Password is required.');
        return;
      }
      if (passwordTrim.length < MIN_PASSWORD_LENGTH) {
        setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
    } else if (modalMode === 'edit' && passwordTrim && passwordTrim.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setFormLoading(true);
    try {
      if (modalMode === 'create') {
        await createInternalUser({ email: emailTrim, password: passwordTrim });
      } else if (modalMode === 'edit' && activeUser) {
        await updateUser(activeUser.id, {
          email: emailTrim,
          password: passwordTrim || undefined,
        });
      }
      await loadUsers();
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Operation failed. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user ${user.email}?`)) return;
    try {
      await deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      const msg = err.message || 'Failed to delete user';
      setPageError(msg);
      setShowToast(true);
    }
  };

  useEffect(() => {
    if (!pageError) return undefined;
    setShowToast(true);
    const id = setTimeout(() => setShowToast(false), 4000);
    return () => clearTimeout(id);
  }, [pageError]);

  return (
    <div className="admin-users">
      <div className="admin-users-header">
        <div>
          <h2 className="admin-section-title">Users</h2>
          <p className="admin-section-subtitle">Manage internal users and view all accounts.</p>
        </div>
        <button type="button" className="btn admin-users-create" onClick={openCreate}>
          Create internal user
        </button>
      </div>

      <div className="card admin-users-card">
        {loading ? (
          <div className="admin-users-loading">
            <Loader message="Loading users…" showProgress={false} />
          </div>
        ) : users.length === 0 ? (
          <p>No users yet.</p>
        ) : (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td>
                      <div className="admin-users-actions">
                        <button
                          type="button"
                          className="admin-users-action-btn"
                          onClick={() => openEdit(u)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-users-action-btn admin-users-action-danger"
                          onClick={() => handleDelete(u)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMode && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div
            className="admin-modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h3 className="admin-modal-title">
              {modalMode === 'create' ? 'Create internal user' : 'Edit user'}
            </h3>
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="admin-user-email">Email</label>
                <input
                  id="admin-user-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={formLoading}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-user-password">
                  {modalMode === 'create' ? 'Password' : 'Password (leave blank to keep existing)'}
                </label>
                <input
                  id="admin-user-password"
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={formLoading}
                />
              </div>
              {formError && <p className="auth-error" style={{ marginTop: '0.5rem' }}>{formError}</p>}
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="btn admin-modal-cancel"
                  onClick={closeModal}
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={formLoading}>
                  {formLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showToast && pageError && (
        <div className="admin-toast admin-toast-error">
          {pageError}
        </div>
      )}
    </div>
  );
}


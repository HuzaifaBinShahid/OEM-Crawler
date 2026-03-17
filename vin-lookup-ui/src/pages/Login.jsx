import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EmailField from '../components/auth/EmailField';
import PasswordField from '../components/auth/PasswordField';
import AuthButton from '../components/auth/AuthButton';
import AuthFormError from '../components/auth/AuthFormError';
import Loader from '../components/Loader';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname ?? '/';

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : from || '/', { replace: true });
    }
  }, [user, loading, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const emailTrim = email.trim();
    const passwordTrim = password.trim();
    if (!emailTrim || !passwordTrim) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      const userData = await login({ email: emailTrim.toLowerCase(), password: passwordTrim });
      if (userData) {
        navigate(userData.role === 'admin' ? '/admin' : from || '/', { replace: true });
      } else {
        setError('Invalid email or password.');
      }
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-page auth-page--loading">
        <Loader message="Loading…" showProgress={false} />
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1 className="title">Sign in</h1>
        <p className="subtitle">Enter your email and password.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <EmailField
            id="login-email"
            label="Email"
            value={email}
            onChange={setEmail}
            disabled={submitting}
          />
          <PasswordField
            id="login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            disabled={submitting}
            autoComplete="current-password"
          />
          <AuthFormError message={error} />
          <AuthButton type="submit" disabled={submitting} loading={submitting} loadingLabel="Signing in…">
            Sign in
          </AuthButton>
        </form>
        <p className="auth-switch">
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

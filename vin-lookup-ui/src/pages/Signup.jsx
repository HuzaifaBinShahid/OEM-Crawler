import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EmailField from '../components/auth/EmailField';
import PasswordField from '../components/auth/PasswordField';
import AuthButton from '../components/auth/AuthButton';
import AuthFormError from '../components/auth/AuthFormError';
import Loader from '../components/Loader';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { user, loading, signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : '/', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const emailTrim = email.trim().toLowerCase();
    const passwordTrim = password.trim();
    const confirmTrim = confirmPassword.trim();

    if (!emailTrim) {
      setError('Email is required.');
      return;
    }
    if (!EMAIL_RE.test(emailTrim)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!passwordTrim) {
      setError('Password is required.');
      return;
    }
    if (passwordTrim.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (!confirmTrim) {
      setError('Please confirm your password.');
      return;
    }
    if (passwordTrim !== confirmTrim) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const userData = await signup({ email: emailTrim, password: passwordTrim });
      if (userData) {
        navigate('/', { replace: true });
      } else {
        setError('Sign up failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.');
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
        <h1 className="title">Create account</h1>
        <p className="subtitle">Enter your email and a password (min 8 characters).</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <EmailField
            id="signup-email"
            label="Email"
            value={email}
            onChange={setEmail}
            disabled={submitting}
          />
          <PasswordField
            id="signup-password"
            label="Password"
            value={password}
            onChange={setPassword}
            disabled={submitting}
            minLength={MIN_PASSWORD_LENGTH}
          />
          <PasswordField
            id="signup-confirm"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            disabled={submitting}
          />
          <AuthFormError message={error} />
          <AuthButton type="submit" disabled={submitting} loading={submitting} loadingLabel="Creating account…">
            Sign up
          </AuthButton>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-card">
        <h1>Invalid link</h1>
        <p>This reset link is missing its token. Request a new one from the forgot password page.</p>
        <p className="auth-switch">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-card">
        <h1>Password updated</h1>
        <p>Your password has been reset. Redirecting you to log in…</p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Set a new password</h1>
      <form onSubmit={handleSubmit}>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}

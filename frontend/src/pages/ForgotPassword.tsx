import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-card">
        <h1>Check your email</h1>
        <p>If an account exists for that email, we&apos;ve sent a link to reset the password.</p>
        <p className="auth-switch">
          <Link to="/login">Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Forgot password</h1>
      <p>Enter your email and we&apos;ll send you a link to reset your password.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}

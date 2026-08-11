import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const { user, verifyEmail, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(token ? 'verifying' : 'error');
  const [resendEmail, setResendEmail] = useState(user?.email ?? '');
  const [resendSent, setResendSent] = useState(false);
  const [resendSubmitting, setResendSubmitting] = useState(false);

  // The token is single-use, so the verification call must fire at most
  // once per token no matter how many times this effect itself runs (React
  // StrictMode deliberately double-invokes effects in dev; a real remount
  // could too) — otherwise a second, now-stale attempt would overwrite a
  // successful 'success' status with 'error'.
  const verifyAttempted = useRef(false);

  useEffect(() => {
    if (!token || verifyAttempted.current) return;
    verifyAttempted.current = true;
    verifyEmail(token)
      .then(() => {
        setStatus('success');
        setTimeout(() => navigate('/'), 1500);
      })
      .catch(() => setStatus('error'));
    // Only ever run once per token — verifyEmail/navigate identity changing
    // shouldn't re-trigger a second verification attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleResend(e: FormEvent) {
    e.preventDefault();
    setResendSubmitting(true);
    try {
      await resendVerification(resendEmail);
      setResendSent(true);
    } finally {
      setResendSubmitting(false);
    }
  }

  if (status === 'verifying') {
    return (
      <div className="auth-card">
        <h1>Confirming your email…</h1>
        <p>One moment.</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="auth-card">
        <h1>You&apos;re in! 🎉</h1>
        <p>Your email is confirmed and your account is ready. Taking you in…</p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Link expired or invalid</h1>
      <p>
        {token
          ? "That confirmation link didn't work — it may have expired or already been used."
          : "This link is missing its confirmation code."}{' '}
        Enter your email below and we&apos;ll send a fresh one.
      </p>
      {resendSent ? (
        <p>Check your email for a new confirmation link.</p>
      ) : (
        <form onSubmit={handleResend}>
          <label>
            Email
            <input
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          <button type="submit" disabled={resendSubmitting}>
            {resendSubmitting ? 'Sending…' : 'Resend confirmation email'}
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Pending() {
  const { user, logout, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (!user?.email) return;
    setResending(true);
    try {
      await resendVerification(user.email);
      setResendSent(true);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Almost there 👋</h1>
      <p>
        We sent a confirmation link to <strong>{user?.email}</strong> — click it to get straight in,
        no need to wait on anyone.
      </p>
      {resendSent ? (
        <p>Sent! Check your email for the new link.</p>
      ) : (
        <button onClick={handleResend} disabled={resending}>
          {resending ? 'Sending…' : 'Resend confirmation email'}
        </button>
      )}
      <p className="auth-switch">
        <button
          type="button"
          className="link-btn"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          Log out
        </button>
      </p>
    </div>
  );
}

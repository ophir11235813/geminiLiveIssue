import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Pending() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="auth-card">
      <h1>Almost there 👋</h1>
      <p>
        Your account (<strong>{user?.email}</strong>) has been created and is waiting for an admin to
        approve access. You&apos;ll get an email as soon as you&apos;re approved.
      </p>
      <button
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
      >
        Log out
      </button>
    </div>
  );
}

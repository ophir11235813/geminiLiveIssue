import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Revoked() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="auth-card">
      <h1>Access revoked</h1>
      <p>
        Access for <strong>{user?.email}</strong> has been revoked. Contact the admin if you think this
        is a mistake.
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

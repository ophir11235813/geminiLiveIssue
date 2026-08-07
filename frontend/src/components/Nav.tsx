import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user || user.status !== 'approved') {
    return (
      <header className="nav">
        <span className="brand">👨‍👩‍👧 Family Context Bot</span>
      </header>
    );
  }

  return (
    <header className="nav">
      <span className="brand">👨‍👩‍👧 Family Context Bot</span>
      <nav className="nav-links">
        <Link to="/">Chat</Link>
        <Link to="/documents">Documents</Link>
        {user.role === 'admin' && <Link to="/admin">Admin</Link>}
      </nav>
      <div className="nav-right">
        <span className="user-email">{user.email}</span>
        <button
          className="link-btn"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}

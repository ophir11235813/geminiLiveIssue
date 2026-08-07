import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Logo() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H9l-3.8 3.2c-.5.4-1.2.05-1.2-.6V16h-.5c-.83 0-1.5-.67-1.5-1.5v-9Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="brand-word">Springhill Sherpa</span>
    </span>
  );
}

export function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user || user.status !== 'approved') {
    return (
      <header className="nav">
        <Logo />
      </header>
    );
  }

  return (
    <header className="nav">
      <Logo />
      <nav className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Chat
        </NavLink>
        <NavLink to="/documents" className={({ isActive }) => (isActive ? 'active' : '')}>
          Documents
        </NavLink>
        {user.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
            Admin
          </NavLink>
        )}
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

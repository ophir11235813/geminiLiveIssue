import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Logo() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* A twin-peak mountain — a distinctive mark, not a generic chat
              bubble, kept from the earlier "Sherpa" branding pass since the
              name change didn't touch the visual identity. */}
          <path d="M3 19 L8 6 L11 12 L15 4 L21 19 Z" fill="currentColor" />
        </svg>
      </span>
      <span className="brand-word">Springhill Cubby</span>
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

import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import Auth from './pages/Auth.jsx';
import Home from './pages/Home.jsx';
import History from './pages/History.jsx';
import Track from './pages/Track.jsx';
import Icon from './Icon.jsx';

const loggedIn = () => !!localStorage.getItem('token');

export function Brand({ to = '/' }) {
  return (
    <a className="brand" href={to}>
      <span className="brand-mark"><Icon n="shield" /></span>
      <span>Road<b>ResQ</b></span>
    </a>
  );
}

function Shell({ children }) {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const logout = () => {
    localStorage.clear();
    nav('/login');
  };
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Brand />
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end><Icon n="car" /><span>Trip</span></NavLink>
            <NavLink to="/history"><Icon n="history" /><span>History</span></NavLink>
            <button onClick={logout} aria-label="Log out"><Icon n="logout" /><span>Log out</span></button>
          </nav>
        </div>
      </header>
      <main className="page">
        {user.name && (
          <div className="page-head">
            <h1>Hello, {user.name.split(' ')[0]}</h1>
            <p>Driving {user.carNo || 'your car'} · You’re protected while a trip is running.</p>
          </div>
        )}
        {children}
      </main>
      <footer className="foot">
        Nearest-station data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> ·
        Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a>
      </footer>
    </>
  );
}

const Guard = ({ children }) => (loggedIn() ? <Shell>{children}</Shell> : <Navigate to="/login" replace />);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Auth />} />
      <Route path="/track/:token" element={<Track />} />
      <Route path="/" element={<Guard><Home /></Guard>} />
      <Route path="/history" element={<Guard><History /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

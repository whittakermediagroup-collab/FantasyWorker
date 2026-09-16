import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LeagueRoster from './pages/LeagueRoster';
import StartSit from './pages/StartSit';
import Trades from './pages/Trades';
import Settings from './pages/Settings';

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">FM</span>
            <span className="brand-name">Fantasy Manager</span>
          </div>
          <nav>
            <NavLink to="/" end>Teams</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/league/:id/roster" element={<LeagueRoster />} />
            <Route path="/league/:id/start-sit" element={<StartSit />} />
            <Route path="/league/:id/trades" element={<Trades />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

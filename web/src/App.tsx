import React, { Component, ErrorInfo, createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { api, tokenStore } from './api';
import { User } from './types';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import ClientDashboard from './pages/ClientDashboard';
import Clients from './pages/Clients';
import Projects from './pages/Projects';
import Activities from './pages/Activities';
import Agenda from './pages/Agenda';
import Hours from './pages/Hours';
import Reports from './pages/Reports';
import Audit from './pages/Audit';
import Appointments from './pages/Appointments';
import Notifications from './pages/Notifications';
import HourBank from './pages/HourBank';
import Templates from './pages/Templates';
import Kanban from './pages/Kanban';

interface Session {
  user: User | null;
  token: string | null;
  setSession: (user: User, token: string) => void;
  logout: () => void;
  loading: boolean;
}

const Ctx = createContext<Session>({
  user: null, token: null, setSession: () => {}, logout: () => {}, loading: true
});

export function useSession() { return useContext(Ctx); }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = tokenStore().get();
    if (!t) { setLoading(false); return; }
    api.get('/auth/me', t).then((r: any) => {
      setUser(r.user); setToken(t);
    }).catch(() => tokenStore().clear())
      .finally(() => setLoading(false));
  }, []);

  const setSession = (u: User, t: string) => {
    tokenStore().set(t); setUser(u); setToken(t);
  };
  const logout = () => { tokenStore().clear(); setUser(null); setToken(null); };

  if (loading) return <div className="center">Cargando…</div>;

  return (
    <Ctx.Provider value={{ user, token, setSession, logout, loading }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/set-password" element={<Login />} />
        <Route path="/reset" element={<Login />} />
        {!user && <Route path="*" element={<Navigate to="/login" />} />}
        {user && (
          <Route path="/*" element={
            <Layout>
              <AppErrorBoundary>
                <Routes>
                  <Route path="/" element={user.role === 'admin' ? <AdminDashboard /> : <ClientDashboard />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/activities" element={<Activities />} />
                  <Route path="/kanban" element={<Kanban />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/hours" element={<Hours />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/hourbank" element={<HourBank />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/audit" element={<Audit />} />
                </Routes>
              </AppErrorBoundary>
            </Layout>
          } />
        )}
      </Routes>
    </Ctx.Provider>
  );
}

function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const nav = [
    { to: '/', label: 'Inicio' },
    ...(user?.role === 'admin' ? [{ to: '/clients', label: 'Clientes' }] : []),
    { to: '/projects', label: 'Proyectos' },
    { to: '/activities', label: 'Actividades' },
    { to: '/kanban', label: 'Tablero' },
    { to: '/agenda', label: 'Agenda' },
    { to: '/appointments', label: 'Citas' },
    { to: '/hours', label: 'Horas' },
    { to: '/reports', label: 'Reportes' },
    { to: '/notifications', label: 'Notificaciones' },
    ...(user?.role === 'admin' ? [{ to: '/hourbank', label: 'Bolsa horas' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/templates', label: 'Plantillas' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/audit', label: 'Auditoría' }] : [])
  ];
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Consultoría Control</div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>{user?.first_name} {user?.last_name} ({user?.role})</span>
          <button onClick={logout}>Salir</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[frontend]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <h2>No se pudo mostrar esta sección</h2>
          <p className="msg err">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Reintentar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

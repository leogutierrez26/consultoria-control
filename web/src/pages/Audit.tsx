import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

export default function Audit() {
  const { token, user } = useSession();
  const [logs, setLogs] = useState<any[]>([]);
  const [filters, setFilters] = useState({ from: weekAgo, to: today, entity: '', action: '' });

  async function load() {
    if (user?.role !== 'admin') return;
    const params = new URLSearchParams({ limit: '200' });
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.entity) params.set('entity', filters.entity);
    if (filters.action) params.set('action', filters.action);
    const r: any = await api.get(`/audit?${params.toString()}`, token);
    setLogs(r.logs || []);
  }

  useEffect(() => { load().catch(() => {}); }, [token, user]);

  if (user?.role !== 'admin') return <div className="card">Solo el administrador puede ver la auditoría.</div>;

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Control</p><h2>Auditoría</h2></div>
        <button onClick={load}>Consultar</button>
      </div>

      <section className="card">
        <strong>Filtros</strong>
        <div className="grid cols-4">
          <div><label>Desde</label><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><label>Hasta</label><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          <div><label>Entidad</label><input value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })} placeholder="activities, projects..." /></div>
          <div><label>Acción</label><input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="create, update..." /></div>
        </div>
      </section>

      <section className="card">
        <div className="section-title"><strong>Eventos</strong><span>{logs.length} registros</span></div>
        <table>
          <thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>ID</th><th>IP</th></tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={5}>No hay registros para estos filtros.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}><td>{new Date(l.created_at).toLocaleString()}</td><td><span className="badge">{l.action}</span></td>
                <td>{l.entity}</td><td>{l.entity_id?.slice(0, 8) || '—'}</td><td>{l.ip_address || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

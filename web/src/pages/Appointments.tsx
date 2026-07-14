import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const statuses = ['pendiente', 'confirmada', 'reprogramada', 'atendida', 'cancelada_cliente', 'cancelada_admin', 'rechazada'];

function badge(status: string) {
  if (status === 'confirmada' || status === 'atendida') return 'ok';
  if (status.includes('cancel') || status === 'rechazada') return 'err';
  return 'warn';
}

export default function Appointments() {
  const { token, user } = useSession();
  const [appts, setAppts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [filters, setFilters] = useState({ from: monthStart, to: today, client_id: '', status: '' });

  async function load() {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.client_id) params.set('client_id', filters.client_id);
    if (filters.status) params.set('status', filters.status);
    const [r, c]: any[] = await Promise.all([
      api.get(`/appointments?${params.toString()}`, token),
      api.get('/clients', token)
    ]);
    setAppts(r.appointments || []);
    setClients(c.clients || []);
  }

  useEffect(() => { load(); }, [token]);

  async function act(id: string, action: string) {
    await api.post(`/appointments/${id}/${action}`, {}, token);
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Agenda</p><h2>Citas</h2></div>
        <button onClick={load}>Actualizar</button>
      </div>

      <section className="card">
        <strong>Filtros</strong>
        <div className="grid cols-4">
          <div><label>Desde</label><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><label>Hasta</label><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          {user?.role === 'admin' && <div><label>Cliente</label><select value={filters.client_id} onChange={(e) => setFilters({ ...filters, client_id: e.target.value })}>
            <option value="">Todos</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </select></div>}
          <div><label>Estado</label><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Todos</option>{statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select></div>
        </div>
      </section>

      <section className="card">
        <div className="section-title"><strong>Listado de citas</strong><span>{appts.length} citas</span></div>
        <table>
          <thead><tr><th>Inicio</th><th>Cliente</th><th>Proyecto</th><th>Modalidad</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {appts.length === 0 && <tr><td colSpan={7}>No hay citas para los filtros seleccionados.</td></tr>}
            {appts.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.start_time).toLocaleString()}</td>
                <td>{a.client_name || 'N/A'}</td>
                <td>{a.project_name || 'Sin proyecto'}</td>
                <td>{a.modality}</td>
                <td>{a.reason}</td>
                <td><span className={`badge ${badge(a.status)}`}>{a.status.replace('_', ' ')}</span></td>
                <td className="actions-cell">
                  {user?.role === 'admin' && a.status === 'pendiente' && <button className="ghost" onClick={() => act(a.id, 'confirm')}>Confirmar</button>}
                  {user?.role === 'admin' && !['atendida', 'cancelada_admin', 'cancelada_cliente', 'rechazada'].includes(a.status) && <button className="ghost" onClick={() => act(a.id, 'attend')}>Atendida</button>}
                  {!a.status.includes('cancel') && a.status !== 'atendida' && <button className="ghost" onClick={() => act(a.id, user?.role === 'admin' ? 'cancel_admin' : 'cancel_client')}>Cancelar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

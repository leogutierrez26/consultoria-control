import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Hours() {
  const { token, user } = useSession();
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [f, setF] = useState({ client_id: '', project_id: '', duration_minutes: 60, description: '', billable: true });
  const [timer, setTimer] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);

  async function load() {
    const r: any = await api.get('/hours', token); setEntries(r.entries || []);
    const p: any = await api.get('/projects', token); setProjects(p.projects || []);
    const c: any = await api.get('/clients', token); setClients(c.clients || []);
    const t: any = await api.get('/hours/timer', token); setTimer(t.timer || null);
  }
  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    if (timer) {
      const base = new Date(timer.started_at).getTime();
      const iv = setInterval(() => setElapsed(Math.round((Date.now() - base) / 1000)), 1000);
      return () => clearInterval(iv);
    }
  }, [timer]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/hours', {
      client_id: f.client_id || clients[0]?.id,
      project_id: f.project_id || projects[0]?.id,
      work_date: new Date().toISOString().slice(0, 10),
      duration_minutes: Number(f.duration_minutes),
      description: f.description, billable: f.billable
    }, token);
    setF({ client_id: '', project_id: '', duration_minutes: 60, description: '', billable: true });
    await load();
  }

  async function startTimer() {
    await api.post('/hours/timer/start', {
      client_id: clients[0]?.id, project_id: projects[0]?.id, description: 'Trabajo'
    }, token);
    await load();
  }
  async function pause() { if (timer) await api.post(`/hours/timer/${timer.id}/pause`, {}, token); await load(); }
  async function stop() { if (timer) await api.post(`/hours/timer/${timer.id}/stop`, { description: 'Consolidado', billable: true }, token); await load(); }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div>
      <h2>Registro de horas</h2>
      {user?.role === 'admin' && (
        <form className="card" onSubmit={add}>
          <div className="grid cols-2">
            <div><label>Proyecto</label><select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
              <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label>Duración (min)</label><input type="number" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: Number(e.target.value) })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Descripción</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <label><input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} /> Facturable</label>
          <button style={{ marginTop: 12 }}>Registrar horas</button>
        </form>
      )}

      {user?.role === 'admin' && (
        <div className="card">
          <strong>Cronómetro</strong>
          <div style={{ fontSize: '1.6rem', margin: '8px 0' }}>{timer ? fmt(elapsed) : '00:00'}</div>
          <div className="row">
            {!timer
              ? <button onClick={startTimer}>Iniciar</button>
              : <>
                <button className="ghost" onClick={pause}>{timer.paused_at ? 'Reanudar' : 'Pausar'}</button>
                <button className="danger" onClick={stop}>Finalizar y guardar</button>
              </>}
          </div>
        </div>
      )}

      <table className="card">
        <thead><tr><th>Fecha</th><th>Proyecto</th><th>Min</th><th>Facturable</th><th>Descripción</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}><td>{e.work_date}</td><td>{e.project_name}</td><td>{e.duration_minutes}</td>
              <td><span className={`badge ${e.billable ? 'ok' : 'warn'}`}>{e.billable ? 'Sí' : 'No'}</span></td><td>{e.description}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

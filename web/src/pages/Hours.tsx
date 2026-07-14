import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

function hours(min: number | string) {
  return (Number(min || 0) / 60).toFixed(1);
}

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Hours() {
  const { token, user } = useSession();
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [filters, setFilters] = useState({ from: monthStart, to: today, client_id: '', project_id: '' });
  const [form, setForm] = useState({ client_id: '', project_id: '', activity_id: '', work_date: today, duration_minutes: 60, description: '', billable: true });
  const [timerForm, setTimerForm] = useState({ client_id: '', project_id: '', activity_id: '', description: '' });
  const [timer, setTimer] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  const visibleProjects = useMemo(() => {
    const client = form.client_id || filters.client_id || timerForm.client_id;
    return client ? projects.filter((p) => p.client_id === client) : projects;
  }, [projects, form.client_id, filters.client_id, timerForm.client_id]);

  const formActivities = useMemo(
    () => activities.filter((a) => !form.project_id || a.project_id === form.project_id),
    [activities, form.project_id]
  );
  const timerActivities = useMemo(
    () => activities.filter((a) => !timerForm.project_id || a.project_id === timerForm.project_id),
    [activities, timerForm.project_id]
  );

  async function load() {
    if (!token) return;
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.client_id) params.set('client_id', filters.client_id);
    if (filters.project_id) params.set('project_id', filters.project_id);
    const [r, p, c, a, t]: any[] = await Promise.all([
      api.get(`/hours?${params.toString()}`, token),
      api.get('/projects', token),
      api.get('/clients', token),
      api.get('/activities', token),
      user?.role === 'admin' ? api.get('/hours/timer', token) : Promise.resolve({ timer: null })
    ]);
    setEntries(r.entries || []);
    setProjects(p.projects || []);
    setClients(c.clients || []);
    setActivities(a.activities || []);
    setTimer(t.timer || null);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, [token]);

  useEffect(() => {
    if (!timer) { setElapsed(0); return; }
    const base = new Date(timer.started_at).getTime();
    const paused = timer.paused_at ? new Date(timer.paused_at).getTime() : null;
    const tick = () => setElapsed(Math.max(0, Math.round(((paused || Date.now()) - base) / 1000) + Number(timer.accumulated_seconds || 0)));
    tick();
    if (paused) return;
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [timer]);

  function normalizeProject(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    return project ? project.client_id : '';
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.project_id) { setError('Selecciona un proyecto para registrar horas.'); return; }
    const clientId = form.client_id || normalizeProject(form.project_id);
    await api.post('/hours', {
      client_id: clientId,
      project_id: form.project_id,
      activity_id: form.activity_id || null,
      work_date: form.work_date,
      duration_minutes: Number(form.duration_minutes),
      description: form.description,
      billable: form.billable
    }, token);
    setForm({ client_id: '', project_id: '', activity_id: '', work_date: today, duration_minutes: 60, description: '', billable: true });
    await load();
  }

  async function startTimer() {
    setError('');
    if (!timerForm.project_id) { setError('Selecciona un proyecto antes de iniciar el cronómetro.'); return; }
    await api.post('/hours/timer/start', {
      client_id: timerForm.client_id || normalizeProject(timerForm.project_id),
      project_id: timerForm.project_id,
      activity_id: timerForm.activity_id || null,
      description: timerForm.description || 'Trabajo en consultoría'
    }, token);
    await load();
  }

  async function pause() { if (timer) await api.post(`/hours/timer/${timer.id}/pause`, {}, token); await load(); }
  async function stop() { if (timer) await api.post(`/hours/timer/${timer.id}/stop`, { description: timer.description || 'Trabajo consolidado', billable: true }, token); await load(); }

  const totalMinutes = entries.reduce((sum, e) => sum + Number(e.duration_minutes || 0), 0);
  const billableMinutes = entries.filter((e) => e.billable).reduce((sum, e) => sum + Number(e.duration_minutes || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Operación</p><h2>Registro de horas</h2></div>
        <button onClick={load}>Actualizar</button>
      </div>

      <section className="card">
        <strong>Filtros</strong>
        <div className="grid cols-4">
          <div><label>Desde</label><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><label>Hasta</label><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          <div><label>Cliente</label><select value={filters.client_id} onChange={(e) => setFilters({ ...filters, client_id: e.target.value, project_id: '' })}>
            <option value="">Todos</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </select></div>
          <div><label>Proyecto</label><select value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}>
            <option value="">Todos</option>{visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        </div>
      </section>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="num">{hours(totalMinutes)}</div><div className="lbl">Horas filtradas</div></div>
        <div className="stat"><div className="num">{hours(billableMinutes)}</div><div className="lbl">Facturables</div></div>
        <div className="stat"><div className="num">{entries.length}</div><div className="lbl">Registros</div></div>
      </div>

      {error && <div className="msg err">{error}</div>}

      {user?.role === 'admin' && (
        <div className="grid cols-2">
          <form className="card" onSubmit={add}>
            <strong>Registrar horas manuales</strong>
            <div className="grid cols-2">
              <div><label>Cliente</label><select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, project_id: '', activity_id: '' })}>
                <option value="">Según proyecto</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>
              <div><label>Proyecto</label><select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value, client_id: form.client_id || normalizeProject(e.target.value), activity_id: '' })}>
                <option value="">Selecciona</option>{visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
              <div><label>Actividad</label><select value={form.activity_id} onChange={(e) => setForm({ ...form, activity_id: e.target.value })}>
                <option value="">Sin actividad</option>{formActivities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select></div>
              <div><label>Fecha</label><input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} /></div>
              <div><label>Duración (min)</label><input type="number" min={1} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
              <div className="check-field"><label><input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} /> Facturable</label></div>
              <div style={{ gridColumn: '1 / -1' }}><label>Descripción</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <button style={{ marginTop: 12 }}>Guardar horas</button>
          </form>

          <section className="card">
            <strong>Cronómetro</strong>
            <div className="timer-display">{timer ? clock(elapsed) : '00:00:00'}</div>
            {!timer && (
              <div className="grid cols-2">
                <div><label>Cliente</label><select value={timerForm.client_id} onChange={(e) => setTimerForm({ ...timerForm, client_id: e.target.value, project_id: '', activity_id: '' })}>
                  <option value="">Según proyecto</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
                </select></div>
                <div><label>Proyecto</label><select value={timerForm.project_id} onChange={(e) => setTimerForm({ ...timerForm, project_id: e.target.value, client_id: timerForm.client_id || normalizeProject(e.target.value), activity_id: '' })}>
                  <option value="">Selecciona</option>{visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
                <div><label>Actividad</label><select value={timerForm.activity_id} onChange={(e) => setTimerForm({ ...timerForm, activity_id: e.target.value })}>
                  <option value="">Sin actividad</option>{timerActivities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select></div>
                <div><label>Descripción</label><input value={timerForm.description} onChange={(e) => setTimerForm({ ...timerForm, description: e.target.value })} /></div>
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              {!timer
                ? <button type="button" onClick={startTimer}>Iniciar</button>
                : <>
                  <button className="ghost" type="button" onClick={pause}>{timer.paused_at ? 'Reanudar' : 'Pausar'}</button>
                  <button className="danger" type="button" onClick={stop}>Finalizar y guardar</button>
                </>}
            </div>
          </section>
        </div>
      )}

      <section className="card">
        <div className="section-title"><strong>Detalle registrado</strong><span>{entries.length} entradas</span></div>
        <table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Proyecto</th><th>Horas</th><th>Tipo</th><th>Descripción</th></tr></thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={6}>No hay horas para los filtros seleccionados.</td></tr>}
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{new Date(`${e.work_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}</td>
                <td>{e.client_name || 'N/A'}</td>
                <td>{e.project_name}</td>
                <td>{hours(e.duration_minutes)}</td>
                <td><span className={`badge ${e.billable ? 'ok' : 'warn'}`}>{e.billable ? 'Facturable' : 'No facturable'}</span></td>
                <td>{e.description || 'Sin descripción'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

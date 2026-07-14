import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../App';
import Updates from './Updates';
import FileManager from './FileManager';

export default function Activities() {
  const { token, user } = useSession();
  const [params] = useSearchParams();
  const projectFilter = params.get('project');
  const [activities, setActivities] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [loggingHours, setLoggingHours] = useState<any>(null);
  const [f, setF] = useState({ client_id: '', project_id: projectFilter || '', title: '', description: '', status: 'pendiente', billable: true, visible_to_client: true });
  const [editF, setEditF] = useState({
    client_id: '',
    project_id: '',
    title: '',
    description: '',
    responsible: '',
    status: 'pendiente',
    priority: 'media',
    start_date: '',
    due_date: '',
    estimated_hours: '',
    progress: 0,
    billable: true,
    visible_to_client: true
  });
  const [hoursF, setHoursF] = useState({ client_id: '', project_id: '', work_date: '', duration_minutes: '60', description: '', billable: true, use_bank: true });
  const [msg, setMsg] = useState('');

  function todayISO() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  async function load() {
    const q = projectFilter ? `?project_id=${projectFilter}` : '';
    const r: any = await api.get(`/activities${q}`, token);
    setActivities(r.activities || []);
    const p: any = await api.get('/projects', token);
    setProjects(p.projects || []);
    const c: any = await api.get('/clients', token);
    setClients(c.clients || []);
  }
  useEffect(() => { load(); }, [token, projectFilter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/activities', {
      ...f,
      client_id: f.client_id || null,
      project_id: user?.role === 'admin' ? (f.project_id || null) : (projectFilter || null)
    }, token);
    setShow(false); setF({ client_id: '', project_id: projectFilter || '', title: '', description: '', status: 'pendiente', billable: true, visible_to_client: true });
    await load();
  }

  async function openDetail(a: any) {
    const r: any = await api.get(`/activities/${a.id}`, token);
    setDetail(r);
  }

  async function finalize(id: string, action: 'finalize' | 'reopen') {
    await api.post(`/activities/${id}/${action}`, {}, token);
    await load();
  }

  function startEdit(a: any) {
    setMsg('');
    setEditing(a);
    setEditF({
      client_id: a.effective_client_id || a.client_id || '',
      project_id: a.project_id || '',
      title: a.title || '',
      description: a.description || '',
      responsible: a.responsible || '',
      status: a.status || 'pendiente',
      priority: a.priority || 'media',
      start_date: a.start_date ? String(a.start_date).slice(0, 10) : '',
      due_date: a.due_date ? String(a.due_date).slice(0, 10) : '',
      estimated_hours: a.estimated_hours === null || a.estimated_hours === undefined ? '' : String(a.estimated_hours),
      progress: Number(a.progress || 0),
      billable: a.billable !== false,
      visible_to_client: a.visible_to_client !== false
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await api.patch(`/activities/${editing.id}`, {
        ...editF,
        client_id: editF.client_id || null,
        project_id: editF.project_id || null,
        start_date: editF.start_date || null,
        due_date: editF.due_date || null,
        estimated_hours: editF.estimated_hours === '' ? null : Number(editF.estimated_hours),
        progress: Number(editF.progress)
      }, token);
      setEditing(null);
      await load();
    } catch (err: any) { setMsg(err.message); }
  }

  function projectClientId(projectId: string): string {
    return projects.find((p) => p.id === projectId)?.client_id || '';
  }

  function projectsForClient(clientId: string) {
    return projects.filter((p) => !clientId || p.client_id === clientId);
  }

  function startLogHours(a: any) {
    const activityClient = a.effective_client_id || a.client_id || projectClientId(a.project_id || '');
    const project_id = a.project_id || '';
    const client_id = activityClient || projectClientId(project_id);
    setMsg('');
    setLoggingHours(a);
    setHoursF({
      client_id,
      project_id,
      work_date: todayISO(),
      duration_minutes: a.estimated_hours ? String(Math.round(Number(a.estimated_hours) * 60)) : '60',
      description: a.description || a.title || '',
      billable: a.billable !== false,
      use_bank: true
    });
  }

  async function saveHours(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const project_id = hoursF.project_id;
    const client_id = hoursF.client_id || projectClientId(project_id);
    if (!project_id && !hoursF.use_bank) { setMsg('Selecciona un proyecto o marca Usar bolsa de horas.'); return; }
    if (!client_id) { setMsg('Selecciona un cliente o un proyecto con cliente asociado.'); return; }
    try {
      await api.post('/hours', {
        client_id,
        project_id: project_id || null,
        activity_id: loggingHours.id,
        work_date: hoursF.work_date,
        duration_minutes: Number(hoursF.duration_minutes),
        description: hoursF.use_bank ? `Bolsa de horas - ${hoursF.description || loggingHours.title}` : (hoursF.description || loggingHours.title),
        billable: hoursF.use_bank ? true : hoursF.billable
      }, token);
      setLoggingHours(null);
      setMsg('Horas registradas en la actividad.');
      await load();
    } catch (err: any) { setMsg(err.message); }
  }

  async function removeActivity(a: any) {
    if (!window.confirm(`¿Eliminar completamente la actividad "${a.title}"? También se borrarán sus subtareas, seguimientos y archivos asociados.`)) return;
    setMsg('');
    try {
      await api.post(`/activities/${a.id}/delete`, {}, token);
      await load();
    } catch (err: any) { setMsg(err.message); }
  }

  return (
    <div>
      <div className="row"><h2>Actividades</h2><span className="spacer" />
        {user?.role === 'admin' && <button onClick={() => setShow(!show)}>Nueva actividad</button>}</div>
      {msg && !editing && !loggingHours && <div className={`msg ${msg.includes('registradas') ? 'ok' : 'err'}`}>{msg}</div>}
      {show && (
        <form className="card" onSubmit={create}>
          <div className="grid cols-2">
            {user?.role === 'admin' && <div><label>Cliente</label>
              <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
                <option value="">Sin cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>}
            {user?.role === 'admin' && <div><label>Proyecto</label>
              <select value={f.project_id} onChange={(e) => {
                const project_id = e.target.value;
                setF({ ...f, project_id, client_id: project_id ? projectClientId(project_id) : f.client_id });
              }}>
                <option value="">Sin proyecto</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>}
            <div><label>Título</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Descripción</label><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <label><input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} /> Facturable</label>
          <button style={{ marginTop: 12 }}>Crear</button>
        </form>
      )}
      <table className="card">
        <thead><tr><th>Cliente</th><th>Proyecto</th><th>Título</th><th>Estado</th><th>Avance</th><th></th></tr></thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.id}>
              <td>{a.client_name || 'Sin cliente'}</td><td>{a.project_name || 'Sin proyecto'}</td><td>{a.title}</td>
              <td><span className="badge">{a.status}</span></td><td>{a.progress}%</td>
              <td className="row">
                <button className="ghost" onClick={() => openDetail(a)}>Ver</button>
                {user?.role === 'admin' && <>
                  <button className="ghost" onClick={() => startEdit(a)}>Editar</button>
                  <button className="ghost" onClick={() => startLogHours(a)}>Tomar horas</button>
                  <button className="ghost" onClick={() => finalize(a.id, 'finalize')}>Finalizar</button>
                  <button className="ghost" onClick={() => finalize(a.id, 'reopen')}>Reabrir</button>
                  <button className="danger" onClick={() => removeActivity(a)}>Eliminar</button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && (
        <div className="modal-back" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{detail.activity.title}</h2>
            <p className="badge">{detail.activity.status}</p>
            <Updates activityId={detail.activity.id} />
            <FileManager entityType="activities" entityId={detail.activity.id} />
            <button className="ghost" onClick={() => setDetail(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <form className="modal wide" onSubmit={saveEdit} onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2>Editar actividad</h2>
              <span className="spacer" />
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cerrar</button>
            </div>
            <div className="grid cols-2">
              <div><label>Cliente</label><select value={editF.client_id} onChange={(e) => setEditF({ ...editF, client_id: e.target.value })}>
                <option value="">Sin cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>
              <div><label>Proyecto</label><select value={editF.project_id} onChange={(e) => {
                const project_id = e.target.value;
                setEditF({ ...editF, project_id, client_id: project_id ? projectClientId(project_id) : editF.client_id });
              }}>
                <option value="">Sin proyecto</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
              <div><label>Título</label><input value={editF.title} onChange={(e) => setEditF({ ...editF, title: e.target.value })} required /></div>
              <div><label>Responsable</label><input value={editF.responsible} onChange={(e) => setEditF({ ...editF, responsible: e.target.value })} /></div>
              <div><label>Estado</label><select value={editF.status} onChange={(e) => setEditF({ ...editF, status: e.target.value })}>
                {['pendiente','programada','en_ejecucion','esperando_info','bloqueada','en_revision','finalizada','cancelada'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
              <div><label>Prioridad</label><select value={editF.priority} onChange={(e) => setEditF({ ...editF, priority: e.target.value })}>
                {['baja','media','alta'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
              <div><label>Inicio</label><input type="date" value={editF.start_date} onChange={(e) => setEditF({ ...editF, start_date: e.target.value })} /></div>
              <div><label>Vencimiento</label><input type="date" value={editF.due_date} onChange={(e) => setEditF({ ...editF, due_date: e.target.value })} /></div>
              <div><label>Horas estimadas</label><input type="number" value={editF.estimated_hours} onChange={(e) => setEditF({ ...editF, estimated_hours: e.target.value })} /></div>
              <div><label>Avance (%)</label><input type="number" min="0" max="100" value={editF.progress} onChange={(e) => setEditF({ ...editF, progress: Number(e.target.value) })} /></div>
              <div className="check-field"><label><input type="checkbox" checked={editF.billable} onChange={(e) => setEditF({ ...editF, billable: e.target.checked })} /> Facturable</label></div>
              <div className="check-field"><label><input type="checkbox" checked={editF.visible_to_client} onChange={(e) => setEditF({ ...editF, visible_to_client: e.target.checked })} /> Visible para el cliente</label></div>
              <div style={{ gridColumn: '1 / -1' }}><label>Descripción</label><textarea value={editF.description} onChange={(e) => setEditF({ ...editF, description: e.target.value })} /></div>
            </div>
            {msg && <div className="msg err">{msg}</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button>Guardar cambios</button>
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {loggingHours && (
        <div className="modal-back" onClick={() => setLoggingHours(null)}>
          <form className="modal" onSubmit={saveHours} onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2>Tomar horas</h2>
              <span className="spacer" />
              <button type="button" className="ghost" onClick={() => setLoggingHours(null)}>Cerrar</button>
            </div>
            <p className="muted">{loggingHours.title}</p>
            <div className="grid cols-2">
              <div><label>Cliente</label><select value={hoursF.client_id} onChange={(e) => {
                const client_id = e.target.value;
                setHoursF({ ...hoursF, client_id, project_id: projectsForClient(client_id).some((p) => p.id === hoursF.project_id) ? hoursF.project_id : '' });
              }} required>
                <option value="">Selecciona cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>
              <div><label>Proyecto</label><select value={hoursF.project_id} onChange={(e) => {
                const project_id = e.target.value;
                setHoursF({ ...hoursF, project_id, client_id: project_id ? projectClientId(project_id) : hoursF.client_id });
              }} required={!hoursF.use_bank}>
                <option value="">Selecciona proyecto</option>{projectsForClient(hoursF.client_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
              <div><label>Fecha</label><input type="date" value={hoursF.work_date} onChange={(e) => setHoursF({ ...hoursF, work_date: e.target.value })} required /></div>
              <div><label>Duración (minutos)</label><input type="number" min="1" value={hoursF.duration_minutes} onChange={(e) => setHoursF({ ...hoursF, duration_minutes: e.target.value })} required /></div>
              <div className="check-field"><label><input type="checkbox" checked={hoursF.use_bank} onChange={(e) => setHoursF({ ...hoursF, use_bank: e.target.checked })} /> Usar bolsa de horas</label></div>
              <div className="check-field"><label><input type="checkbox" checked={hoursF.billable} onChange={(e) => setHoursF({ ...hoursF, billable: e.target.checked })} /> Facturable</label></div>
              <div style={{ gridColumn: '1 / -1' }}><label>Descripción para el informe</label><textarea value={hoursF.description} onChange={(e) => setHoursF({ ...hoursF, description: e.target.value })} /></div>
            </div>
            {msg && <div className={`msg ${msg.includes('registradas') ? 'ok' : 'err'}`}>{msg}</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button>Registrar horas</button>
              <button type="button" className="ghost" onClick={() => setLoggingHours(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

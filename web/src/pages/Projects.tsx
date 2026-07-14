import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Projects() {
  const { token, user } = useSession();
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [f, setF] = useState({ client_id: '', code: '', name: '', description: '', status: 'borrador', visible_to_client: true });
  const [editF, setEditF] = useState({
    name: '',
    description: '',
    status: 'borrador',
    priority: 'media',
    start_date: '',
    estimated_end_date: '',
    hour_budget: '',
    hourly_rate: '',
    responsible: '',
    progress: 0,
    visible_to_client: true
  });
  const [msg, setMsg] = useState('');

  async function load() {
    const r: any = await api.get('/projects', token);
    setProjects(r.projects || []);
    const c: any = await api.get('/clients', token);
    setClients(c.clients || []);
  }
  useEffect(() => { load(); }, [token]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/projects', { ...f, client_id: user?.role === 'admin' ? f.client_id : undefined }, token);
    setShow(false);
    setF({ client_id: '', code: '', name: '', description: '', status: 'borrador', visible_to_client: true });
    await load();
  }

  function startEdit(p: any) {
    setMsg('');
    setEditing(p);
    setEditF({
      name: p.name || '',
      description: p.description || '',
      status: p.status || 'borrador',
      priority: p.priority || 'media',
      start_date: p.start_date ? String(p.start_date).slice(0, 10) : '',
      estimated_end_date: p.estimated_end_date ? String(p.estimated_end_date).slice(0, 10) : '',
      hour_budget: p.hour_budget === null || p.hour_budget === undefined ? '' : String(p.hour_budget),
      hourly_rate: p.hourly_rate === null || p.hourly_rate === undefined ? '' : String(p.hourly_rate),
      responsible: p.responsible || '',
      progress: Number(p.progress || 0),
      visible_to_client: p.visible_to_client !== false
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await api.patch(`/projects/${editing.id}`, {
        ...editF,
        start_date: editF.start_date || null,
        estimated_end_date: editF.estimated_end_date || null,
        hour_budget: editF.hour_budget === '' ? null : Number(editF.hour_budget),
        hourly_rate: editF.hourly_rate === '' ? null : Number(editF.hourly_rate),
        progress: Number(editF.progress)
      }, token);
      setEditing(null);
      await load();
    } catch (err: any) { setMsg(err.message); }
  }

  async function removeProject(p: any) {
    if (!window.confirm(`¿Eliminar/archivar el proyecto "${p.name}"?`)) return;
    setMsg('');
    try {
      await api.post(`/projects/${p.id}/archive`, {}, token);
      await load();
    } catch (err: any) { setMsg(err.message); }
  }

  return (
    <div>
      <div className="row"><h2>Proyectos</h2><span className="spacer" />
        {user?.role === 'admin' && <button onClick={() => setShow(!show)}>Nuevo proyecto</button>}</div>
      {show && (
        <form className="card" onSubmit={create}>
          <div className="grid cols-2">
            <div><label>Cliente</label>
              <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required>
                <option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>
            <div><label>Código</label><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></div>
            <div><label>Nombre</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div><label>Estado</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {['borrador','pendiente','en_ejecucion','suspendido','finalizado','cancelado','archivado'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Descripción</label><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <label><input type="checkbox" checked={f.visible_to_client} onChange={(e) => setF({ ...f, visible_to_client: e.target.checked })} /> Visible para el cliente</label>
          <button style={{ marginTop: 12 }}>Crear</button>
        </form>
      )}
      <table className="card">
        <thead><tr><th>Cliente</th><th>Código</th><th>Nombre</th><th>Estado</th><th>Avance</th><th></th></tr></thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>{p.client_name}</td><td>{p.code}</td><td>{p.name}</td>
              <td><span className="badge">{p.status}</span></td><td>{p.progress}%</td>
              <td className="row">
                <a href={`#/activities?project=${p.id}`}><button className="ghost">Actividades</button></a>
                {user?.role === 'admin' && <>
                  <button className="ghost" onClick={() => startEdit(p)}>Editar</button>
                  <button className="danger" onClick={() => removeProject(p)} disabled={p.status === 'archivado'}>Eliminar</button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <form className="modal wide" onSubmit={saveEdit} onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2>Editar proyecto</h2>
              <span className="spacer" />
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cerrar</button>
            </div>
            <div className="grid cols-2">
              <div><label>Nombre</label><input value={editF.name} onChange={(e) => setEditF({ ...editF, name: e.target.value })} required /></div>
              <div><label>Responsable</label><input value={editF.responsible} onChange={(e) => setEditF({ ...editF, responsible: e.target.value })} /></div>
              <div><label>Estado</label><select value={editF.status} onChange={(e) => setEditF({ ...editF, status: e.target.value })}>
                {['borrador','pendiente','en_ejecucion','suspendido','finalizado','cancelado','archivado'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
              <div><label>Prioridad</label><select value={editF.priority} onChange={(e) => setEditF({ ...editF, priority: e.target.value })}>
                {['baja','media','alta'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
              <div><label>Fecha inicio</label><input type="date" value={editF.start_date} onChange={(e) => setEditF({ ...editF, start_date: e.target.value })} /></div>
              <div><label>Fecha estimada fin</label><input type="date" value={editF.estimated_end_date} onChange={(e) => setEditF({ ...editF, estimated_end_date: e.target.value })} /></div>
              <div><label>Presupuesto horas</label><input type="number" value={editF.hour_budget} onChange={(e) => setEditF({ ...editF, hour_budget: e.target.value })} /></div>
              <div><label>Tarifa hora</label><input type="number" value={editF.hourly_rate} onChange={(e) => setEditF({ ...editF, hourly_rate: e.target.value })} /></div>
              <div><label>Avance (%)</label><input type="number" min="0" max="100" value={editF.progress} onChange={(e) => setEditF({ ...editF, progress: Number(e.target.value) })} /></div>
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
    </div>
  );
}

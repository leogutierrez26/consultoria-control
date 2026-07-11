import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../App';
import Updates from './Updates';

export default function Activities() {
  const { token, user } = useSession();
  const [params] = useSearchParams();
  const projectFilter = params.get('project');
  const [activities, setActivities] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [f, setF] = useState({ project_id: projectFilter || '', title: '', description: '', status: 'pendiente', billable: true, visible_to_client: true });

  async function load() {
    const q = projectFilter ? `?project_id=${projectFilter}` : '';
    const r: any = await api.get(`/activities${q}`, token);
    setActivities(r.activities || []);
    const p: any = await api.get('/projects', token);
    setProjects(p.projects || []);
  }
  useEffect(() => { load(); }, [token, projectFilter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/activities', { ...f, project_id: user?.role === 'admin' ? f.project_id : projectFilter }, token);
    setShow(false); setF({ project_id: projectFilter || '', title: '', description: '', status: 'pendiente', billable: true, visible_to_client: true });
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

  return (
    <div>
      <div className="row"><h2>Actividades</h2><span className="spacer" />
        {user?.role === 'admin' && <button onClick={() => setShow(!show)}>Nueva actividad</button>}</div>
      {show && (
        <form className="card" onSubmit={create}>
          <div className="grid cols-2">
            {user?.role === 'admin' && <div><label>Proyecto</label>
              <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })} required>
                <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>}
            <div><label>Título</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Descripción</label><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <label><input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} /> Facturable</label>
          <button style={{ marginTop: 12 }}>Crear</button>
        </form>
      )}
      <table className="card">
        <thead><tr><th>Proyecto</th><th>Título</th><th>Estado</th><th>Avance</th><th></th></tr></thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.id}>
              <td>{a.project_id?.slice(0, 8)}</td><td>{a.title}</td>
              <td><span className="badge">{a.status}</span></td><td>{a.progress}%</td>
              <td className="row">
                <button className="ghost" onClick={() => openDetail(a)}>Ver</button>
                {user?.role === 'admin' && <>
                  <button className="ghost" onClick={() => finalize(a.id, 'finalize')}>Finalizar</button>
                  <button className="ghost" onClick={() => finalize(a.id, 'reopen')}>Reabrir</button>
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
            <button className="ghost" onClick={() => setDetail(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

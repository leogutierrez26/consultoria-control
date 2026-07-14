import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

const STATES = ['pendiente', 'programada', 'en_ejecucion', 'esperando_info', 'bloqueada', 'en_revision', 'finalizada', 'cancelada'];

export default function Kanban() {
  const { token } = useSession();
  const [acts, setActs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');

  async function load() {
    const q = projectId ? `?project_id=${projectId}` : '';
    const [a, p]: any[] = await Promise.all([api.get(`/activities${q}`, token), api.get('/projects', token)]);
    setActs(a.activities || []);
    setProjects(p.projects || []);
  }
  useEffect(() => { load(); }, [token, projectId]);

  async function move(id: string, status: string) {
    await api.patch(`/activities/${id}`, { status }, token);
    setActs(acts.map((a) => a.id === id ? { ...a, status } : a));
  }

  const counts = useMemo(() => STATES.reduce((acc: Record<string, number>, state) => {
    acc[state] = acts.filter((a) => a.status === state).length;
    return acc;
  }, {}), [acts]);

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Flujo de trabajo</p><h2>Tablero de actividades</h2></div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Todos los proyectos</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="kanban-board">
        {STATES.map((state) => (
          <section key={state} className="kanban-column">
            <div className="section-title"><strong>{state.replace('_', ' ')}</strong><span>{counts[state] || 0}</span></div>
            <div className="kanban-list">
              {acts.filter((a) => a.status === state).map((a) => (
                <article key={a.id} className="kanban-card">
                  <b>{a.title}</b>
                  <small>{a.client_name || 'Sin cliente'} · {a.project_name || 'Sin proyecto'}</small>
                  <div className="row wrap">
                    <span className={`badge ${a.priority === 'alta' ? 'err' : a.priority === 'media' ? 'warn' : ''}`}>{a.priority}</span>
                    <span className="badge">{a.progress}%</span>
                  </div>
                  <select value={a.status} onChange={(e) => move(a.id, e.target.value)}>
                    {STATES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </article>
              ))}
              {counts[state] === 0 && <div className="empty">Sin actividades</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

function go(to: string) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function fmtDate(v?: string) {
  if (!v) return 'Sin fecha';
  return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function fmtDateTime(v?: string) {
  if (!v) return 'Sin fecha';
  return new Date(v).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function ClientDashboard() {
  const { token } = useSession();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    api.get('/config/dashboard', token).then(setD).catch(() => {});
  }, [token]);

  if (!d) return <div>Cargando…</div>;
  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Portal cliente</p>
          <h2>Resumen de mi consultoría</h2>
        </div>
        <div className="row wrap">
          <button onClick={() => go('/appointments')}>Ver citas</button>
          <button className="ghost" onClick={() => go('/projects')}>Ver proyectos</button>
        </div>
      </div>
      <div className="grid cols-3">
        <div className="stat"><div className="num">{d.projects?.length || 0}</div><div className="lbl">Proyectos activos</div></div>
        <div className="stat"><div className="num">{d.hours_consumed}</div><div className="lbl">Horas consumidas</div></div>
        <div className="stat"><div className="num">{d.upcoming_appointments?.length || 0}</div><div className="lbl">Próximas citas</div></div>
      </div>

      <div className="work-grid">
        <section className="card work-card primary">
          <div className="section-title">
            <strong>Actividades abiertas</strong>
            <span>{d.open_activities?.length || 0}</span>
          </div>
          <div className="work-list">
            {(d.open_activities || []).map((a: any) => (
              <button className="work-item" key={a.id} onClick={() => go('/activities')}>
                <span>
                  <b>{a.title}</b>
                  <small>{a.project_name} · {a.status}</small>
                </span>
                <span className={`badge ${a.priority === 'alta' ? 'err' : 'warn'}`}>{fmtDate(a.due_date)}</span>
              </button>
            ))}
            {(d.open_activities || []).length === 0 && <div className="empty">No hay actividades abiertas visibles.</div>}
          </div>
        </section>

        <section className="card work-card">
          <div className="section-title">
            <strong>Próximas citas</strong>
            <span>{d.upcoming_appointments?.length || 0}</span>
          </div>
          <div className="work-list">
            {(d.upcoming_appointments || []).map((a: any) => (
              <button className="work-item" key={a.id} onClick={() => go('/appointments')}>
                <span>
                  <b>{a.reason || a.modality}</b>
                  <small>{a.status} · {a.modality}</small>
                </span>
                <span className="badge ok">{fmtDateTime(a.start_time)}</span>
              </button>
            ))}
            {(d.upcoming_appointments || []).length === 0 && <div className="empty">No tienes citas programadas.</div>}
          </div>
        </section>
      </div>

      <div className="grid cols-2">
        <section className="card">
          <div className="section-title">
            <strong>Mis proyectos</strong>
            <span>{d.projects?.length || 0}</span>
          </div>
          <div className="project-list">
            {(d.projects || []).map((p: any) => (
              <button className="project-row" key={p.id} onClick={() => go('/projects')}>
                <span>
                  <b>{p.name}</b>
                  <small>{p.code || 'Proyecto'} · {p.status}</small>
                </span>
                <span className="progress-wrap"><i style={{ width: `${p.progress || 0}%` }} /></span>
                <span className="badge">{p.progress || 0}%</span>
              </button>
            ))}
            {(d.projects || []).length === 0 && <div className="empty">Aún no hay proyectos visibles.</div>}
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <strong>Últimas actualizaciones</strong>
            <span>{d.recent_updates?.length || 0}</span>
          </div>
          <div className="timeline">
            {(d.recent_updates || []).map((u: any) => (
              <button className="timeline-item" key={u.id} onClick={() => go('/activities')}>
                <span className="dot" />
                <span>
                  <b>{u.activity_title}</b>
                  <small>{u.project_name} · {fmtDateTime(u.created_at)}</small>
                  <em>{u.content}</em>
                </span>
              </button>
            ))}
            {(d.recent_updates || []).length === 0 && <div className="empty">Sin actualizaciones recientes.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

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

function dueClass(v?: string) {
  if (!v) return 'warn';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(v);
  due.setHours(0, 0, 0, 0);
  return due < today ? 'err' : 'warn';
}

export default function AdminDashboard() {
  const { token } = useSession();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    api.get('/config/dashboard', token).then(setD).catch(() => {});
  }, [token]);

  if (!d) return <div>Cargando…</div>;
  const cards = [
    { num: d.hours_today, lbl: 'Horas hoy' },
    { num: d.hours_week, lbl: 'Horas esta semana' },
    { num: d.billable_hours_month, lbl: 'Horas facturables (mes)' },
    { num: '$' + (d.billable_value_month || 0).toLocaleString('es-CO'), lbl: 'Valor facturable (mes)' },
    { num: d.active_projects, lbl: 'Proyectos activos' },
    { num: d.overdue_activities, lbl: 'Actividades vencidas' },
    { num: d.pending_appointments, lbl: 'Citas pendientes' },
    { num: d.active_timer ? 'Sí' : 'No', lbl: 'Cronómetro activo' }
  ];
  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Centro de trabajo</p>
          <h2>Prioridades de consultoría</h2>
        </div>
        <div className="row wrap">
          <button onClick={() => go('/activities')}>Nueva actividad</button>
          <button className="ghost" onClick={() => go('/hours')}>Registrar tiempo</button>
          <button className="ghost" onClick={() => go('/agenda')}>Agenda</button>
        </div>
      </div>
      <div className="grid cols-4">
        {cards.map((c) => (
          <div className="stat" key={c.lbl}>
            <div className="num">{c.num}</div>
            <div className="lbl">{c.lbl}</div>
          </div>
        ))}
      </div>

      <div className="work-grid">
        <section className="card work-card primary">
          <div className="section-title">
            <strong>Por atender</strong>
            <span>{d.due_activities?.length || 0} actividades</span>
          </div>
          <div className="work-list">
            {(d.due_activities || []).map((a: any) => (
              <button className="work-item" key={a.id} onClick={() => go(`/activities`)}>
                <span>
                  <b>{a.title}</b>
                  <small>{a.client_name || 'Interna'} · {a.project_name}</small>
                </span>
                <span className={`badge ${dueClass(a.due_date)}`}>{fmtDate(a.due_date)}</span>
              </button>
            ))}
            {(d.due_activities || []).length === 0 && <div className="empty">No hay actividades vencidas o próximas.</div>}
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
                  <b>{a.client_name}</b>
                  <small>{a.reason || a.modality}</small>
                </span>
                <span className="badge ok">{fmtDateTime(a.start_time)}</span>
              </button>
            ))}
            {(d.upcoming_appointments || []).length === 0 && <div className="empty">No tienes citas próximas.</div>}
          </div>
        </section>

        <section className="card work-card">
          <div className="section-title">
            <strong>Bloqueos</strong>
            <span>{d.blocked_activities?.length || 0}</span>
          </div>
          <div className="work-list">
            {(d.blocked_activities || []).map((a: any) => (
              <button className="work-item" key={a.id} onClick={() => go('/activities')}>
                <span>
                  <b>{a.title}</b>
                  <small>{a.client_name || 'Interna'} · {a.project_name}</small>
                </span>
                <span className="badge warn">{a.status}</span>
              </button>
            ))}
            {(d.blocked_activities || []).length === 0 && <div className="empty">Nada bloqueado por ahora.</div>}
          </div>
        </section>

        <section className="card work-card">
          <div className="section-title">
            <strong>Proyectos en riesgo</strong>
            <span>{d.project_risks?.length || 0}</span>
          </div>
          <div className="work-list">
            {(d.project_risks || []).map((p: any) => {
              const used = Number(p.consumed_minutes || 0) / 60;
              const budget = Number(p.hour_budget || 0);
              return (
                <button className="work-item" key={p.id} onClick={() => go('/projects')}>
                  <span>
                    <b>{p.name}</b>
                    <small>{p.client_name} · {p.status}</small>
                  </span>
                  <span className="badge err">{budget ? `${used.toFixed(1)}/${budget} h` : 'Suspendido'}</span>
                </button>
              );
            })}
            {(d.project_risks || []).length === 0 && <div className="empty">Sin alertas de presupuesto o suspensión.</div>}
          </div>
        </section>
      </div>

      <div className="card">
        <strong>Acciones rápidas</strong>
        <div className="quick-actions">
          <button className="ghost" onClick={() => go('/clients')}>Crear cliente</button>
          <button className="ghost" onClick={() => go('/projects')}>Crear proyecto</button>
          <button className="ghost" onClick={() => go('/activities')}>Crear actividad</button>
          <button className="ghost" onClick={() => go('/hours')}>Registrar tiempo</button>
          <button className="ghost" onClick={() => go('/agenda')}>Publicar disponibilidad</button>
        </div>
      </div>
    </div>
  );
}

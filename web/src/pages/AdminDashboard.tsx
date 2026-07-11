import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

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
    { num: '$' + (d.billable_value_month || 0), lbl: 'Valor facturable (mes)' },
    { num: d.active_projects, lbl: 'Proyectos activos' },
    { num: d.overdue_activities, lbl: 'Actividades vencidas' },
    { num: d.pending_appointments, lbl: 'Citas pendientes' },
    { num: d.active_timer ? 'Sí' : 'No', lbl: 'Cronómetro activo' }
  ];
  return (
    <div>
      <h2>Panel del administrador</h2>
      <div className="grid cols-4">
        {cards.map((c) => (
          <div className="stat" key={c.lbl}>
            <div className="num">{c.num}</div>
            <div className="lbl">{c.lbl}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <strong>Acciones rápidas</strong>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <a href="#/clients"><button className="ghost">Crear cliente</button></a>
          <a href="#/projects"><button className="ghost">Crear proyecto</button></a>
          <a href="#/activities"><button className="ghost">Crear actividad</button></a>
          <a href="#/hours"><button className="ghost">Registrar tiempo</button></a>
          <a href="#/agenda"><button className="ghost">Publicar disponibilidad</button></a>
        </div>
      </div>
    </div>
  );
}

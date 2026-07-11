import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function ClientDashboard() {
  const { token } = useSession();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    api.get('/config/dashboard', token).then(setD).catch(() => {});
  }, [token]);

  if (!d) return <div>Cargando…</div>;
  return (
    <div>
      <h2>Mi panel</h2>
      <div className="grid cols-3">
        <div className="stat"><div className="num">{d.projects?.length || 0}</div><div className="lbl">Proyectos activos</div></div>
        <div className="stat"><div className="num">{d.hours_consumed}</div><div className="lbl">Horas consumidas</div></div>
        <div className="stat"><div className="num">{d.upcoming_appointments?.length || 0}</div><div className="lbl">Próximas citas</div></div>
      </div>
      <div className="card">
        <strong>Próximas citas</strong>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Inicio</th><th>Estado</th><th>Modalidad</th></tr></thead>
          <tbody>
            {(d.upcoming_appointments || []).map((a: any) => (
              <tr key={a.id}><td>{new Date(a.start_time).toLocaleString()}</td><td>{a.status}</td><td>{a.modality}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <strong>Mis proyectos</strong>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Nombre</th><th>Estado</th><th>Avance</th></tr></thead>
          <tbody>
            {(d.projects || []).map((p: any) => (
              <tr key={p.id}><td>{p.name}</td><td>{p.status}</td><td>{p.progress}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

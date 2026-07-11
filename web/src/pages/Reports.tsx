import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Reports() {
  const { token, user } = useSession();
  const [hours, setHours] = useState<any>(null);
  const [byProject, setByProject] = useState<any[]>([]);
  const [byClient, setByClient] = useState<any[]>([]);
  const [range, setRange] = useState({ from: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) });

  async function load() {
    const r: any = await api.get(`/reports/hours?from=${range.from}&to=${range.to}`, token);
    setHours(r.summary);
    const bp: any = await api.get('/reports/by-project', token); setByProject(bp.report || []);
    if (user?.role === 'admin') { const bc: any = await api.get('/reports/by-client', token); setByClient(bc.report || []); }
  }
  useEffect(() => { load(); }, [token]);

  return (
    <div>
      <h2>Reportes</h2>
      <div className="row">
        <div><label>Desde</label><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
        <div><label>Hasta</label><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        <button onClick={load}>Generar</button>
        <a href={`/api/export/hours/csv?from=${range.from}&to=${range.to}`}><button className="ghost" type="button">CSV</button></a>
        <a href={`/api/export/hours/excel?from=${range.from}&to=${range.to}`}><button className="ghost" type="button">Excel</button></a>
        <a href={`/api/export/hours/pdf?from=${range.from}&to=${range.to}`}><button className="ghost" type="button">PDF</button></a>
      </div>
      {hours && (
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          <div className="stat"><div className="num">{hours.total_hours}</div><div className="lbl">Horas totales</div></div>
          <div className="stat"><div className="num">{hours.billable_hours}</div><div className="lbl">Horas facturables</div></div>
          <div className="stat"><div className="num">{hours.entries_count}</div><div className="lbl">Registros</div></div>
        </div>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <strong>Por proyecto</strong>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Proyecto</th><th>Horas ejec.</th><th>Horas fact.</th><th>Estado</th></tr></thead>
          <tbody>{byProject.map((p) => <tr key={p.id}><td>{p.name}</td><td>{(p.executed_min / 60).toFixed(1)}</td><td>{(p.billable_min / 60).toFixed(1)}</td><td>{p.status}</td></tr>)}</tbody>
        </table>
      </div>
      {user?.role === 'admin' && byClient.length > 0 && (
        <div className="card">
          <strong>Por cliente</strong>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Cliente</th><th>Horas</th><th>Horas fact.</th><th>Proyectos</th></tr></thead>
            <tbody>{byClient.map((c) => <tr key={c.id}><td>{c.legal_name}</td><td>{(c.total_min / 60).toFixed(1)}</td><td>{(c.billable_min / 60).toFixed(1)}</td><td>{c.projects}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

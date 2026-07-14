import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

type HoursSummary = {
  total_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  billable_percent: number;
  entries_count: number;
};

type ReportEntry = {
  id: string;
  work_date: string;
  client_name: string;
  project_name: string;
  description?: string;
  duration_minutes: number;
  billable: boolean;
};

type ProjectReport = {
  id: string;
  code?: string;
  name: string;
  client_name?: string;
  executed_min: number;
  billable_min: number;
  hour_budget?: number | null;
  status: string;
};

type ClientReport = {
  id: string;
  legal_name: string;
  total_min: number;
  billable_min: number;
  projects: number;
  entries: number;
};

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function hoursFromMinutes(minutes: number | string | null | undefined) {
  return (Number(minutes || 0) / 60).toFixed(1);
}

function shortDate(value: string) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export default function Reports() {
  const { token, user } = useSession();
  const [summary, setSummary] = useState<HoursSummary | null>(null);
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [byProject, setByProject] = useState<ProjectReport[]>([]);
  const [byClient, setByClient] = useState<ClientReport[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [range, setRange] = useState({ from: isoDate(monthStart), to: isoDate(today) });
  const [clientId, setClientId] = useState('');
  const [billable, setBillable] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId]
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    if (user?.role === 'admin' && clientId) params.set('client_id', clientId);
    if (billable) params.set('billable', billable);
    return params.toString();
  }, [range, user?.role, clientId, billable]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const qs = queryString ? `?${queryString}` : '';
      const r: any = await api.get(`/reports/hours${qs}`, token);
      setSummary(r.summary);
      setEntries(r.entries || []);

      const bp: any = await api.get(`/reports/by-project${qs}`, token);
      setByProject(bp.report || []);

      if (user?.role === 'admin') {
        const bc: any = await api.get(`/reports/by-client${qs}`, token);
        setByClient(bc.report || []);
        const cl: any = await api.get('/clients', token);
        setClients(cl.clients || []);
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el reporte.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function download(url: string, filename: string, type: string) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      alert('No se pudo exportar (HTTP ' + res.status + ')');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([blob], { type }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function exportHours(fmt: 'csv' | 'excel' | 'pdf') {
    const ep = fmt === 'excel' ? 'excel' : fmt;
    const suffix = queryString ? `?${queryString}` : '';
    const names: Record<string, string> = {
      csv: 'detalle_horas.csv',
      excel: 'detalle_horas.xlsx',
      pdf: 'detalle_horas.pdf'
    };
    const types: Record<string, string> = {
      csv: 'text/csv',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf'
    };
    await download(`/api/export/hours/${ep}${suffix}`, names[fmt], types[fmt]);
  }

  async function exportServices() {
    const params = new URLSearchParams(queryString);
    if (!params.has('billable')) params.set('billable', 'true');
    const suffix = `?${params.toString()}`;
    await download(
      `/api/export/activities/services-excel${suffix}`,
      'cuenta_servicios_actividades.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }

  const totalEstimated = byProject.reduce((sum, p) => sum + Number(p.hour_budget || 0), 0);
  const totalExecuted = byProject.reduce((sum, p) => sum + Number(p.executed_min || 0), 0) / 60;
  const periodLabel = `${shortDate(range.from)} - ${shortDate(range.to)}`;

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Reportes</p>
          <h2>Actividad, horas y servicios</h2>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'Generando...' : 'Generar reporte'}</button>
      </div>

      <div className="report-layout">
        <section className="card report-filters">
          <strong>Filtros del reporte</strong>
          <div className="grid cols-4">
            <div><label>Desde</label><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
            <div><label>Hasta</label><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
            {user?.role === 'admin' && (
              <div><label>Cliente</label><select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Todos los clientes</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>
            )}
            <div><label>Facturación</label><select value={billable} onChange={(e) => setBillable(e.target.value)}>
              <option value="">Todas las horas</option>
              <option value="true">Sólo facturables</option>
              <option value="false">Sólo no facturables</option>
            </select></div>
          </div>
          <div className="report-context">
            <span>{periodLabel}</span>
            <span>{selectedClient?.legal_name || (user?.role === 'admin' ? 'Todos los clientes' : 'Mi organización')}</span>
            <span>{billable === 'true' ? 'Facturables' : billable === 'false' ? 'No facturables' : 'Todas'}</span>
          </div>
          {error && <div className="msg err">{error}</div>}
        </section>

        <section className="card export-card">
          <strong>Exportar</strong>
          <div className="export-actions">
            <button className="ghost" type="button" onClick={() => exportHours('excel')}>Detalle Excel</button>
            <button className="ghost" type="button" onClick={() => exportHours('csv')}>Detalle CSV</button>
            <button className="ghost" type="button" onClick={() => exportHours('pdf')}>Resumen PDF</button>
            <button type="button" onClick={exportServices}>Cuenta servicios</button>
          </div>
        </section>
      </div>

      {summary && (
        <div className="grid cols-4 report-stats">
          <div className="stat"><div className="num">{summary.total_hours}</div><div className="lbl">Horas del periodo</div></div>
          <div className="stat"><div className="num">{summary.billable_hours}</div><div className="lbl">Horas facturables</div></div>
          <div className="stat"><div className="num">{summary.non_billable_hours}</div><div className="lbl">Horas no facturables</div></div>
          <div className="stat"><div className="num">{summary.billable_percent}%</div><div className="lbl">{summary.entries_count} registros</div></div>
        </div>
      )}

      <div className="grid cols-2 report-panels">
        <section className="card">
          <div className="section-title">
            <strong>Proyectos en el periodo</strong>
            <span>{totalExecuted.toFixed(1)} h ejecutadas {totalEstimated ? `de ${totalEstimated.toFixed(1)} h estimadas` : ''}</span>
          </div>
          <table>
            <thead><tr><th>Proyecto</th><th>Cliente</th><th>Horas</th><th>Fact.</th><th>Estado</th></tr></thead>
            <tbody>
              {byProject.length === 0 && <tr><td colSpan={5}>No hay proyectos para estos filtros.</td></tr>}
              {byProject.map((p) => (
                <tr key={p.id}>
                  <td>{p.code ? `${p.code} - ${p.name}` : p.name}</td>
                  <td>{p.client_name || 'N/A'}</td>
                  <td>{hoursFromMinutes(p.executed_min)}</td>
                  <td>{hoursFromMinutes(p.billable_min)}</td>
                  <td><span className="badge">{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {user?.role === 'admin' && (
          <section className="card">
            <div className="section-title">
              <strong>Clientes en el periodo</strong>
              <span>{byClient.length} registros de cliente</span>
            </div>
            <table>
              <thead><tr><th>Cliente</th><th>Horas</th><th>Fact.</th><th>Proyectos</th><th>Entradas</th></tr></thead>
              <tbody>
                {byClient.length === 0 && <tr><td colSpan={5}>No hay clientes para estos filtros.</td></tr>}
                {byClient.map((c) => (
                  <tr key={c.id}>
                    <td>{c.legal_name}</td>
                    <td>{hoursFromMinutes(c.total_min)}</td>
                    <td>{hoursFromMinutes(c.billable_min)}</td>
                    <td>{c.projects}</td>
                    <td>{c.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      <section className="card">
        <div className="section-title">
          <strong>Detalle de horas</strong>
          <span>{entries.length} entradas</span>
        </div>
        <table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Proyecto</th><th>Descripción</th><th>Horas</th><th>Tipo</th></tr></thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={6}>No hay horas registradas para estos filtros.</td></tr>}
            {entries.slice(0, 25).map((entry) => (
              <tr key={entry.id}>
                <td>{shortDate(entry.work_date)}</td>
                <td>{entry.client_name}</td>
                <td>{entry.project_name}</td>
                <td>{entry.description || 'Sin descripción'}</td>
                <td>{hoursFromMinutes(entry.duration_minutes)}</td>
                <td><span className={entry.billable ? 'badge ok' : 'badge warn'}>{entry.billable ? 'Facturable' : 'No facturable'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length > 25 && <p className="table-note">Se muestran 25 entradas. Exporta el detalle para ver el listado completo.</p>}
      </section>
    </div>
  );
}

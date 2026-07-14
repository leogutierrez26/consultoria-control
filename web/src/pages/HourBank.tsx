import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

const today = todayISO();

function dateOnly(value?: string) {
  return value ? value.slice(0, 10) : '';
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

const emptyForm = {
  client_id: '',
  name: 'Bolsa mensual',
  hours_included: 0,
  monthly_fee: 0,
  cost_center: 'Bolsa de horas mensual',
  billing_day: 1,
  start_date: today,
  end_date: '',
  status: 'activa',
  notes: ''
};

export default function HourBank() {
  const { token } = useSession();
  const [clients, setClients] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [msg, setMsg] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);

  const filtered = useMemo(
    () => sel ? subscriptions.filter((s) => s.client_id === sel) : subscriptions,
    [subscriptions, sel]
  );
  const active = filtered.filter((s) => s.status === 'activa');
  const totalMonthly = active.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
  const totalHours = active.reduce((sum, s) => sum + Number(s.hours_included || 0), 0);
  const totalConsumed = active.reduce((sum, s) => sum + Number(s.consumed_hours || 0), 0);

  async function load(clientId = sel) {
    const params = clientId ? `?client_id=${clientId}` : '';
    try {
      setLoadingClients(true);
      const c: any = await api.get('/clients', token);
      const loadedClients = c.clients || [];
      setClients(loadedClients);
      if (!form.client_id && loadedClients.length > 0) {
        setForm((current) => ({ ...current, client_id: sel || loadedClients[0].id }));
      }
    } catch (err: any) {
      setMsg(err.message || 'No se pudieron cargar los clientes.');
    } finally {
      setLoadingClients(false);
    }
    try {
      const h: any = await api.get(`/hourbank${params}`, token);
      setSubscriptions(h.subscriptions || []);
    } catch (err: any) {
      setSubscriptions([]);
      setMsg(err.message || 'No se pudieron cargar las bolsas de horas.');
    }
  }
  useEffect(() => { load(); }, [token]);
  useEffect(() => {
    if (!showForm || form.client_id || clients.length === 0) return;
    setForm((current) => ({ ...current, client_id: sel || clients[0].id }));
  }, [clients, form.client_id, sel, showForm]);

  function startCreate() {
    setMsg('');
    setEditing(null);
    setShowForm(true);
    setForm({ ...emptyForm, client_id: sel || clients[0]?.id || '' });
  }

  function startEdit(s: any) {
    setMsg('');
    setEditing(s);
    setShowForm(true);
    setForm({
      client_id: s.client_id,
      name: s.name || 'Bolsa mensual',
      hours_included: Number(s.hours_included || 0),
      monthly_fee: Number(s.monthly_fee || 0),
      cost_center: s.cost_center || 'Bolsa de horas mensual',
      billing_day: Number(s.billing_day || 1),
      start_date: dateOnly(s.start_date) || today,
      end_date: dateOnly(s.end_date) || '',
      status: s.status || 'activa',
      notes: s.notes || ''
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const payload = {
      ...form,
      hours_included: Number(form.hours_included),
      monthly_fee: Number(form.monthly_fee),
      billing_day: Number(form.billing_day),
      end_date: form.end_date || null
    };
    if (!payload.client_id) { setMsg('Selecciona un cliente para crear la bolsa.'); return; }
    if (!payload.start_date) { setMsg('Selecciona la fecha de inicio de la bolsa.'); return; }
    try {
      if (editing) {
        await api.patch(`/hourbank/subscriptions/${editing.id}`, payload, token);
        setMsg('Suscripción actualizada.');
      } else {
        await api.post('/hourbank', payload, token);
        setMsg('Suscripción creada.');
      }
      setEditing(null);
      setShowForm(false);
      setForm({ ...emptyForm, client_id: sel || clients[0]?.id || '' });
      await load(sel);
    } catch (err: any) {
      setMsg(err.message || 'No se pudo guardar la suscripción.');
    }
  }

  async function remove(s: any) {
    if (!confirm(`¿Eliminar la suscripción "${s.name}"? Se archivará para conservar trazabilidad.`)) return;
    await api.post(`/hourbank/subscriptions/${s.id}/delete`, {}, token);
    setMsg('Suscripción eliminada de la vista operativa.');
    await load(sel);
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Contratos recurrentes</p><h2>Bolsas de horas mensuales</h2></div>
        <button onClick={startCreate} disabled={loadingClients || clients.length === 0}>Nueva bolsa</button>
      </div>

      <section className="card">
        <strong>Cliente</strong>
        <div className="row wrap">
          <select value={sel} onChange={(e) => { setSel(e.target.value); load(e.target.value); }} disabled={loadingClients}>
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </select>
          <button className="ghost" onClick={() => load(sel)}>Actualizar</button>
        </div>
        {loadingClients && <p className="muted">Cargando clientes...</p>}
        {!loadingClients && clients.length === 0 && <div className="msg err">No hay clientes disponibles. Crea primero un cliente para poder registrar una bolsa de horas.</div>}
      </section>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="num">{active.length}</div><div className="lbl">Contratos activos</div></div>
        <div className="stat"><div className="num">{totalHours}</div><div className="lbl">Horas mensuales incluidas</div></div>
        <div className="stat"><div className="num">{totalConsumed.toFixed(1)}</div><div className="lbl">Horas consumidas</div></div>
        <div className="stat"><div className="num">{money(totalMonthly)}</div><div className="lbl">Ingreso recurrente mensual</div></div>
      </div>

      {msg && <div className={`msg ${msg.includes('No se') || msg.includes('Selecciona') ? 'err' : 'ok'}`}>{msg}</div>}

      {showForm && <form className="card" onSubmit={save}>
        <div className="section-title">
          <strong>{editing ? 'Modificar bolsa' : 'Crear bolsa'}</strong>
          <button type="button" className="ghost" onClick={() => { setEditing(null); setShowForm(false); setForm({ ...emptyForm, client_id: sel || clients[0]?.id || '' }); }}>Cancelar</button>
        </div>
        <div className="grid cols-4">
          <div><label>Cliente</label><select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required disabled={loadingClients || clients.length === 0}>
            <option value="">{loadingClients ? 'Cargando clientes...' : 'Selecciona cliente'}</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </select></div>
          <div><label>Nombre del contrato</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label>Horas incluidas/mes</label><input type="number" min={0} value={form.hours_included} onChange={(e) => setForm({ ...form, hours_included: Number(e.target.value) })} /></div>
          <div><label>Tarifa fija mensual</label><input type="number" min={0} value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} /></div>
          <div><label>Centro de costos</label><input value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} /></div>
          <div><label>Día de facturación</label><input type="number" min={1} max={31} value={form.billing_day} onChange={(e) => setForm({ ...form, billing_day: Number(e.target.value) })} /></div>
          <div><label>Inicio</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></div>
          <div><label>Fin</label><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          <div><label>Estado</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="activa">Activa</option>
            <option value="pausada">Pausada</option>
            <option value="cancelada">Cancelada</option>
          </select></div>
          <div style={{ gridColumn: '1 / -1' }}><label>Notas</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <button style={{ marginTop: 12 }}>{editing ? 'Guardar cambios' : 'Crear bolsa'}</button>
      </form>}

      <section className="card">
        <div className="section-title"><strong>Contratos de bolsa</strong><span>{filtered.length} registros</span></div>
        <table>
          <thead><tr><th>Cliente</th><th>Contrato</th><th>Horas/mes</th><th>Consumidas</th><th>Tarifa</th><th>Centro costos</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9}>No hay bolsas de horas creadas.</td></tr>}
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.client_name}</td>
                <td>{s.name}</td>
                <td>{Number(s.hours_included || 0)}</td>
                <td>{s.consumed_hours} h ({s.pct_consumed}%)</td>
                <td>{money(s.monthly_fee)}</td>
                <td>{s.cost_center}</td>
                <td>{dateOnly(s.start_date)} {s.end_date ? `a ${dateOnly(s.end_date)}` : 'en adelante'}</td>
                <td><span className={`badge ${s.status === 'activa' ? 'ok' : s.status === 'pausada' ? 'warn' : 'err'}`}>{s.status}</span></td>
                <td className="actions-cell">
                  <button className="ghost" onClick={() => startEdit(s)}>Editar</button>
                  <button className="danger" onClick={() => remove(s)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

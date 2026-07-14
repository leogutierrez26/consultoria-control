import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

function dateOnly(value?: string) {
  return value ? value.slice(0, 10) : '';
}

export default function HourBank() {
  const { token } = useSession();
  const [clients, setClients] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState({ enabled: false, contracted: 0, monthly_fee: 0, start: '', end: '' });

  async function load() {
    const r: any = await api.get('/clients', token);
    setClients(r.clients || []);
    if (!sel && r.clients?.[0]) setSel(r.clients[0].id);
  }
  useEffect(() => { load(); }, [token]);

  async function view(id = sel) {
    if (!id) return;
    const r: any = await api.get(`/hourbank/${id}`, token);
    setData(r);
    setForm({
      enabled: !!r.enabled,
      contracted: Number(r.contracted_hours || 0),
      monthly_fee: Number(r.monthly_fee || 0),
      start: dateOnly(r.start),
      end: dateOnly(r.end)
    });
  }
  useEffect(() => { if (sel) view(sel); }, [sel]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await api.put(`/hourbank/${sel}`, {
      enabled: form.enabled,
      contracted: Number(form.contracted),
      monthly_fee: Number(form.monthly_fee),
      start: form.start || null,
      end: form.end || null
    }, token);
    await view();
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Control financiero</p><h2>Bolsa de horas</h2></div>
        <button onClick={() => view()}>Actualizar</button>
      </div>
      <section className="card">
        <strong>Cliente</strong>
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </select>
      </section>
      {data && (
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <div className="stat"><div className="num">{data.contracted_hours}</div><div className="lbl">Contratadas</div></div>
          <div className="stat"><div className="num">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(data.monthly_fee || 0))}</div><div className="lbl">Tarifa fija mensual</div></div>
          <div className="stat"><div className="num">{data.consumed_hours}</div><div className="lbl">Consumidas del periodo</div></div>
          <div className="stat"><div className="num">{data.available_hours}</div><div className="lbl">Disponibles</div></div>
        </div>
      )}
      <form className="card" onSubmit={save}>
        <strong>Configuración</strong>
        <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Habilitar bolsa para este cliente</label>
        <div className="grid cols-4" style={{ marginTop: 8 }}>
          <div><label>Horas contratadas</label><input type="number" min={0} value={form.contracted} onChange={(e) => setForm({ ...form, contracted: Number(e.target.value) })} /></div>
          <div><label>Tarifa fija mensual</label><input type="number" min={0} value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} /></div>
          <div><label>Inicio de vigencia</label><input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          <div><label>Fin de vigencia</label><input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
        </div>
        <button style={{ marginTop: 12 }}>Guardar configuración</button>
      </form>
    </div>
  );
}

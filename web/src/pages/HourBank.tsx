import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function HourBank() {
  const { token } = useSession();
  const [clients, setClients] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState({ enabled: false, contracted: 0, start: '', end: '' });

  async function load() { const r: any = await api.get('/clients', token); setClients(r.clients || []); if (!sel && r.clients?.[0]) setSel(r.clients[0].id); }
  useEffect(() => { load(); }, [token]);

  async function view() {
    if (!sel) return;
    const r: any = await api.get(`/hourbank/${sel}`, token); setData(r);
  }
  useEffect(() => { if (sel) view(); }, [sel]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await api.put(`/hourbank/${sel}`, { enabled: form.enabled, contracted: Number(form.contracted), start: form.start || null, end: form.end || null }, token);
    await view();
  }

  return (
    <div>
      <h2>Bolsa de horas</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </select>
        <button onClick={view}>Consultar</button>
      </div>
      {data && (
        <div className="grid cols-4" style={{ marginBottom: 12 }}>
          <div className="stat"><div className="num">{data.contracted_hours}</div><div className="lbl">Contratadas</div></div>
          <div className="stat"><div className="num">{data.consumed_hours}</div><div className="lbl">Consumidas</div></div>
          <div className="stat"><div className="num">{data.available_hours}</div><div className="lbl">Disponibles</div></div>
          <div className="stat"><div className="num">{data.pct_consumed}%</div><div className="lbl">Consumido</div></div>
        </div>
      )}
      <form className="card" onSubmit={save}>
        <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Habilitar bolsa</label>
        <div className="grid cols-3" style={{ marginTop: 8 }}>
          <div><label>Horas contratadas</label><input type="number" value={form.contracted} onChange={(e) => setForm({ ...form, contracted: Number(e.target.value) })} /></div>
          <div><label>Inicio</label><input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          <div><label>Fin</label><input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
        </div>
        <button style={{ marginTop: 12 }}>Guardar</button>
      </form>
    </div>
  );
}

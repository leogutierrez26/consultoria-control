import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Clients() {
  const { token } = useSession();
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ legal_name: '', email: '', default_rate: 0, client_type: 'juridica', contact_name: '' });
  const [msg, setMsg] = useState<string>('');

  async function load() {
    const r: any = await api.get('/clients', token);
    setClients(r.clients || []);
  }
  useEffect(() => { load(); }, [token]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    try {
      await api.post('/clients', { ...f, default_rate: Number(f.default_rate) }, token);
      setShow(false); setF({ legal_name: '', email: '', default_rate: 0, client_type: 'juridica', contact_name: '' });
      await load();
    } catch (err: any) { setMsg(err.message); }
  }

  return (
    <div>
      <div className="row"><h2>Clientes</h2><span className="spacer" /><button onClick={() => setShow(!show)}>Nuevo cliente</button></div>
      {show && (
        <form className="card" onSubmit={create}>
          <div className="grid cols-2">
            <div><label>Razón social</label><input value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} required /></div>
            <div><label>Tipo</label><select value={f.client_type} onChange={(e) => setF({ ...f, client_type: e.target.value })}><option value="juridica">Jurídica</option><option value="natural">Natural</option></select></div>
            <div><label>Correo</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><label>Tarifa predeterminada</label><input type="number" value={f.default_rate} onChange={(e) => setF({ ...f, default_rate: Number(e.target.value) })} /></div>
            <div><label>Contacto</label><input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></div>
          </div>
          {msg && <div className="msg err">{msg}</div>}
          <button style={{ marginTop: 12 }}>Crear</button>
        </form>
      )}
      <table className="card">
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Correo</th><th>Proyectos</th><th>Estado</th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.legal_name}</td><td>{c.client_type}</td><td>{c.email || '—'}</td>
              <td>{c.project_count}</td>
              <td><span className={`badge ${c.status === 'active' ? 'ok' : 'err'}`}>{c.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

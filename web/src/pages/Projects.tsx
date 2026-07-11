import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Projects() {
  const { token, user } = useSession();
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ client_id: '', code: '', name: '', description: '', status: 'borrador', visible_to_client: true });

  async function load() {
    const r: any = await api.get('/projects', token);
    setProjects(r.projects || []);
    const c: any = await api.get('/clients', token);
    setClients(c.clients || []);
  }
  useEffect(() => { load(); }, [token]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/projects', { ...f, client_id: user?.role === 'admin' ? f.client_id : undefined }, token);
    setShow(false);
    setF({ client_id: '', code: '', name: '', description: '', status: 'borrador', visible_to_client: true });
    await load();
  }

  return (
    <div>
      <div className="row"><h2>Proyectos</h2><span className="spacer" />
        {user?.role === 'admin' && <button onClick={() => setShow(!show)}>Nuevo proyecto</button>}</div>
      {show && (
        <form className="card" onSubmit={create}>
          <div className="grid cols-2">
            <div><label>Cliente</label>
              <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required>
                <option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>
            <div><label>Código</label><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></div>
            <div><label>Nombre</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div><label>Estado</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {['borrador','pendiente','en_ejecucion','suspendido','finalizado','cancelado','archivado'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Descripción</label><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <label><input type="checkbox" checked={f.visible_to_client} onChange={(e) => setF({ ...f, visible_to_client: e.target.checked })} /> Visible para el cliente</label>
          <button style={{ marginTop: 12 }}>Crear</button>
        </form>
      )}
      <table className="card">
        <thead><tr><th>Cliente</th><th>Código</th><th>Nombre</th><th>Estado</th><th>Avance</th><th></th></tr></thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>{p.client_name}</td><td>{p.code}</td><td>{p.name}</td>
              <td><span className="badge">{p.status}</span></td><td>{p.progress}%</td>
              <td><a href={`#/activities?project=${p.id}`}><button className="ghost">Actividades</button></a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

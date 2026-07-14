import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Clients() {
  const { token } = useSession();
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [f, setF] = useState({ legal_name: '', email: '', default_rate: 0, client_type: 'juridica', contact_name: '' });
  const [editF, setEditF] = useState({
    legal_name: '',
    client_type: 'juridica',
    email: '',
    billing_email: '',
    contact_name: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    default_rate: 0,
    status: 'active',
    internal_notes: ''
  });
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

  function startEdit(c: any) {
    setMsg('');
    setEditing(c);
    setEditF({
      legal_name: c.legal_name || '',
      client_type: c.client_type || 'juridica',
      email: c.email || '',
      billing_email: c.billing_email || '',
      contact_name: c.contact_name || '',
      phone: c.phone || '',
      address: c.address || '',
      city: c.city || '',
      country: c.country || '',
      default_rate: Number(c.default_rate || 0),
      status: c.status || 'active',
      internal_notes: c.internal_notes || ''
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    try {
      await api.patch(`/clients/${editing.id}`, {
        ...editF,
        default_rate: Number(editF.default_rate)
      }, token);
      setEditing(null);
      await load();
    } catch (err: any) { setMsg(err.message); }
  }

  async function removeClient(c: any) {
    if (!window.confirm(`¿Eliminar/desactivar el cliente "${c.legal_name}"?`)) return;
    setMsg('');
    try {
      await api.post(`/clients/${c.id}/deactivate`, {}, token);
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
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Correo</th><th>Proyectos</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.legal_name}</td><td>{c.client_type}</td><td>{c.email || '—'}</td>
              <td>{c.project_count}</td>
              <td><span className={`badge ${c.status === 'active' ? 'ok' : 'err'}`}>{c.status}</span></td>
              <td className="row">
                <button className="ghost" onClick={() => startEdit(c)}>Editar</button>
                <button className="danger" onClick={() => removeClient(c)} disabled={c.status === 'inactive'}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <form className="modal wide" onSubmit={saveEdit} onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2>Editar cliente</h2>
              <span className="spacer" />
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cerrar</button>
            </div>
            <div className="grid cols-2">
              <div><label>Razón social</label><input value={editF.legal_name} onChange={(e) => setEditF({ ...editF, legal_name: e.target.value })} required /></div>
              <div><label>Tipo</label><select value={editF.client_type} onChange={(e) => setEditF({ ...editF, client_type: e.target.value })}><option value="juridica">Jurídica</option><option value="natural">Natural</option></select></div>
              <div><label>Correo principal</label><input type="email" value={editF.email} onChange={(e) => setEditF({ ...editF, email: e.target.value })} /></div>
              <div><label>Correo facturación</label><input type="email" value={editF.billing_email} onChange={(e) => setEditF({ ...editF, billing_email: e.target.value })} /></div>
              <div><label>Contacto</label><input value={editF.contact_name} onChange={(e) => setEditF({ ...editF, contact_name: e.target.value })} /></div>
              <div><label>Teléfono</label><input value={editF.phone} onChange={(e) => setEditF({ ...editF, phone: e.target.value })} /></div>
              <div><label>Ciudad</label><input value={editF.city} onChange={(e) => setEditF({ ...editF, city: e.target.value })} /></div>
              <div><label>País</label><input value={editF.country} onChange={(e) => setEditF({ ...editF, country: e.target.value })} /></div>
              <div><label>Tarifa predeterminada</label><input type="number" value={editF.default_rate} onChange={(e) => setEditF({ ...editF, default_rate: Number(e.target.value) })} /></div>
              <div><label>Estado</label><select value={editF.status} onChange={(e) => setEditF({ ...editF, status: e.target.value })}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></div>
              <div style={{ gridColumn: '1 / -1' }}><label>Dirección</label><input value={editF.address} onChange={(e) => setEditF({ ...editF, address: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label>Notas internas</label><textarea value={editF.internal_notes} onChange={(e) => setEditF({ ...editF, internal_notes: e.target.value })} /></div>
            </div>
            {msg && <div className="msg err">{msg}</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button>Guardar cambios</button>
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

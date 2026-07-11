import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Notifications() {
  const { token } = useSession();
  const [items, setItems] = useState<any[]>([]);
  async function load() { const r: any = await api.get('/notifications', token); setItems(r.notifications || []); }
  useEffect(() => { load(); }, [token]);

  async function markRead(id: string) {
    await api.post(`/notifications/${id}/read`, {}, token);
    setItems(items.map((n) => n.id === id ? { ...n, read_status: 'leida' } : n));
  }
  return (
    <div>
      <h2>Notificaciones</h2>
      {items.length === 0 && <p className="msg">Sin notificaciones.</p>}
      {items.map((n) => (
        <div key={n.id} className="card" style={{ marginBottom: 8, opacity: n.read_status === 'leida' ? 0.6 : 1 }}>
          <div className="row"><strong>{n.title}</strong><span className="spacer" />
            <span className={`badge ${n.read_status === 'no_leida' ? 'warn' : ''}`}>{n.read_status}</span></div>
          {n.body && <p style={{ margin: '6px 0' }}>{n.body}</p>}
          <small>{new Date(n.created_at).toLocaleString()}</small>
          {n.read_status !== 'leida' && <button className="ghost" style={{ marginLeft: 10 }} onClick={() => markRead(n.id)}>Marcar leída</button>}
        </div>
      ))}
    </div>
  );
}

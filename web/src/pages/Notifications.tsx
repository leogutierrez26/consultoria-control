import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Notifications() {
  const { token } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('todas');

  async function load() {
    const q = status === 'todas' ? '' : `?status=${status}`;
    const r: any = await api.get(`/notifications${q}`, token);
    setItems(r.notifications || []);
  }
  useEffect(() => { load(); }, [token, status]);

  async function markRead(id: string) {
    await api.post(`/notifications/${id}/read`, {}, token);
    setItems(items.map((n) => n.id === id ? { ...n, read_status: 'leida' } : n));
  }

  async function markAllRead() {
    await api.post('/notifications/read-all', {}, token);
    await load();
  }

  const unread = useMemo(() => items.filter((n) => n.read_status === 'no_leida').length, [items]);

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Centro de avisos</p><h2>Notificaciones</h2></div>
        <button className="ghost" onClick={markAllRead} disabled={!unread}>Marcar todo leído</button>
      </div>

      <section className="card">
        <strong>Filtros</strong>
        <div className="row wrap">
          <button className={status === 'todas' ? '' : 'ghost'} onClick={() => setStatus('todas')}>Todas</button>
          <button className={status === 'no_leida' ? '' : 'ghost'} onClick={() => setStatus('no_leida')}>No leídas</button>
          <button className={status === 'leida' ? '' : 'ghost'} onClick={() => setStatus('leida')}>Leídas</button>
        </div>
      </section>

      <div className="notification-list">
        {items.length === 0 && <div className="empty">No hay notificaciones para este filtro.</div>}
        {items.map((n) => (
          <article key={n.id} className={`notice ${n.read_status === 'leida' ? 'is-read' : ''}`}>
            <div>
              <div className="row wrap"><strong>{n.title}</strong><span className={`badge ${n.read_status === 'no_leida' ? 'warn' : ''}`}>{n.read_status.replace('_', ' ')}</span></div>
              {n.body && <p>{n.body}</p>}
              <small>{new Date(n.created_at).toLocaleString()}</small>
            </div>
            {n.read_status !== 'leida' && <button className="ghost" onClick={() => markRead(n.id)}>Marcar leída</button>}
          </article>
        ))}
      </div>
    </div>
  );
}

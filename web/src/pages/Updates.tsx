import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Updates({ activityId }: { activityId: string }) {
  const { token } = useSession();
  const [updates, setUpdates] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('cliente');

  async function load() {
    const r: any = await api.get(`/updates/${activityId}`, token);
    setUpdates(r.updates || []);
  }
  useEffect(() => { load(); }, [activityId, token]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/updates', { activity_id: activityId, content, visibility }, token);
    setContent(''); await load();
  }

  return (
    <div>
      <h3>Línea de seguimiento</h3>
      <div style={{ maxHeight: 220, overflow: 'auto' }}>
        {(updates || []).map((u) => (
          <div key={u.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
            <div className="row"><span className="badge">{u.type}</span><span className="badge">{u.visibility}</span>
              <span className="spacer" /><small>{new Date(u.created_at).toLocaleString()}</small></div>
            <p style={{ margin: '6px 0 0' }}>{u.content}</p>
          </div>
        ))}
      </div>
      <form onSubmit={post}>
        <textarea placeholder="Escriba una actualización…" value={content} onChange={(e) => setContent(e.target.value)} required />
        <div className="row" style={{ marginTop: 8 }}>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="cliente">Pública para cliente</option>
            <option value="privada">Privada</option>
            <option value="seleccionados">Seleccionados</option>
          </select>
          <span className="spacer" /><button>Publicar</button>
        </div>
      </form>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

const STATES = ['pendiente', 'programada', 'en_ejecucion', 'esperando_info', 'bloqueada', 'en_revision', 'finalizada', 'cancelada'];

export default function Kanban() {
  const { token } = useSession();
  const [acts, setActs] = useState<any[]>([]);
  const [proj, setProj] = useState('');

  async function load() {
    const q = proj ? `?project_id=${proj}` : '';
    const r: any = await api.get(`/activities${q}`, token);
    setActs(r.activities || []);
  }
  useEffect(() => { load(); }, [token, proj]);

  async function move(id: string, status: string) {
    await api.patch(`/activities/${id}`, { status }, token);
    setActs(acts.map((a) => a.id === id ? { ...a, status } : a));
  }

  return (
    <div>
      <div className="row"><h2>Tablero (Kanban)</h2><span className="spacer" />
        <input placeholder="filtrar project_id" value={proj} onChange={(e) => setProj(e.target.value)} style={{ maxWidth: 300 }} /></div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10 }}>
        {STATES.map((s) => (
          <div key={s} className="card" style={{ minWidth: 200, flex: 1 }}>
            <strong style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</strong>
            <div style={{ marginTop: 8 }}>
              {acts.filter((a) => a.status === s).map((a) => (
                <div key={a.id} className="card" style={{ marginBottom: 6, background: '#0b1220', padding: 8 }}>
                  <div>{a.title}</div>
                  <select value={a.status} onChange={(e) => move(a.id, e.target.value)} style={{ marginTop: 6, fontSize: 12 }}>
                    {STATES.map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                  </select>
                </div>
              ))}
              {acts.filter((a) => a.status === s).length === 0 && <small className="msg">—</small>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

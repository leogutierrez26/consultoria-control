import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Audit() {
  const { token, user } = useSession();
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.get('/audit?limit=200', token).then((r: any) => setLogs(r.logs || [])).catch(() => {});
  }, [token, user]);

  if (user?.role !== 'admin') return <div>Solo el administrador puede ver la auditoría.</div>;

  return (
    <div>
      <h2>Auditoría</h2>
      <table className="card">
        <thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>ID</th><th>IP</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}><td>{new Date(l.created_at).toLocaleString()}</td><td>{l.action}</td>
              <td>{l.entity}</td><td>{l.entity_id?.slice(0, 8) || '—'}</td><td>{l.ip_address || '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Appointments() {
  const { token, user } = useSession();
  const [appts, setAppts] = useState<any[]>([]);

  async function load() { const r: any = await api.get('/appointments', token); setAppts(r.appointments || []); }
  useEffect(() => { load(); }, [token]);

  async function act(id: string, action: string) {
    await api.post(`/appointments/${id}/${action}`, {}, token);
    await load();
  }

  return (
    <div>
      <h2>Citas</h2>
      <table className="card">
        <thead><tr><th>Inicio</th><th>Fin</th><th>Modalidad</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {appts.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.start_time).toLocaleString()}</td>
              <td>{new Date(a.end_time).toLocaleString()}</td>
              <td>{a.modality}</td><td>{a.reason}</td>
              <td><span className={`badge ${a.status === 'confirmada' ? 'ok' : a.status.includes('cancel') ? 'err' : 'warn'}`}>{a.status}</span></td>
              <td className="row">
                {user?.role === 'admin' && <button className="ghost" onClick={() => act(a.id, 'confirm')}>Confirmar</button>}
                <button className="ghost" onClick={() => act(a.id, 'cancel_client')}>Cancelar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Agenda() {
  const { token, user } = useSession();
  const [availability, setAvailability] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [av, setAv] = useState({ day_of_week: 1, start_time: '09:00', end_time: '12:00', slot_minutes: 60 });
  const [range, setRange] = useState({ from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) });
  const [booking, setBooking] = useState<{ start: string; end: string } | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [reason, setReason] = useState('');

  async function loadAv() { const r: any = await api.get('/availability', token); setAvailability(r.availability || []); }

  useEffect(() => { loadAv(); api.get('/projects', token).then((r: any) => setProjects(r.projects || [])); }, [token]);

  async function addAv(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/availability', av, token);
    await loadAv();
  }

  async function loadSlots() {
    const r: any = await api.get(`/availability/slots?from=${range.from}&to=${range.to}`, token);
    setSlots(r.slots || []);
  }

  async function book() {
    if (!booking) return;
    const pid = projects[0]?.id;
    await api.post('/appointments', {
      start_time: booking.start, end_time: booking.end, reason: reason || 'Cita', modality: 'videoconferencia',
      project_id: pid
    }, token);
    setBooking(null); setReason('');
    await loadSlots();
  }

  return (
    <div>
      <h2>Agenda</h2>
      {user?.role === 'admin' && (
        <form className="card" onSubmit={addAv}>
          <strong>Publicar disponibilidad</strong>
          <div className="grid cols-4">
            <div><label>Día (0=Dom)</label><input type="number" min={0} max={6} value={av.day_of_week} onChange={(e) => setAv({ ...av, day_of_week: Number(e.target.value) })} /></div>
            <div><label>Inicio</label><input type="time" value={av.start_time} onChange={(e) => setAv({ ...av, start_time: e.target.value })} /></div>
            <div><label>Fin</label><input type="time" value={av.end_time} onChange={(e) => setAv({ ...av, end_time: e.target.value })} /></div>
            <div><label>Slot (min)</label><input type="number" value={av.slot_minutes} onChange={(e) => setAv({ ...av, slot_minutes: Number(e.target.value) })} /></div>
          </div>
          <button style={{ marginTop: 12 }}>Publicar</button>
        </form>
      )}

      <div className="card">
        <strong>Espacios disponibles</strong>
        <div className="row" style={{ marginTop: 8 }}>
          <div><label>Desde</label><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
          <div><label>Hasta</label><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
          <button onClick={loadSlots}>Consultar</button>
        </div>
        <div className="grid cols-3" style={{ marginTop: 12 }}>
          {(slots || []).map((s) => (
            <button key={s.start} className="ghost" onClick={() => setBooking({ start: s.start, end: s.end })}>
              {new Date(s.start).toLocaleString()} ({s.duration_min} min)
            </button>
          ))}
          {(slots || []).length === 0 && <span className="msg">Sin espacios en el rango.</span>}
        </div>
      </div>

      {booking && (
        <div className="modal-back" onClick={() => setBooking(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reservar cita</h3>
            <p>{new Date(booking.start).toLocaleString()}</p>
            <label>Proyecto</label>
            <select value={projects[0]?.id} disabled><option>{projects[0]?.name || '—'}</option></select>
            <label>Motivo</label><input value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row" style={{ marginTop: 12 }}><button onClick={book}>Confirmar reserva</button><button className="ghost" onClick={() => setBooking(null)}>Cancelar</button></div>
          </div>
        </div>
      )}

      <div className="card">
        <strong>Disponibilidad publicada</strong>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Día</th><th>Inicio</th><th>Fin</th><th>Slot</th></tr></thead>
          <tbody>{availability.map((a) => <tr key={a.id}><td>{a.day_of_week}</td><td>{a.start_time}</td><td>{a.end_time}</td><td>{a.slot_minutes}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

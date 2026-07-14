import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const today = new Date().toISOString().slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

function when(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export default function Agenda() {
  const { token, user } = useSession();
  const [availability, setAvailability] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [av, setAv] = useState({ day_of_week: 1, specific_date: '', start_time: '09:00', end_time: '12:00', slot_minutes: 60, min_anticipation_hours: 4 });
  const [range, setRange] = useState({ from: today, to: nextWeek });
  const [booking, setBooking] = useState<{ start: string; end: string } | null>(null);
  const [form, setForm] = useState({ client_id: '', project_id: '', reason: '', modality: 'videoconferencia' });
  const [msg, setMsg] = useState('');

  const projectOptions = useMemo(
    () => form.client_id ? projects.filter((p) => p.client_id === form.client_id) : projects,
    [projects, form.client_id]
  );

  async function loadAv() {
    const r: any = await api.get('/availability', token);
    setAvailability(r.availability || []);
  }

  async function loadBase() {
    const [p, c]: any[] = await Promise.all([api.get('/projects', token), api.get('/clients', token)]);
    setProjects(p.projects || []);
    setClients(c.clients || []);
    await loadAv();
  }

  useEffect(() => { loadBase().catch((err) => setMsg(err.message)); }, [token]);

  async function addAv(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    await api.post('/availability', {
      day_of_week: av.specific_date ? null : av.day_of_week,
      specific_date: av.specific_date || null,
      start_time: av.start_time,
      end_time: av.end_time,
      slot_minutes: Number(av.slot_minutes),
      min_anticipation_hours: Number(av.min_anticipation_hours)
    }, token);
    await loadAv();
  }

  async function deleteAv(id: string) {
    if (!confirm('¿Eliminar esta disponibilidad?')) return;
    await api.post(`/availability/${id}/delete`, {}, token);
    await loadAv();
  }

  async function loadSlots() {
    const r: any = await api.get(`/availability/slots?from=${range.from}&to=${range.to}`, token);
    setSlots(r.slots || []);
  }

  function openBooking(slot: any) {
    const project = projects[0];
    setForm({
      client_id: project?.client_id || clients[0]?.id || '',
      project_id: project?.id || '',
      reason: '',
      modality: 'videoconferencia'
    });
    setBooking({ start: slot.start, end: slot.end });
  }

  async function book() {
    if (!booking) return;
    if (!form.client_id) { setMsg('Selecciona un cliente para la cita.'); return; }
    await api.post('/appointments', {
      client_id: form.client_id,
      project_id: form.project_id || null,
      start_time: booking.start,
      end_time: booking.end,
      reason: form.reason || 'Cita de seguimiento',
      modality: form.modality
    }, token);
    setBooking(null);
    setMsg('Cita registrada correctamente.');
    await loadSlots();
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Agenda</p><h2>Disponibilidad y reservas</h2></div>
        <button onClick={loadSlots}>Consultar espacios</button>
      </div>

      {msg && <div className={`msg ${msg.includes('correctamente') ? 'ok' : 'err'}`}>{msg}</div>}

      {user?.role === 'admin' && (
        <form className="card" onSubmit={addAv}>
          <strong>Publicar disponibilidad</strong>
          <div className="grid cols-4">
            <div><label>Fecha específica</label><input type="date" value={av.specific_date} onChange={(e) => setAv({ ...av, specific_date: e.target.value })} /></div>
            <div><label>Día semanal</label><select disabled={!!av.specific_date} value={av.day_of_week} onChange={(e) => setAv({ ...av, day_of_week: Number(e.target.value) })}>
              {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select></div>
            <div><label>Inicio</label><input type="time" value={av.start_time} onChange={(e) => setAv({ ...av, start_time: e.target.value })} /></div>
            <div><label>Fin</label><input type="time" value={av.end_time} onChange={(e) => setAv({ ...av, end_time: e.target.value })} /></div>
            <div><label>Duración slot</label><input type="number" min={15} value={av.slot_minutes} onChange={(e) => setAv({ ...av, slot_minutes: Number(e.target.value) })} /></div>
            <div><label>Anticipación mínima (h)</label><input type="number" min={0} value={av.min_anticipation_hours} onChange={(e) => setAv({ ...av, min_anticipation_hours: Number(e.target.value) })} /></div>
          </div>
          <button style={{ marginTop: 12 }}>Publicar disponibilidad</button>
        </form>
      )}

      <section className="card">
        <strong>Espacios disponibles</strong>
        <div className="grid cols-4">
          <div><label>Desde</label><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
          <div><label>Hasta</label><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        </div>
        <div className="slot-grid">
          {slots.map((s) => (
            <button key={s.start} className="slot-button" onClick={() => openBooking(s)}>
              <b>{when(s.start)}</b>
              <span>{s.duration_min} min</span>
            </button>
          ))}
          {slots.length === 0 && <div className="empty">Consulta un rango para ver espacios disponibles.</div>}
        </div>
      </section>

      {booking && (
        <div className="modal-back" onClick={() => setBooking(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reservar cita</h3>
            <p>{when(booking.start)} - {new Date(booking.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <div className="grid cols-2">
              <div><label>Cliente</label><select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, project_id: '' })}>
                <option value="">Selecciona</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select></div>
              <div><label>Proyecto</label><select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">Sin proyecto</option>{projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
              <div><label>Modalidad</label><select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
                <option value="videoconferencia">Videoconferencia</option>
                <option value="soporte_remoto">Soporte remoto</option>
                <option value="telefonica">Telefónica</option>
                <option value="presencial">Presencial</option>
                <option value="visita_tecnica">Visita técnica</option>
              </select></div>
              <div><label>Motivo</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <div className="row" style={{ marginTop: 12 }}><button onClick={book}>Confirmar reserva</button><button className="ghost" onClick={() => setBooking(null)}>Cancelar</button></div>
          </div>
        </div>
      )}

      <section className="card">
        <div className="section-title"><strong>Disponibilidad publicada</strong><span>{availability.length} reglas</span></div>
        <table>
          <thead><tr><th>Aplica</th><th>Inicio</th><th>Fin</th><th>Slot</th><th>Anticipación</th><th></th></tr></thead>
          <tbody>
            {availability.length === 0 && <tr><td colSpan={6}>No hay disponibilidad publicada.</td></tr>}
            {availability.map((a) => <tr key={a.id}>
              <td>{a.specific_date ? new Date(a.specific_date).toLocaleDateString() : days[a.day_of_week]}</td>
              <td>{a.start_time}</td><td>{a.end_time}</td><td>{a.slot_minutes} min</td><td>{a.min_anticipation_hours} h</td>
              <td>{user?.role === 'admin' && <button className="ghost" onClick={() => deleteAv(a.id)}>Eliminar</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </section>
    </div>
  );
}

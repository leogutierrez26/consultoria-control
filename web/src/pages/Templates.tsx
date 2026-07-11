import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function Templates() {
  const { token } = useSession();
  const [templates, setTemplates] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);

  async function load() { const r: any = await api.get('/templates', token); setTemplates(r.templates || []); }
  useEffect(() => { load(); }, [token]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await api.put(`/templates/${edit.key}`, { subject: edit.subject, body: edit.body }, token);
    setEdit(null); await load();
  }

  return (
    <div>
      <h2>Plantillas de correo</h2>
      <table className="card">
        <thead><tr><th>Clave</th><th>Asunto</th><th></th></tr></thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.key}><td>{t.key}</td><td>{t.subject}</td>
              <td><button className="ghost" onClick={() => setEdit({ ...t })}>Editar</button></td></tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <form className="modal-back" onSubmit={save} onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{edit.key}</h3>
            <label>Asunto</label><input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
            <label>Cuerpo</label><textarea rows={6} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            <div className="row" style={{ marginTop: 12 }}><button>Guardar</button><button className="ghost" type="button" onClick={() => setEdit(null)}>Cancelar</button></div>
          </div>
        </form>
      )}
    </div>
  );
}

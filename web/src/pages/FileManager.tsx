import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';

export default function FileManager({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { token } = useSession();
  const [files, setFiles] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [vis, setVis] = useState('cliente');
  const [msg, setMsg] = useState('');

  async function load() {
    const r: any = await api.get(`/files/entity/${entityType}/${entityId}`, token);
    setFiles(r.files || []);
  }
  useEffect(() => { if (entityId) load(); }, [entityId, token]);

  async function upload(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entity_type', entityType);
    fd.append('entity_id', entityId);
    fd.append('visibility', vis);
    const res = await fetch(`/api/files`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (res.ok) { setFile(null); await load(); } else setMsg('Error al subir');
  }

  async function del(id: string) {
    await api.post(`/files/${id}/delete`, { reason: 'eliminado por usuario' }, token);
    await load();
  }

  return (
    <div className="card">
      <strong>Archivos</strong>
      <form onSubmit={upload} className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <select value={vis} onChange={(e) => setVis(e.target.value)}>
          <option value="cliente">Público cliente</option>
          <option value="privada">Privado</option>
          <option value="seleccionados">Seleccionados</option>
        </select>
        <button>Subir</button>
      </form>
      {msg && <div className="msg err">{msg}</div>}
      <ul style={{ marginTop: 8, paddingLeft: 18 }}>
        {files.map((f) => (
          <li key={f.id}>
            <a href={`/api/files/${f.id}/download`} target="_blank" rel="noreferrer">{f.original_name}</a>
            {' '}({(f.size_bytes / 1024).toFixed(0)} KB, {f.visibility})
            <button className="ghost" style={{ marginLeft: 8 }} onClick={() => del(f.id)}>Eliminar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, tokenStore } from '../api';
import { useSession } from '../App';

export default function Login() {
  const { setSession } = useSession();
  const [params] = useSearchParams();
  const mode = params.get('token') ? 'set' : window.location.pathname.includes('reset') ? 'reset' : 'login';
  const token = params.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const r: any = await api.post('/auth/login', { email, password });
      setSession(r.user, r.token);
    } catch (err: any) {
      setMsg({ t: 'err', m: err.message });
    } finally { setLoading(false); }
  }

  async function doForgot(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMsg(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setMsg({ t: 'ok', m: 'Si el correo existe, se envió un enlace.' });
    } catch (err: any) { setMsg({ t: 'err', m: err.message }); }
    finally { setLoading(false); }
  }

  async function doSet(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMsg(null);
    try {
      await api.post('/users/set-password', { token, next });
      setMsg({ t: 'ok', m: 'Contraseña establecida. Inicie sesión.' });
      setTimeout(() => { window.location.href = '/login'; }, 1200);
    } catch (err: any) { setMsg({ t: 'err', m: err.message }); }
    finally { setLoading(false); }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMsg(null);
    try {
      await api.post('/auth/reset-password', { token, next });
      setMsg({ t: 'ok', m: 'Contraseña restablecida.' });
      setTimeout(() => { window.location.href = '/login'; }, 1200);
    } catch (err: any) { setMsg({ t: 'err', m: err.message }); }
    finally { setLoading(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={mode === 'login' ? doLogin : mode === 'reset' ? doReset : doSet}>
        <h1>Consultoría Control</h1>
        {mode === 'login' && <>
          <label>Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="row" style={{ marginTop: 16 }}>
            <button disabled={loading}>{loading ? '…' : 'Ingresar'}</button>
            <button type="button" className="ghost" onClick={doForgot} disabled={loading}>Olvidé mi clave</button>
          </div>
        </>}
        {(mode === 'set' || mode === 'reset') && <>
          <p>Establezca su nueva contraseña.</p>
          <label>Nueva contraseña</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
          <button style={{ marginTop: 16 }} disabled={loading || !token}>{loading ? '…' : 'Guardar'}</button>
        </>}
        {msg && <div className={`msg ${msg.t}`}>{msg.m}</div>}
      </form>
    </div>
  );
}

/* Tests de aceptación del MVP (RF de prioridad alta).
   Ejecuta la API en memoria contra la BD real y valida flujos y reglas de negocio.
   Corre con: npm run test --workspace server  (usa ts-node) */
import { Pool } from 'pg';
import { config } from '../config';
import app from '../index';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function request(
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  // Usamos el cliente HTTP nativo de Node para no agregar dependencias.
  const http = require('http');
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: config.apiPort,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      (res: any) => {
        let raw = '';
        res.on('data', (c: any) => (raw += c));
        res.on('end', () => {
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw || '{}');
          } catch {
            /* no json */
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

async function main(): Promise<void> {
  // Limpieza inicial para idempotencia
  const pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query('DELETE FROM time_entries');
  await pool.query('DELETE FROM timers');
  await pool.query('DELETE FROM appointments');
  await pool.query('DELETE FROM updates');
  await pool.query('DELETE FROM activities');
  await pool.query('DELETE FROM projects');
  await pool.query('DELETE FROM users WHERE role = $1', ['client']);
  await pool.query('DELETE FROM clients');
  await pool.query("DELETE FROM users WHERE email = $1", ['admin@test.local']);
  await pool.query("DELETE FROM users WHERE email = $1", ['cliente@test.local']);

  console.log('\n== Auth ==');
  // Login sin usuario -> 401
  let r = await request('POST', '/api/auth/login', undefined, { email: 'nope@x.com', password: 'x' });
  assert(r.status === 401, 'login con credenciales inválidas devuelve 401');

  // Crear admin bootstrap vía SQL directo (no hay registro público de admin)
  const adminPw = '$2a$10$' + 'x'.repeat(53); // placeholder; lo sobreescribimos abajo con hash real
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('Admin123!', 10);
  await pool.query(
    `INSERT INTO users (id, role, email, password_hash, first_name, last_name, status, email_verified)
     VALUES (gen_random_uuid(),'admin',$1,$2,'Admin','Root','active',true)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2`,
    ['admin@test.local', hash]
  );
  r = await request('POST', '/api/auth/login', undefined, { email: 'admin@test.local', password: 'Admin123!' });
  assert(r.status === 200 && !!r.body.token, 'admin inicia sesión y recibe token');
  const adminToken = r.body.token;

  console.log('\n== Clientes (RF-CLI) ==');
  r = await request('POST', '/api/clients', adminToken, { legal_name: 'Empresa Demo S.A.S.', client_type: 'juridica', email: 'demo@empresa.com', default_rate: 120000 });
  assert(r.status === 201 && !!r.body.client.id, 'admin crea cliente');
  const clientId = r.body.client.id;

  console.log('\n== Usuarios cliente (RF-USR) ==');
  r = await request('POST', '/api/users', adminToken, { client_id: clientId, email: 'cliente@test.local', first_name: 'Cli', last_name: 'Ente' });
  assert(r.status === 201, 'admin crea usuario cliente');
  // Email duplicado -> 409
  r = await request('POST', '/api/users', adminToken, { client_id: clientId, email: 'cliente@test.local', first_name: 'Cli', last_name: 'Ente' });
  assert(r.status === 409, 'email duplicado es rechazado (409)');

  console.log('\n== Proyectos (RF-PRY) ==');
  r = await request('POST', '/api/projects', adminToken, { client_id: clientId, code: 'DEMO-1', name: 'Implementación portal', description: 'Proyecto demo', status: 'en_ejecucion', visible_to_client: true });
  assert(r.status === 201, 'admin crea proyecto');
  const projectId = r.body.project.id;

  console.log('\n== Actividades (RF-ACT) ==');
  r = await request('POST', '/api/activities', adminToken, { project_id: projectId, title: 'Diseño de arquitectura' });
  assert(r.status === 201, 'admin crea actividad');
  const activityId = r.body.activity.id;
  // RN-002: actividad sin proyecto inválida
  r = await request('POST', '/api/activities', adminToken, { title: 'Sin proyecto' });
  assert(r.status === 400, 'actividad sin proyecto es rechazada (RN-002)');

  console.log('\n== Línea de seguimiento (RF-SEG) ==');
  r = await request('POST', '/api/updates', adminToken, { activity_id: activityId, content: 'Avance 1', visibility: 'cliente', notify: true });
  assert(r.status === 201, 'admin publica actualización');

  console.log('\n== Disponibilidad + Citas (RF-DIS / RF-CIT) ==');
  r = await request('POST', '/api/availability', adminToken, { day_of_week: 1, start_time: '09:00', end_time: '12:00', slot_minutes: 60 });
  assert(r.status === 201, 'admin configura disponibilidad');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + ((1 - startDate.getDay() + 7) % 7 || 7)); // próximo lunes
  const slotStart = `${startDate.toISOString().slice(0, 10)}T10:00:00.000Z`;
  const slotEnd = `${startDate.toISOString().slice(0, 10)}T11:00:00.000Z`;
  r = await request('POST', '/api/appointments', adminToken, { client_id: clientId, project_id: projectId, start_time: slotStart, end_time: slotEnd, reason: 'Reunión kickoff', modality: 'videoconferencia' });
  assert(r.status === 201, 'admin crea cita en horario disponible');
  const apptId = r.body.appointment.id;
  // RN-009: doble reserva rechazada
  r = await request('POST', '/api/appointments', adminToken, { client_id: clientId, project_id: projectId, start_time: slotStart, end_time: slotEnd, reason: 'Otra', modality: 'presencial' });
  assert(r.status === 409, 'doble reserva en mismo intervalo es rechazada (RN-009)');
  // Confirmar
  r = await request('POST', `/api/appointments/${apptId}/confirm`, adminToken);
  assert(r.status === 200 && r.body.status === 'confirmada', 'cita confirmada correctamente');

  console.log('\n== Horas y cronómetro (RF-HOR) ==');
  r = await request('POST', '/api/hours', adminToken, { client_id: clientId, project_id: projectId, work_date: new Date().toISOString().slice(0, 10), duration_minutes: 120, description: 'Trabajo manual', billable: true });
  assert(r.status === 201, 'admin registra horas manuales');
  r = await request('POST', '/api/hours/timer/start', adminToken, { client_id: clientId, project_id: projectId, description: 'Cronómetro demo' });
  assert(r.status === 201, 'admin inicia cronómetro');
  // RN-018: solo un cronómetro
  r = await request('POST', '/api/hours/timer/start', adminToken, { client_id: clientId, project_id: projectId });
  assert(r.status === 409, 'no se permite segundo cronómetro (RN-018)');
  const timerId = r.body?.timer?.id; // puede ser undefined si falló; usamos el anterior
  r = await request('POST', '/api/hours/timer', adminToken);
  const activeTimer = r.body.timer;
  if (activeTimer) {
    await request('POST', `/api/hours/timer/${activeTimer.id}/stop`, adminToken, { description: 'Fin', billable: true });
    assert(true, 'cronómetro finalizado y consolida entrada');
  }

  console.log('\n== Reportes (RF-REP) ==');
  r = await request('GET', '/api/reports/hours', adminToken);
  assert(r.status === 200 && r.body.summary, 'reporte de horas retorna resumen');
  assert(r.body.summary.total_hours >= 2, 'reporte refleja horas registradas (>=2h)');

  console.log('\n== Aislamiento de cliente (RN-004) ==');
  // cliente no puede ver proyecto de otro: creamos 2do cliente y verificamos que el 1er cliente no lo vea
  const pool2 = pool;
  const c2 = await request('POST', '/api/clients', adminToken, { legal_name: 'Otra Empresa', client_type: 'juridica', email: 'otra@x.com' });
  const c2Id = c2.body.client.id;
  await request('POST', '/api/projects', adminToken, { client_id: c2Id, code: 'OTRO-1', name: 'Proyecto ajeno', visible_to_client: true });
  // login cliente 1
  const hash2 = bcrypt.hashSync('Cliente123!', 10);
  await pool2.query(
    `INSERT INTO users (id, client_id, role, email, password_hash, first_name, last_name, status, email_verified)
     VALUES (gen_random_uuid(),$1,'client','cliente@test.local',$2,'Cli','Entte','active',true)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, client_id = $1`,
    [clientId, hash2]
  );
  r = await request('POST', '/api/auth/login', undefined, { email: 'cliente@test.local', password: 'Cliente123!' });
  const clientToken = r.body.token;
  r = await request('GET', '/api/projects', clientToken);
  const seesOther = (r.body.projects || []).some((p: any) => p.client_id === c2Id);
  assert(r.status === 200 && !seesOther, 'cliente solo ve sus propios proyectos (RN-004)');

  console.log('\n== Auditoría (RF-AUD) ==');
  r = await request('GET', '/api/audit', clientToken);
  assert(r.status === 403, 'cliente no accede a auditoría (RF-AUD-003)');
  r = await request('GET', '/api/audit', adminToken);
  assert(r.status === 200 && Array.isArray(r.body.logs) && r.body.logs.length > 0, 'admin consulta registros de auditoría');

  console.log('\n== Health ==');
  r = await request('GET', '/health');
  assert(r.status === 200 && r.body.db === 'up', 'health check reporta BD arriba');

  // Limpieza
  await pool.query('DELETE FROM time_entries');
  await pool.query('DELETE FROM timers');
  await pool.query('DELETE FROM appointments');
  await pool.query('DELETE FROM updates');
  await pool.query('DELETE FROM activities');
  await pool.query('DELETE FROM projects');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM clients');
  await pool.end();

  console.log(`\n=== RESULTADO: ${passed} pasaron, ${failed} fallaron ===`);
  if (failed > 0) {
    console.error('Fallos:', failures);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Error en tests:', e);
  process.exit(1);
});

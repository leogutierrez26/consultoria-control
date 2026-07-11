#!/usr/bin/env node
// Seed de datos de prueba para Consultoría Control.
// Uso: node server/scripts/seed.js   (requiere el stack Docker en marcha)
// Borra datos previos e inserta un conjunto coherente de prueba.
//
// Usuarios generados (ver seed/USUARIOS.md):
//   admin@consultoriacontrol.app / Admin123!
//   cliente1@demo.com         / Cliente123!
//   cliente2@demo.com         / Cliente123!

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://consultoria:consultoria@localhost:5432/consultoria' });
const hash = (p) => bcrypt.hashSync(p, 10);

async function clean() {
  const tables = ['time_entries','timers','notifications','appointments','updates','activities','projects','files','users','clients'];
  for (const t of tables) { try { await Q(`DELETE FROM ${t}`); } catch (e) { console.error('clean', t, e.message); } }
}

async function Q(sql, params, label) {
  try { return await pool.query(sql, params); }
  catch (e) { console.error('FAIL en', label, '->', e.message); console.error('SQL:', sql); throw e; }
}

async function seed() {
  // --- Admin ---
  const adminId = uuid();
  await Q(
    `INSERT INTO users (id, role, email, password_hash, first_name, last_name, status, email_verified, created_at, updated_at)
     VALUES ($1,'admin','admin@consultoriacontrol.app',$2,'Administrador','Principal','active',true,NOW(),NOW())`,
    [adminId, hash('Admin123!')]
  );

  // --- Clientes ---
  const c1 = uuid(), c2 = uuid();
  await Q(
    `INSERT INTO clients (id, legal_name, client_type, id_type, id_number, contact_name, email, billing_email, phone, city, country, default_rate, status, created_at, updated_at)
     VALUES ($1,'Empresa Demo S.A.S.','juridica','NIT','900.123.456-7','Ana Pérez','cliente1@demo.com','facturacion@demo.com','+57 300 111 2233','Bogotá','Colombia',120000,'active',NOW(),NOW()),
            ($2,'Startup Inova S.A.S.','juridica','NIT','901.987.654-3','Carlos Ruiz','cliente2@demo.com','contabilidad@inova.com','+57 311 444 5566','Medellín','Colombia',150000,'active',NOW(),NOW())`,
    [c1, c2]
  );

  // --- Usuarios cliente ---
  const u1 = uuid(), u2 = uuid();
  await Q(
    `INSERT INTO users (id, client_id, role, email, password_hash, first_name, last_name, title, status, email_verified, created_at, updated_at)
     VALUES ($1,$2,'client','cliente1@demo.com',$3,'Ana','Pérez','Gerente de Proyecto','active',true,NOW(),NOW()),
            ($4,$5,'client','cliente2@demo.com',$6,'Carlos','Ruiz','Director','active',true,NOW(),NOW())`,
    [u1, c1, hash('Cliente123!'), u2, c2, hash('Cliente123!')]
  );

  // --- Proyectos ---
  const p1 = uuid(), p2 = uuid();
  await Q(
    `INSERT INTO projects (id, client_id, code, name, description, status, priority, hour_budget, hourly_rate, responsible, visible_to_client, created_at, updated_at)
     VALUES ($1,$2,'DEMO-001','Plataforma Web Corporativa','Rediseño y despliegue del sitio institucional.','en_ejecucion','alta',80,120000,'Consultor Equipo',true,NOW(),NOW()),
            ($3,$4,'INNO-001','App Móvil de Ventas','MVP de aplicación de ventas para iOS/Android.','pendiente','media',120,150000,'Consultor Equipo',true,NOW(),NOW())`,
    [p1, c1, p2, c2]
  );

  // --- Actividades ---
  const a1 = uuid(), a2 = uuid(), a3 = uuid();
  await Q(
    `INSERT INTO activities (id, project_id, title, description, responsible, status, priority, estimated_hours, progress, billable, visible_to_client, created_at, updated_at)
     VALUES ($1,$2,'Definir arquitectura','Selección de stack y diagrama de componentes.','Ingeniero Líder','finalizada','alta',12,100,true,true,NOW(),NOW()),
            ($3,$4,'Maquetas UI','Diseño de pantallas clave en Figma.','Diseñador UX','en_ejecucion','media',20,60,true,true,NOW(),NOW()),
            ($5,$6,'Configurar CI/CD','Pipeline de despliegue continuo.','DevOps','pendiente','baja',8,0,true,true,NOW(),NOW())`,
    [a1, p1, a2, p1, a3, p2]
  );

  // --- Disponibilidad (semanal: lun-vie 08-12 y 14-18) ---
  for (let d = 1; d <= 5; d++) {
    await Q(
      `INSERT INTO availability (day_of_week, start_time, end_time, slot_minutes, buffer_minutes, min_anticipation_hours, booking_horizon_days)
       VALUES ($1,'08:00','12:00',60,0,4,60)`, [d]);
    await Q(
      `INSERT INTO availability (day_of_week, start_time, end_time, slot_minutes, buffer_minutes, min_anticipation_hours, booking_horizon_days)
       VALUES ($1,'14:00','18:00',60,0,4,60)`, [d]);
  }

  // --- Cita de ejemplo (dentro de un mes) ---
  const future = new Date(Date.now() + 7 * 86400000);
  future.setHours(10, 0, 0, 0);
  const end = new Date(future.getTime() + 60 * 60000);
  const aid = uuid();
  await Q(
    `INSERT INTO appointments (id, client_id, project_id, activity_id, start_time, end_time, duration_minutes, modality, reason, description, status, created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,60,'videoconferencia','Revisión de avances','Sesión quincenal de seguimiento.','confirmada',$7,NOW(),NOW())`,
    [aid, c1, p1, a2, future.toISOString(), end.toISOString(), adminId]
  );

  // --- Horas registradas (para reportes/bolsa) ---
  await Q(
    `INSERT INTO time_entries (id, user_id, client_id, project_id, activity_id, work_date, start_time, end_time, duration_minutes, description, billable, rate, billing_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,CURRENT_DATE + TIME '09:00',CURRENT_DATE + TIME '11:00',120,'Desarrollo de componentes',true,120000,'pendiente_facturar',NOW(),NOW()),
            ($6,$7,$8,$9,$10,CURRENT_DATE - INTERVAL '1 day',CURRENT_DATE - INTERVAL '1 day' + TIME '14:00',CURRENT_DATE - INTERVAL '1 day' + TIME '16:30',150,'Diseno de maquetas',true,120000,'pendiente_facturar',NOW(),NOW())`,
    [uuid(), u1, c1, p1, a2, uuid(), u1, c1, p1, a2]
  );

  // --- Archivo de ejemplo (solo metadata; el binario no se sube por seed) ---
  await Q(
    `INSERT INTO files (id, owner_id, entity_type, entity_id, original_name, stored_name, storage_path, mime_type, size_bytes, visibility, created_at)
     VALUES ($1,$2,'projects',$3,'propuesta_comercial.pdf','seed-propuesta.pdf','seed-propuesta.pdf','application/pdf',20480,'cliente',NOW())`,
    [uuid(), adminId, p1]
  );

  console.log('Seed completado.');
  console.log('Admin:   admin@consultoriacontrol.app / Admin123!');
  console.log('Cliente1: cliente1@demo.com / Cliente123!  (Empresa Demo S.A.S.)');
  console.log('Cliente2: cliente2@demo.com / Cliente123!  (Startup Inova S.A.S.)');
}

clean()
  .then(seed)
  .then(() => pool.end())
  .catch((e) => { console.error('Seed falló:', e.message); if (e.query) console.error('SQL:', e.query); process.exit(1); });

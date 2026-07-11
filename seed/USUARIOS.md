# Usuarios de prueba — Consultoría Control

Conjunto de datos sembrado por `server/scripts/seed.js`. Para regenerarlo:

```bash
cd consultoria-control/server
node scripts/seed.js        # usa DATABASE_URL o postgres://consultoria:consultoria@localhost:5432/consultoria
```

> El seed borra datos previos e inserta el conjunto de abajo de forma idempotente.

## Credenciales

| Rol | Correo | Contraseña | Cliente asociado |
|-----|--------|------------|---------------------|
| Administrador | `admin@consultoriacontrol.app` | `Admin123!` | — |
| Cliente | `cliente1@demo.com` | `Cliente123!` | Empresa Demo S.A.S. |
| Cliente | `cliente2@demo.com` | `Cliente123!` | Startup Innova S.A.S. |

## Datos sembrados

- **2 clientes**: Empresa Demo S.A.S. (NIT 900.123.456-7, Bogotá) y Startup Innova S.A.S. (NIT 901.987.654-3, Medellín).
- **2 proyectos**:
  - `DEMO-001` — Plataforma Web Corporativa (Empresa Demo, visible a cliente, 80 h presupuestadas, tarifa 120.000/h).
  - `INNO-001` — App Móvil de Ventas (Startup Innova, pendiente, 120 h, tarifa 150.000/h).
- **3 actividades**: Definir arquitectura (finalizada), Maquetas UI (en ejecución), Configurar CI/CD (pendiente).
- **Disponibilidad**: lunes a viernes, 08:00–12:00 y 14:00–18:00, slots de 60 min.
- **1 cita**: revisión de avances (videoconferencia, confirmada) dentro de 7 días.
- **Horas registradas**: 120 min y 150 min (facturables) para alimentar reportes y bolsa de horas.
- **1 archivo**: `propuesta_comercial.pdf` adjunto al proyecto DEMO-001 (visible a cliente).

## Notas de seguridad

- Estas contraseñas son de **prueba**. Cámbialas tras el despliegue en producción.
- El seed usa `bcryptjs` para los hashes; no se almacena ninguna contraseña en texto plano en la base de datos.
- El correo funciona en **modo simulado** (se registra en consola del servidor, no se envía). Configura `SMTP_*` en `.env` para envío real.

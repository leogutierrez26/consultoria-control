# Consultoría Control

Plataforma web para la gestión de consultoría, proyectos, actividades, agenda,
reservas, horas, comunicaciones, reportes y auditoría.

**Versión:** 1.2 · **Stack:** TypeScript (frontend y backend), Node.js, PostgreSQL, Docker.

## Novedades 1.2

- Nuevo Centro de Trabajo para priorizar actividades, citas, bloqueos y proyectos en riesgo.
- Panel cliente ampliado con actividades abiertas, próximas citas, progreso y actualizaciones recientes.
- Corrección del flujo de invitación para establecer contraseña desde el portal.

Cumple con la especificación `Requerimientos_Funcionales_Sistema_Consultoria_v1.1.md`
(MVP de prioridad alta, sección 12.1).

## Arquitectura

```
consultoria-control/
├── server/      Backend API REST (Express + TypeScript + PostgreSQL)
│   ├── src/
│   │   ├── routes/        Módulos: auth, clients, users, projects, activities,
│   │   │                  updates, availability, appointments, hours, reports,
│   │   │                  notifications, audit, config
│   │   ├── migrations/    Migraciones SQL versionadas (001_init.sql)
│   │   ├── test/          Tests de aceptación end-to-end (reglas de negocio)
│   │   ├── config.ts db.ts auth.ts mail.ts audit.ts middleware.ts types.ts
│   │   ├── migrate.ts     Runner de migraciones
│   │   └── index.ts       Arranque + OpenAPI + health check
│   ├── Dockerfile
│   └── package.json
├── web/         Frontend React + TypeScript (Vite)
│   ├── src/pages/  Login, dashboards, CRUD, agenda, horas, reportes, auditoría
│   ├── Dockerfile  (build Vite + nginx)
│   └── nginx.conf  (proxy inverso a la API)
└── docker-compose.yml   postgres + server + web (volúmenes persistentes)
```

## Requisitos tecnológicos cubiertos (RF-TEC)

- **RF-TEC-001/002/003** TypeScript en backend y frontend; API Node.js modular.
- **RF-TEC-004** Documentación OpenAPI en `/api-docs`.
- **RF-TEC-005/006** Dockerfiles multietapa + `docker-compose.yml` (postgres, server, web).
- **RF-TEC-007** Volúmenes persistentes para BD (`pgdata`) y archivos (`uploads`).
- **RF-TEC-008** Secretos vía variables de entorno (`.env` no versionado).
- **RF-TEC-009** Migraciones SQL versionadas con runner automático al arrancar.
- **RF-TEC-011** Health checks en los tres servicios.
- **RF-TEC-013** Scripts de build/test/migrate documentados.

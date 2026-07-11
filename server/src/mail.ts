import nodemailer, { Transporter } from 'nodemailer';
import { config } from './config';

// Servicio de correo. Si no hay SMTP_HOST configurado, simula el envío
// (lo registra en consola) para permitir desarrollo y pruebas sin correo real.
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (config.mailSimulated) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.pass
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined
    });
  }
  return transporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: MailOptions): Promise<{ sent: boolean; simulated: boolean }> {
  const t = getTransporter();
  if (!t) {
    console.log(
      `[MAIL-SIM] to=${opts.to} subject="${opts.subject}"\n${opts.text || opts.html}`
    );
    return { sent: true, simulated: true };
  }
  await t.sendMail({
    from: config.smtp.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text
  });
  return { sent: true, simulated: false };
}

// Plantillas básicas de correo (RF-CON-004)
export const templates = {
  invitation: (name: string, url: string) =>
    `Hola ${name},<br>Ha sido invitado a Consultoría Control. Establezca su contraseña aquí: <a href="${url}">${url}</a>`,
  resetPassword: (url: string) =>
    `Solicitó restablecer su contraseña. Use este enlace (único uso): <a href="${url}">${url}</a>`,
  projectCreated: (clientName: string, projectName: string) =>
    `Estimado ${clientName}, se ha creado el proyecto <b>${projectName}</b> en su portal.`,
  activityUpdate: (name: string, project: string, content: string) =>
    `Actualización en ${project}:<br>${content}<br><a href="${config.publicAppUrl}">Ver en el portal</a>`,
  appointmentCreated: (name: string, when: string) =>
    `${name}, su cita ha sido registrada para el ${when}.`,
  appointmentConfirmed: (when: string) =>
    `Su cita para el ${when} ha sido confirmada.`,
  appointmentCancelled: (when: string) =>
    `Su cita del ${when} ha sido cancelada.`,
  passwordChanged: () => `Se ha cambiado la contraseña de su cuenta. Si no fue usted, contacte al administrador.`
};

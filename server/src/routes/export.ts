import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin, currentClientId, isAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';

const router = Router();

async function getHoursData(rid: string | null, from?: string, to?: string, client_id?: string) {
  const filters: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (rid) { filters.push(`t.client_id = $${i++}`); vals.push(rid); }
  else if (client_id) { filters.push(`t.client_id = $${i++}`); vals.push(client_id); }
  if (from) { filters.push(`t.work_date >= $${i++}`); vals.push(from); }
  if (to) { filters.push(`t.work_date <= $${i++}`); vals.push(to); }
  let sql = `SELECT t.work_date, c.legal_name AS client, p.name AS project, t.description, t.duration_minutes, t.billable
             FROM time_entries t JOIN clients c ON c.id=t.client_id JOIN projects p ON p.id=t.project_id`;
  if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
  sql += ' ORDER BY t.work_date';
  const r = await query(sql, vals);
  return r.rows;
}

// RF-REP-006 Exportación CSV
router.get(
  '/hours/csv',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const rows = await getHoursData(rid, req.query.from as string, req.query.to as string, req.query.client_id as string);
    const header = ['fecha', 'cliente', 'proyecto', 'descripcion', 'minutos', 'facturable'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.work_date, r.client, `"${(r.project || '').replace(/"/g, '""')}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`, r.duration_minutes, r.billable ? 'Sí' : 'No'
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_horas.csv"');
    res.send('﻿' + lines.join('\n'));
  })
);

// RF-REP-006 Exportación Excel
router.get(
  '/hours/excel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const rows = await getHoursData(rid, req.query.from as string, req.query.to as string, req.query.client_id as string);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Horas');
    ws.columns = [
      { header: 'Fecha', key: 'work_date' }, { header: 'Cliente', key: 'client' },
      { header: 'Proyecto', key: 'project' }, { header: 'Descripción', key: 'description' },
      { header: 'Minutos', key: 'duration_minutes' }, { header: 'Facturable', key: 'billable' }
    ];
    ws.addRows(rows.map((r: any) => ({ ...r, billable: r.billable ? 'Sí' : 'No' })));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_horas.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  })
);

// RF-REP-006 Exportación PDF (texto plano en PDF válido)
router.get(
  '/hours/pdf',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const rows = await getHoursData(rid, req.query.from as string, req.query.to as string, req.query.client_id as string);
    const lines = ['REPORTE DE HORAS - Consultoría Control', ''];
    for (const r of rows) {
      lines.push(`${r.work_date} | ${r.client} | ${r.project} | ${r.duration_minutes} min | ${r.billable ? 'Facturable' : 'No facturable'}`);
    }
    const totalMin = rows.reduce((s: number, r: any) => s + (r.duration_minutes || 0), 0);
    lines.push('', `TOTAL: ${(totalMin / 60).toFixed(2)} horas`);
    const text = lines.join('\n');
    // PDF mínimo válido (1 página, texto como stream)
    const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${text.length}>>stream\nBT /F1 10 Tf 40 800 Td (${text.replace(/[()\\]/g, '\\$&').replace(/\n/g, ') Tj 0 -14 Td (')}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000224 00000 n \n0000000000 00000 n \ntrailer<</Root 1 0 R>>\n%%EOF`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_horas.pdf"');
    res.send(pdf);
  })
);

export default router;

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

async function getActivityServiceRows(
  rid: string | null,
  from?: string,
  to?: string,
  client_id?: string
) {
  const filters: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (rid) {
    filters.push(`COALESCE(a.client_id, p.client_id) = $${i++}`);
    vals.push(rid);
    filters.push(`a.visible_to_client = true AND (p.id IS NULL OR p.visible_to_client = true)`);
  } else if (client_id) {
    filters.push(`COALESCE(a.client_id, p.client_id) = $${i++}`);
    vals.push(client_id);
  }
  if (from) {
    filters.push(`COALESCE(h.last_work_date, a.due_date, a.start_date, a.created_at::date) >= $${i++}`);
    vals.push(from);
  }
  if (to) {
    filters.push(`COALESCE(h.last_work_date, a.due_date, a.start_date, a.created_at::date) <= $${i++}`);
    vals.push(to);
  }

  let sql = `SELECT
      a.id,
      a.title,
      a.description,
      a.billable,
      a.estimated_hours,
      a.start_date,
      a.due_date,
      COALESCE(a.client_id, p.client_id) AS client_id,
      c.legal_name AS client_name,
      p.code AS project_code,
      p.name AS project_name,
      COALESCE(p.hourly_rate, c.default_rate, 0) AS hourly_rate,
      h.total_minutes,
      h.last_work_date
    FROM activities a
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN clients c ON c.id = COALESCE(a.client_id, p.client_id)
    LEFT JOIN (
      SELECT activity_id, SUM(duration_minutes) AS total_minutes, MAX(work_date) AS last_work_date
      FROM time_entries
      WHERE activity_id IS NOT NULL
      GROUP BY activity_id
    ) h ON h.activity_id = a.id
    WHERE a.status <> 'cancelada'`;
  if (filters.length) sql += ' AND ' + filters.join(' AND ');
  sql += ` ORDER BY COALESCE(h.last_work_date, a.due_date, a.start_date, a.created_at::date), a.created_at`;
  const r = await query(sql, vals);
  return r.rows;
}

async function getReportClientInfo(rid: string | null, client_id?: string, rows: any[] = []) {
  const id = rid || client_id || null;
  if (id) {
    const r = await query(
      `SELECT legal_name, client_type, id_type, id_number, contact_name, email, billing_email, phone, address, city, country, default_rate
       FROM clients WHERE id = $1`,
      [id]
    );
    if (r.rows[0]) return r.rows[0];
  }

  const names = Array.from(new Set(rows.map((r: any) => r.client_name).filter(Boolean)));
  if (names.length === 1) return { legal_name: names[0] };
  return { legal_name: names.length > 1 ? 'Varios clientes' : 'Sin cliente asignado' };
}

function excelSerialDate(value: any): Date | null {
  if (!value) return null;
  return new Date(value);
}

function reportDateLabel(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function clientTypeLabel(value?: string) {
  if (value === 'natural') return 'Natural';
  if (value === 'juridica') return 'Jurídica';
  return 'N/A';
}

function applyThinBorders(ws: ExcelJS.Worksheet, range: string) {
  const [start, end] = range.split(':');
  const startCell = ws.getCell(start);
  const endCell = ws.getCell(end);
  const startRow = Number(startCell.row);
  const endRow = Number(endCell.row);
  const startCol = Number(startCell.col);
  const endCol = Number(endCell.col);
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      ws.getCell(row, col).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
  }
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

// Exportación tipo cuenta de servicios desde actividades
router.get(
  '/activities/services-excel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const rows = await getActivityServiceRows(
      rid,
      req.query.from as string,
      req.query.to as string,
      req.query.client_id as string
    );
    const clientInfo = await getReportClientInfo(rid, req.query.client_id as string, rows);
    const defaultRate = Number(req.query.rate || 120000);
    const assistanceType = String(req.query.assistance || 'Remoto');
    const from = req.query.from as string;
    const to = req.query.to as string;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Consultoría Control';
    wb.created = new Date();
    const ws = wb.addWorksheet('Reporte servicios', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 9 }]
    });

    ws.columns = [
      { key: 'blank', width: 4 },
      { key: 'item', width: 11 },
      { key: 'description', width: 58 },
      { key: 'type', width: 18 },
      { key: 'qty', width: 10 },
      { key: 'cost_center', width: 20 },
      { key: 'date', width: 13 },
      { key: 'unit', width: 12 },
      { key: 'unit_value', width: 15 },
      { key: 'total_value', width: 17 }
    ];

    ws.mergeCells('B1:J1');
    ws.getCell('B1').value = 'REPORTE DE SERVICIOS POR ACTIVIDADES';
    ws.getCell('B1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF595959' } };
    ws.getRow(1).height = 24;

    const periodLabel = `${from ? reportDateLabel(from) : 'Inicio'} a ${to ? reportDateLabel(to) : 'Hoy'}`;
    ws.getCell('B2').value = 'Cliente';
    ws.getCell('C2').value = clientInfo.legal_name || 'Sin cliente asignado';
    ws.getCell('F2').value = 'Periodo';
    ws.getCell('G2').value = periodLabel;
    ws.getCell('B3').value = 'Tipo cliente';
    ws.getCell('C3').value = clientTypeLabel(clientInfo.client_type);
    ws.getCell('F3').value = 'Identificación';
    ws.getCell('G3').value = [clientInfo.id_type, clientInfo.id_number].filter(Boolean).join(' ') || 'N/A';
    ws.getCell('B4').value = 'Contacto';
    ws.getCell('C4').value = clientInfo.contact_name || 'N/A';
    ws.getCell('F4').value = 'Teléfono';
    ws.getCell('G4').value = clientInfo.phone || 'N/A';
    ws.getCell('B5').value = 'Correo';
    ws.getCell('C5').value = clientInfo.email || 'N/A';
    ws.getCell('F5').value = 'Correo facturación';
    ws.getCell('G5').value = clientInfo.billing_email || clientInfo.email || 'N/A';
    ws.getCell('B6').value = 'Dirección';
    ws.getCell('C6').value = [clientInfo.address, clientInfo.city, clientInfo.country].filter(Boolean).join(', ') || 'N/A';
    ws.getCell('F6').value = 'Tarifa base';
    ws.getCell('G6').value = Number(clientInfo.default_rate || defaultRate || 0) || 'N/A';
    ws.getCell('B7').value = 'Generado';
    ws.getCell('C7').value = new Date();
    ws.mergeCells('C2:E2');
    ws.mergeCells('C3:E3');
    ws.mergeCells('C4:E4');
    ws.mergeCells('C5:E5');
    ws.mergeCells('C6:E6');
    ws.mergeCells('C7:E7');
    ws.mergeCells('G2:J2');
    ws.mergeCells('G3:J3');
    ws.mergeCells('G4:J4');
    ws.mergeCells('G5:J5');
    ws.mergeCells('G6:J6');
    for (const cell of ['B2', 'F2', 'B3', 'F3', 'B4', 'F4', 'B5', 'F5', 'B6', 'F6', 'B7']) {
      ws.getCell(cell).font = { name: 'Arial', size: 11, bold: true };
      ws.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
    }
    for (let row = 2; row <= 7; row++) {
      for (let col = 2; col <= 10; col++) {
        ws.getCell(row, col).border = {
          top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
        };
        ws.getCell(row, col).alignment = { vertical: 'middle' };
      }
    }
    ws.getCell('G6').numFmt = '"$" #,##0;-"$" #,##0;"$" -';
    ws.getCell('C7').numFmt = 'dd/mm/yyyy hh:mm';

    const headerRow = 9;
    ws.getRow(headerRow).values = [
      null,
      'Item No',
      'Descripción',
      'Tipo de asistencia',
      'Cant',
      'Centro de costos',
      'Fecha',
      'Unidad',
      'Vr Unit (COP)',
      'Vr Total (COP)'
    ];
    ws.getRow(headerRow).height = 22;
    ws.getRow(headerRow).font = { name: 'Arial', size: 12, bold: true };
    ws.getRow(headerRow).alignment = { horizontal: 'center', vertical: 'middle' };

    const sectionRow = headerRow + 1;
    ws.mergeCells(`B${sectionRow}:J${sectionRow}`);
    ws.getCell(`B${sectionRow}`).value = 'Servicios';
    ws.getCell(`B${sectionRow}`).font = { name: 'Arial', size: 12, bold: true };
    ws.getCell(`B${sectionRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`B${sectionRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA6A6A6' } };

    const firstDataRow = sectionRow + 1;
    const dataRows = Math.max(rows.length, 1);
    let totalQuantity = 0;
    let totalServices = 0;
    for (let idx = 0; idx < dataRows; idx++) {
      const rowNumber = firstDataRow + idx;
      const source: any = rows[idx];
      const quantity = source
        ? Math.round(((Number(source.total_minutes || 0) / 60) || Number(source.estimated_hours || 0)) * 100) / 100
        : null;
      const rate = source ? Number(source.hourly_rate || defaultRate || 0) : defaultRate;
      if (source && quantity) {
        totalQuantity += quantity;
        totalServices += quantity * rate;
      }
      ws.getRow(rowNumber).values = [
        null,
        source ? idx + 1 : null,
        source?.title || 'Sin actividades en el periodo seleccionado',
        source ? assistanceType : null,
        quantity || null,
        source?.project_code || null,
        excelSerialDate(source?.last_work_date || source?.due_date || source?.start_date),
        source ? 'Hora' : null,
        source ? rate : null,
        source ? { formula: `E${rowNumber}*I${rowNumber}`, result: quantity ? quantity * rate : 0 } : null
      ];
      ws.getRow(rowNumber).font = { name: 'Arial', size: 12 };
      ws.getCell(rowNumber, 3).alignment = { horizontal: 'left' };
      for (const col of [2, 4, 5, 6, 7, 8]) ws.getCell(rowNumber, col).alignment = { horizontal: 'center' };
    }

    const totalQtyRow = firstDataRow + dataRows + 1;
    const subtotalRow = totalQtyRow + 1;
    const totalRow = subtotalRow + 1;

    ws.getCell(`D${totalQtyRow}`).value = 'Total cantidad';
    ws.getCell(`E${totalQtyRow}`).value = {
      formula: `SUM(E${firstDataRow}:E${firstDataRow + dataRows - 1})`,
      result: totalQuantity
    };
    ws.getCell(`B${subtotalRow}`).value = 'Subtotal Servicios';
    ws.getCell(`H${subtotalRow}`).value = 'Hora';
    ws.getCell(`J${subtotalRow}`).value = {
      formula: `SUM(J${firstDataRow}:J${firstDataRow + dataRows - 1})`,
      result: totalServices
    };
    ws.getCell(`B${totalRow}`).value = 'Sumatoria Total Servicios';
    ws.getCell(`J${totalRow}`).value = { formula: `J${subtotalRow}`, result: totalServices };

    for (const row of [totalQtyRow, subtotalRow, totalRow]) {
      ws.getCell(`B${row}`).font = { name: 'Arial', size: 12, bold: true };
      ws.getCell(`D${row}`).font = { name: 'Arial', size: 12, bold: true };
      ws.getCell(`E${row}`).font = { name: 'Arial', size: 12, bold: true };
      ws.getCell(`J${row}`).font = { name: 'Arial', size: 12, bold: true };
    }

    const lastRow = totalRow;
    applyThinBorders(ws, `B${headerRow}:J${lastRow}`);
    for (let row = headerRow; row <= lastRow; row++) {
      ws.getRow(row).height = 20;
      for (let col = 2; col <= 10; col++) {
        const cell = ws.getCell(row, col);
        cell.font = cell.font || { name: 'Arial', size: 12 };
        cell.alignment = cell.alignment || { vertical: 'middle' };
      }
    }
    for (const col of ['I', 'J']) ws.getColumn(col).numFmt = '"$" #,##0;-"$" #,##0;"$" -';
    ws.getColumn('G').numFmt = 'dd/mm/yyyy';
    ws.getColumn('E').numFmt = '0';
    ws.getRow(headerRow).font = { name: 'Arial', size: 12, bold: true };
    ws.getRow(subtotalRow).font = { name: 'Arial', size: 12, bold: true };
    ws.getRow(totalRow).font = { name: 'Arial', size: 12, bold: true };
    ws.getRow(totalRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_servicios_actividades.xlsx"');
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

/* Reportes: el back regresa columnas + renglones y aquí se arma el archivo (CSV, Excel o PDF).
   Las librerías de Excel y PDF viven en /vendor y se cargan sólo la primera vez que se usan. */
import { api, esc, toast } from '/js/api.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TZ = 'America/Mexico_City';
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const FORMATS = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };

let me, branches, list = null, period = 'month';

export async function loadReports(user, branchList) {
  me = user; branches = branchList;
  const view = $('#v-reports');
  if (!view.dataset.bound) bind(view);
  if (!list) {
    try { list = await api.reports(); } catch (err) { toast(err.message, 'error'); return; }
    render();
  }
  paintPeriod();
}

function bind(view) {
  view.dataset.bound = '1';
  const sel = $('.r-branch');
  const opts = branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  sel.innerHTML = me.branch ? opts : `<option value="">Todas las sucursales</option>${opts}`;
  sel.hidden = Boolean(me.branch);
  $$('.r-period [data-p]').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.p;
    $$('.r-period [data-p]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('.r-range').hidden = period !== 'range';
    if (period === 'range' && !$('.r-from').value) {
      $('.r-to').value = iso(new Date());
      $('.r-from').value = iso(new Date(Date.now() - 29 * 864e5));
    }
    paintPeriod();
  }));
  $$('.r-from, .r-to').forEach((i) => i.addEventListener('change', paintPeriod));
  $('#reports').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]');
    if (b) download(b.dataset.key, b.dataset.fmt, b);
  });
}

function render() {
  const groups = [...new Set(list.map((r) => r.group))];
  $('#reports').innerHTML = groups.map((g) => `
    <h2 class="h2">${esc(g)}</h2>
    <div class="r-grid">${list.filter((r) => r.group === g).map((r) => `
      <article class="card r-card">
        <div class="r-info">
          <h3>${esc(r.title)}</h3>
          <p>${esc(r.description)}</p>
          <small class="r-when ${r.dated ? 'dated' : ''}">${r.dated ? '' : 'Al momento · no usa el periodo'}</small>
        </div>
        <div class="r-btns">${Object.entries(FORMATS).map(([f, label]) => `
          <button type="button" class="btn btn-outline btn-sm r-${f}" data-key="${r.key}" data-fmt="${f}">${label}</button>`).join('')}
        </div>
      </article>`).join('')}
    </div>`).join('');
}

/* ---------- filtros ---------- */
function range() {
  const today = new Date();
  const to = iso(today);
  if (period === 'today') return { from: to, to };
  if (period === '7d') return { from: iso(new Date(today.getTime() - 6 * 864e5)), to };
  if (period === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  if (period === 'last') {
    return { from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  if (period === 'range') return { from: $('.r-from').value, to: $('.r-to').value };
  return { from: '', to: '' };   // todo
}

const dmy = (s) => s.split('-').reverse().join('/');
function periodText() {
  const { from, to } = range();
  if (!from && !to) return 'Todo el historial';
  if (from === to) return dmy(from);
  return `${from ? dmy(from) : 'inicio'} al ${to ? dmy(to) : 'hoy'}`;
}
function branchText() {
  if (me.branch) return me.branch.name;
  const v = $('.r-branch').value;
  return v ? branches.find((b) => String(b.id) === v)?.name : 'Todas las sucursales';
}
function paintPeriod() {
  $$('#reports .r-when.dated').forEach((el) => { el.textContent = `Periodo: ${periodText()}`; });
}

/* ---------- descarga ---------- */
async function download(key, fmt, btn) {
  const { from, to } = range();
  if (from && to && from > to) return toast('La fecha inicial es posterior a la final.', 'error');
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const b = $('.r-branch').value;
  if (b) qs.set('branch', b);

  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Generando…';
  try {
    const rep = await api.report(key, qs);
    if (!rep.rows.length) { toast('No hay datos para ese periodo y sucursal.', 'error'); return; }
    const meta = {
      period: rep.dated ? periodText() : `Al ${new Date().toLocaleDateString('es-MX', { timeZone: TZ })}`,
      branch: branchText(),
      file: `miky_${key}_${rep.dated && (from || to) ? `${from || 'inicio'}_${to || 'hoy'}` : iso(new Date())}`,
    };
    if (fmt === 'csv') toCsv(rep, meta);
    else if (fmt === 'xlsx') await toXlsx(rep, meta);
    else await toPdf(rep, meta);
    toast(`${rep.title}: ${rep.rows.length} ${rep.rows.length === 1 ? 'renglón' : 'renglones'}${rep.truncated ? ' (límite alcanzado, acota el periodo)' : ''}.`);
  } catch (err) {
    toast(err.message || 'No se pudo generar el reporte.', 'error');
  } finally { btn.disabled = false; btn.textContent = label; }
}

/* fechas en hora de México, como las ve la sucursal */
const parts = (v) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date(v)).map((p) => [p.type, p.value]));
function text(v, type) {
  if (v == null || v === '') return '';
  if (type === 'datetime') { const p = parts(v); return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`; }
  if (type === 'date') return dmy(String(v).slice(0, 10));
  if (type === 'money') return Number(v).toFixed(2);
  return String(v);
}
const pesos = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function totalsRow(rep, fmt) {
  if (!rep.totals) return null;
  const first = rep.columns.findIndex((c) => !c.sum);
  return rep.totals.map((t, i) => (t == null ? (i === first ? 'Total' : '') : fmt(t, rep.columns[i].type)));
}

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function toCsv(rep, meta) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [rep.columns.map((c) => cell(c.label)).join(',')];
  for (const row of rep.rows) lines.push(row.map((v, i) => cell(text(v, rep.columns[i].type))).join(','));
  const tot = totalsRow(rep, (t, type) => text(t, type));
  if (tot) lines.push(tot.map(cell).join(','));
  // BOM para que Excel respete los acentos
  save(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${meta.file}.csv`);
}

/* ---------- Excel ---------- */
const scripts = {};
function script(src) {
  scripts[src] ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => { delete scripts[src]; fail(new Error('No se pudo cargar el generador. Revisa tu conexión.')); };
    document.head.append(s);
  });
  return scripts[src];
}

// Excel guarda la fecha sin zona: se le da la hora de México como hora local
function excelDate(v, type) {
  if (v == null || v === '') return null;
  if (type === 'date') { const [y, m, d] = String(v).slice(0, 10).split('-'); return new Date(+y, m - 1, +d); }
  const p = parts(v);
  return new Date(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
}
const XLSX_FMT = { money: '"$"#,##0.00', int: '#,##0', date: 'dd/mm/yyyy', datetime: 'dd/mm/yyyy hh:mm' };

async function toXlsx(rep, meta) {
  await script('/vendor/xlsx.full.min.js');
  const X = window.XLSX;
  const cols = rep.columns;
  const head = [[rep.title], [`${meta.branch} · ${meta.period}`], [], cols.map((c) => c.label)];
  const body = rep.rows.map((row) => row.map((v, i) => (
    cols[i].type === 'date' || cols[i].type === 'datetime' ? excelDate(v, cols[i].type) : v ?? '')));
  const tot = totalsRow(rep, (t) => t);
  const ws = X.utils.aoa_to_sheet([...head, ...body, ...(tot ? [tot] : [])], { cellDates: true });

  const first = head.length;   // primer renglón de datos (base 0)
  const last = first + body.length + (tot ? 1 : 0);
  cols.forEach((c, ci) => {
    if (!XLSX_FMT[c.type]) return;
    for (let r = first; r < last; r++) {
      const cell = ws[X.utils.encode_cell({ r, c: ci })];
      if (cell && cell.t !== 's') cell.z = XLSX_FMT[c.type];
    }
  });
  ws['!cols'] = cols.map((c, ci) => ({
    wch: Math.min(45, Math.max(c.label.length + 2, c.type === 'datetime' ? 17 : 10,
      ...rep.rows.slice(0, 300).map((row) => text(row[ci], c.type).length + 2))),
  }));
  ws['!autofilter'] = { ref: X.utils.encode_range({ r: first - 1, c: 0 }, { r: first + body.length - 1, c: cols.length - 1 }) };

  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, rep.title.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
  wb.Props = { Title: rep.title, Author: 'Pastelerías Miky' };
  X.writeFile(wb, `${meta.file}.xlsx`, { compression: true });
}

/* ---------- PDF ---------- */
let logo;
async function logoPng() {
  if (logo !== undefined) return logo;
  try {
    const img = new Image();
    img.src = '/img/logo.webp';
    await img.decode();
    // se reduce a 300 px: el PDF sólo lo pinta a ~70 pt y así pesa unos KB
    const c = document.createElement('canvas');
    c.width = Math.min(300, img.naturalWidth);
    c.height = Math.round(c.width * img.naturalHeight / img.naturalWidth);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    logo = { data: c.toDataURL('image/png'), ratio: img.naturalHeight / img.naturalWidth };
  } catch { logo = null; }
  return logo;
}

async function toPdf(rep, meta) {
  await script('/vendor/jspdf.umd.min.js');
  await script('/vendor/jspdf.plugin.autotable.min.js');
  const { jsPDF } = window.jspdf;
  const cols = rep.columns;
  const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;
  const coral = [229, 121, 95], ink = [64, 50, 47], muted = [138, 123, 117];
  const fmt = (v, type) => (v == null || v === '' ? '' : type === 'money' ? pesos(v) : type === 'int' ? Number(v).toLocaleString('es-MX') : text(v, type));

  const lg = await logoPng();
  if (lg) doc.addImage(lg.data, 'PNG', M, M - 6, 70, 70 * lg.ratio);
  doc.setTextColor(...ink).setFont('helvetica', 'bold').setFontSize(16).text(rep.title, lg ? M + 84 : M, M + 10);
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...muted);
  doc.text(`${meta.branch}  ·  ${meta.period}`, lg ? M + 84 : M, M + 26);
  const when = new Date().toLocaleString('es-MX', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
  doc.text(`Generado el ${when} por ${me.name}`, W - M, M + 10, { align: 'right' });
  doc.text(`${rep.rows.length} ${rep.rows.length === 1 ? 'renglón' : 'renglones'}`, W - M, M + 26, { align: 'right' });

  const right = Object.fromEntries(cols.map((c, i) => [i, c.type === 'money' || c.type === 'int' ? { halign: 'right' } : {}]));
  const tot = totalsRow(rep, fmt);
  doc.autoTable({
    startY: M + 50,
    margin: { left: M, right: M, bottom: 34 },
    head: [cols.map((c) => c.label)],
    body: rep.rows.map((row) => row.map((v, i) => fmt(v, cols[i].type))),
    foot: tot ? [tot] : undefined,
    showFoot: 'lastPage',
    styles: { font: 'helvetica', fontSize: cols.length > 9 ? 7 : 8, cellPadding: 4, textColor: ink, lineColor: [230, 221, 213], lineWidth: 0.4, overflow: 'linebreak' },
    headStyles: { fillColor: coral, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [251, 227, 218], textColor: ink, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 247, 243] },
    columnStyles: right,
    didParseCell: (d) => { if ((d.section === 'head' || d.section === 'foot') && right[d.column.index]?.halign) d.cell.styles.halign = 'right'; },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(...muted);
    doc.text('Pastelerías Miky', M, doc.internal.pageSize.getHeight() - 18);
    doc.text(`Página ${i} de ${pages}`, W - M, doc.internal.pageSize.getHeight() - 18, { align: 'right' });
  }
  doc.save(`${meta.file}.pdf`);
}

const supabase = require('./supabase');
const { extraerFechaDate } = require('./helpers');

const INVENTARIO_FIELDS = [
  'FECHA', 'OPER', 'NUMERO', 'VR PR', 'VR RT', 'NOMBRE', 'CC', 'ART',
  'DESCRIPCION', 'LLEVAR', 'VR IN', 'TOT IN', 'FECHA INT', 'VR AB',
  'FECHA ABON', 'ESPERA', 'RETIROS', 'FECHA RETIRO', 'DES', 'AUMENTO',
  'FECHA AU', 'TOTAL', 'UTIL'
];

function toCajaFecha(fechaISO) {
  return `${extraerFechaDate(fechaISO)}T00:00:00Z`;
}

function toUpper(value, fallback = '') {
  return (value || fallback).toString().toUpperCase().trim();
}

function toNumber(value, fallback = 0) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(num);
}

function buildLoosePattern(texto) {
  return texto
    .split('')
    .filter(Boolean)
    .join('%');
}

function formatDetalle(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}:${value}`)
    .join(' - ');
}

function calcularUtil(vrPr, vrRt) {
  return toNumber(vrRt) - toNumber(vrPr);
}

function calcularTotal(row) {
  return (
    toNumber(row['VR RT']) +
    toNumber(row['TOT IN']) -
    toNumber(row['VR AB']) -
    toNumber(row.DES)
  );
}

async function getInventarioByNumero(numero) {
  const { data, error } = await supabase
    .from('INVENTARIO')
    .select('*')
    .eq('NUMERO', numero)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function numeroExisteGlobal(numero) {
  const checks = await Promise.all([
    supabase.from('INVENTARIO').select('NUMERO').eq('NUMERO', numero).maybeSingle(),
    supabase.from('SALIDAS').select('NUMERO').eq('NUMERO', numero).maybeSingle(),
    supabase.from('VENDIDO').select('NUMERO').eq('NUMERO', numero).maybeSingle()
  ]);

  return checks.some(({ data }) => !!data);
}

function pickInventarioRow(row, overrides = {}) {
  const base = {};
  for (const field of INVENTARIO_FIELDS) {
    base[field] = row[field] ?? null;
  }
  return { ...base, ...overrides };
}

async function upsertCajaDelta(fechaISO, turno, campo, valor) {
  const fechaCaja = toCajaFecha(fechaISO);

  await supabase
    .from('CAJA')
    .upsert({ FECHA: fechaCaja, TURNO: turno }, { onConflict: 'FECHA,TURNO' });

  const { data: row, error: rowError } = await supabase
    .from('CAJA')
    .select('*')
    .eq('FECHA', fechaCaja)
    .eq('TURNO', turno)
    .single();

  if (rowError) throw rowError;

  const nuevoValor = toNumber(row[campo]) + toNumber(valor);

  const { error } = await supabase
    .from('CAJA')
    .update({ [campo]: nuevoValor })
    .eq('FECHA', fechaCaja)
    .eq('TURNO', turno);

  if (error) throw error;
}

async function setCajaBase(fechaISO, turno, valor) {
  const fechaCaja = toCajaFecha(fechaISO);

  const { error } = await supabase
    .from('CAJA')
    .upsert({ FECHA: fechaCaja, TURNO: turno, BASE: toNumber(valor) }, { onConflict: 'FECHA,TURNO' });

  if (error) throw error;
}

async function getCaja(fechaISO, turno) {
  const fechaCaja = toCajaFecha(fechaISO);
  const { data, error } = await supabase
    .from('CAJA')
    .select('*')
    .eq('FECHA', fechaCaja)
    .eq('TURNO', turno)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function insertHistorial({
  fecha,
  oper,
  tipo,
  numero = null,
  nombre = '',
  cc = '',
  art = '',
  descripcion = '',
  valor = null,
  detalle = ''
}) {
  const { error } = await supabase.from('HISTORIAL').insert({
    FECHA: fecha,
    OPER: oper || '',
    TIPO: tipo,
    NUMERO: numero,
    NOMBRE: nombre || '',
    CC: cc || '',
    ART: art || '',
    DESCRIPCION: descripcion || '',
    VALOR: valor,
    DETALLE: formatDetalle(detalle)
  });

  if (error) throw error;
}

async function syncRetirosFromInventario(row) {
  const needsRetiro = ['RETIRAR', 'RETIRAR, MAÑANA', 'MAÑANA'].includes((row['RETIROS'] || '').toString().toUpperCase());

  if (!needsRetiro) {
    const { error } = await supabase.from('RETIROS').delete().eq('NUMERO', row['NUMERO']);
    if (error) throw error;
    return;
  }

  const payload = pickInventarioRow(row);
  const { error } = await supabase
    .from('RETIROS')
    .upsert(payload, { onConflict: 'NUMERO' });

  if (error) throw error;
}

async function removeRetiro(numero) {
  const { error } = await supabase.from('RETIROS').delete().eq('NUMERO', numero);
  if (error) throw error;
}

module.exports = {
  INVENTARIO_FIELDS,
  toCajaFecha,
  toUpper,
  toNumber,
  buildLoosePattern,
  formatDetalle,
  calcularUtil,
  calcularTotal,
  getInventarioByNumero,
  numeroExisteGlobal,
  pickInventarioRow,
  upsertCajaDelta,
  setCajaBase,
  getCaja,
  insertHistorial,
  syncRetirosFromInventario,
  removeRetiro
};

// Handler EDITAR
//
// Permite listar las operaciones de un turno+tipo+dia desde HISTORIAL y
// aplicar una edicion sobre la fila origen (INVENTARIO / SALIDAS /
// BAR / GUARDADERO / GASTOS / CAJA), ajustando CAJA con la diferencia
// (delta) y dejando un registro adicional en HISTORIAL con tipo
// EDICION_<TIPO> para auditoria.

const supabase = require('../supabase');
const { parsearFecha, ahoraISO } = require('../helpers');
const {
  getInventarioByNumero,
  upsertCajaDelta,
  insertHistorial,
  syncRetirosFromInventario,
  removeRetiro,
  calcularUtil,
  calcularTotal,
  toUpper,
  toNumber,
  toCajaFecha
} = require('../db');
const { leerBody } = require('../read_body');

// Tipos que el frontend puede editar (todos menos BUSCAR, VENTAS,
// CONTROL, VERIFICAR, TABLAS).
const TIPOS_EDITABLES = new Set([
  'INGRESO', 'ABONO', 'INTERESES', 'RETIROS', 'SALIDA',
  'DEVOLUCION', 'AUMENTO', 'DESCUENTO', 'GUARDADERO',
  'BAR', 'GASTOS', 'CAJA'
]);

// Mapeo de tipo visible -> tipo guardado en HISTORIAL.
// El usuario ve "RETIROS" pero los handlers lo escriben como
// PEDIR_SIN_PAGAR.
const TIPO_HISTORIAL = {
  RETIROS: 'PEDIR_SIN_PAGAR'
};

function leerParam(req, body, nombre) {
  if (body && body[nombre] !== undefined) return body[nombre];
  if (req && req.query && req.query[nombre] !== undefined) return req.query[nombre];
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const v = url.searchParams.get(nombre);
    if (v !== null) return v;
  } catch (_) {}
  return null;
}

// --------------------------------------------------------------
// LISTADO
// --------------------------------------------------------------
async function listarOperaciones({ turno, tipo, fechaStr, desdeISO, hastaISO }) {
  // Si el frontend manda desde/hasta (ISO completos calculados desde la
  // hora local del navegador) los usamos tal cual. Asi no se pierden
  // operaciones por la diferencia entre la fecha UTC y la fecha local.
  let desde, hasta;
  if (desdeISO && hastaISO) {
    desde = desdeISO;
    hasta = hastaISO;
  } else {
    const fechaBase = (fechaStr && fechaStr.length >= 10)
      ? fechaStr.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    desde = `${fechaBase}T00:00:00Z`;
    hasta = `${fechaBase}T23:59:59Z`;
  }

  const tipoHist = TIPO_HISTORIAL[tipo] || tipo;

  const { data, error } = await supabase
    .from('HISTORIAL')
    .select('*')
    .eq('OPER', String(turno))
    .eq('TIPO', tipoHist)
    .gte('FECHA', desde)
    .lte('FECHA', hasta)
    .order('FECHA', { ascending: false });

  if (error) throw error;
  return { ok: true, rows: data || [] };
}

// --------------------------------------------------------------
// HELPERS comunes para las ediciones
// --------------------------------------------------------------
function delta(antes, despues) {
  return toNumber(despues) - toNumber(antes);
}

async function ajustarCaja(fechaOrigISO, turnoOrig, campo, deltaValor) {
  if (!deltaValor) return;
  await upsertCajaDelta(fechaOrigISO, turnoOrig, campo, deltaValor);
}

async function registrarEdicion({ tipoOriginal, original, resumenCambios, valorAhora }) {
  await insertHistorial({
    fecha: ahoraISO(),
    oper: original.OPER || '',
    tipo: `EDICION_${tipoOriginal}`,
    numero: original.NUMERO || null,
    nombre: original.NOMBRE || '',
    cc: original.CC || '',
    art: original.ART || '',
    descripcion: original.DESCRIPCION || '',
    valor: valorAhora ?? null,
    detalle: resumenCambios
  });
}

// --------------------------------------------------------------
// EDITORES POR TIPO
// --------------------------------------------------------------

async function editarIngreso(original, nuevo) {
  const numero = parseInt(original.NUMERO, 10);
  if (!numero) throw new Error('La operacion original no tiene NUMERO');

  const empe = await getInventarioByNumero(numero);
  if (!empe) throw new Error(`Articulo ${numero} no existe en INVENTARIO`);

  const vrPrAntes = toNumber(empe['VR PR']);
  const vrRtAntes = toNumber(empe['VR RT']);
  const vrPrNuevo = toNumber(nuevo['VALOR (ING) '] ?? nuevo.valor_ing ?? vrPrAntes);
  const vrRtNuevo = toNumber(nuevo['V RETIRO(ING) '] ?? nuevo.v_retiro_ing ?? vrRtAntes);

  const updates = {
    'VR PR': vrPrNuevo,
    'VR RT': vrRtNuevo,
    NOMBRE: toUpper(nuevo['NOMBRE COMPLETO(ING) '] ?? empe.NOMBRE),
    CC: (nuevo['CEDULA(ING) '] ?? empe.CC ?? '').toString().trim(),
    ART: toUpper(nuevo['ART(ING)'] ?? empe.ART),
    DESCRIPCION: toUpper(nuevo.DESCRIPCION ?? empe.DESCRIPCION, 'NULO'),
    LLEVAR: toUpper(nuevo.LLEVAR ?? empe.LLEVAR)
  };
  updates.UTIL = calcularUtil(updates['VR PR'], updates['VR RT']);
  const futuro = { ...empe, ...updates };
  updates.TOTAL = calcularTotal(futuro);

  const { error } = await supabase
    .from('INVENTARIO')
    .update(updates)
    .eq('NUMERO', numero);
  if (error) throw error;

  // Caja: ajustar CONTRATOS por la diferencia del VR PR.
  await ajustarCaja(original.FECHA, original.OPER, 'CONTRATOS', delta(vrPrAntes, vrPrNuevo));

  await registrarEdicion({
    tipoOriginal: 'INGRESO',
    original,
    valorAhora: vrPrNuevo,
    resumenCambios: {
      'VR PR_ANT': vrPrAntes, 'VR PR_NEW': vrPrNuevo,
      'VR RT_ANT': vrRtAntes, 'VR RT_NEW': vrRtNuevo,
      NOMBRE: updates.NOMBRE, CC: updates.CC, ART: updates.ART
    }
  });
}

async function editarAbono(original, nuevo) {
  const numero = parseInt(original.NUMERO, 10);
  const empe = await getInventarioByNumero(numero);
  if (!empe) throw new Error(`Articulo ${numero} no existe en INVENTARIO`);

  const abonoAntes = toNumber(original.VALOR);
  const abonoNuevo = toNumber(nuevo.ABONO ?? nuevo.abono ?? abonoAntes);
  const desAntes = toNumber(empe.DES);
  const desNuevo = toNumber(nuevo['DESCUENTO(ABO)'] ?? nuevo.descuento ?? desAntes);
  const retiroNuevo = (nuevo['RETIRO(ABO)'] ?? '').toString().toUpperCase().trim();

  const dAbono = delta(abonoAntes, abonoNuevo);
  const dDes = delta(desAntes, desNuevo);

  const updates = {
    'VR AB': toNumber(empe['VR AB']) + dAbono,
    DES: desNuevo
  };
  if (retiroNuevo) {
    updates.RETIROS = retiroNuevo;
    updates['FECHA RETIRO'] = ahoraISO();
  }

  const futuro = { ...empe, ...updates };
  updates.TOTAL = calcularTotal(futuro);

  const { error } = await supabase
    .from('INVENTARIO')
    .update(updates)
    .eq('NUMERO', numero);
  if (error) throw error;

  // CAJA RETIRO se llevo abono + descuento? Original solo abono.
  await ajustarCaja(original.FECHA, original.OPER, 'RETIRO', dAbono);

  await syncRetirosFromInventario(futuro);

  await registrarEdicion({
    tipoOriginal: 'ABONO',
    original,
    valorAhora: abonoNuevo,
    resumenCambios: {
      ABONO_ANT: abonoAntes, ABONO_NEW: abonoNuevo,
      DES_ANT: desAntes, DES_NEW: desNuevo,
      RETIRO: retiroNuevo
    }
  });
}

async function editarIntereses(original, nuevo) {
  const numero = parseInt(original.NUMERO, 10);
  const empe = await getInventarioByNumero(numero);
  if (!empe) throw new Error(`Articulo ${numero} no existe en INVENTARIO`);

  const intAntes = toNumber(original.VALOR);
  const intNuevo = toNumber(nuevo.intereses ?? nuevo.INTERESES ?? intAntes);
  const d = delta(intAntes, intNuevo);

  const updates = {
    'VR IN': toNumber(empe['VR IN']) + d,
    'TOT IN': toNumber(empe['TOT IN']) + d
  };
  const futuro = { ...empe, ...updates };
  updates.TOTAL = calcularTotal(futuro);

  const { error } = await supabase
    .from('INVENTARIO')
    .update(updates)
    .eq('NUMERO', numero);
  if (error) throw error;

  await ajustarCaja(original.FECHA, original.OPER, 'RETIRO', d);

  await registrarEdicion({
    tipoOriginal: 'INTERESES',
    original,
    valorAhora: intNuevo,
    resumenCambios: { INT_ANT: intAntes, INT_NEW: intNuevo }
  });
}

async function editarAumento(original, nuevo) {
  const numero = parseInt(original.NUMERO, 10);
  const empe = await getInventarioByNumero(numero);
  if (!empe) throw new Error(`Articulo ${numero} no existe en INVENTARIO`);

  const aumAntes = toNumber(original.VALOR);
  const aumNuevo = toNumber(nuevo.aumento ?? nuevo.AUMENTO ?? aumAntes);
  const d = delta(aumAntes, aumNuevo);

  const updates = {
    'VR PR': toNumber(empe['VR PR']) + d,
    'VR RT': toNumber(empe['VR RT']) + d
  };
  updates.UTIL = calcularUtil(updates['VR PR'], updates['VR RT']);
  const futuro = { ...empe, ...updates };
  updates.TOTAL = calcularTotal(futuro);

  const { error } = await supabase
    .from('INVENTARIO')
    .update(updates)
    .eq('NUMERO', numero);
  if (error) throw error;

  await ajustarCaja(original.FECHA, original.OPER, 'CONTRATOS', d);

  await registrarEdicion({
    tipoOriginal: 'AUMENTO',
    original,
    valorAhora: aumNuevo,
    resumenCambios: { AUM_ANT: aumAntes, AUM_NEW: aumNuevo }
  });
}

async function editarDevolucion(original, nuevo) {
  const numero = parseInt(original.NUMERO, 10);
  const empe = await getInventarioByNumero(numero);
  if (!empe) throw new Error(`Articulo ${numero} no existe en INVENTARIO`);

  const devAntes = toNumber(original.VALOR);
  const devNuevo = toNumber(nuevo.valor ?? nuevo.VALOR ?? devAntes);
  const d = delta(devAntes, devNuevo);

  const updates = {
    'VR AB': toNumber(empe['VR AB']) - d
  };
  const futuro = { ...empe, ...updates };
  updates.TOTAL = calcularTotal(futuro);

  const { error } = await supabase
    .from('INVENTARIO')
    .update(updates)
    .eq('NUMERO', numero);
  if (error) throw error;

  await ajustarCaja(original.FECHA, original.OPER, 'RETIRO', d);

  await registrarEdicion({
    tipoOriginal: 'DEVOLUCION',
    original,
    valorAhora: devNuevo,
    resumenCambios: { DEV_ANT: devAntes, DEV_NEW: devNuevo }
  });
}

async function editarSalida(original, nuevo) {
  const numero = parseInt(original.NUMERO, 10);

  // Buscar la fila en SALIDAS (porque ya fue movida desde INVENTARIO).
  const { data: salidaRow, error: errSel } = await supabase
    .from('SALIDAS')
    .select('*')
    .eq('NUMERO', numero)
    .maybeSingle();
  if (errSel) throw errSel;
  if (!salidaRow) throw new Error(`Articulo ${numero} no encontrado en SALIDAS`);

  const valAntes = toNumber(original.VALOR);
  const valNuevo = toNumber(nuevo.valor ?? nuevo.VALOR ?? valAntes);
  const desAntes = toNumber(salidaRow.DES);
  const desNuevo = toNumber(nuevo.descuento ?? desAntes);
  const d = delta(valAntes, valNuevo);

  const updates = {
    'VR AB': toNumber(salidaRow['VR AB']) + d,
    DES: desNuevo
  };
  const futuro = { ...salidaRow, ...updates };
  updates.TOTAL = calcularTotal(futuro);

  const { error } = await supabase
    .from('SALIDAS')
    .update(updates)
    .eq('NUMERO', numero);
  if (error) throw error;

  await ajustarCaja(original.FECHA, original.OPER, 'RETIRO', d);

  await registrarEdicion({
    tipoOriginal: 'SALIDA',
    original,
    valorAhora: valNuevo,
    resumenCambios: {
      VAL_ANT: valAntes, VAL_NEW: valNuevo,
      DES_ANT: desAntes, DES_NEW: desNuevo
    }
  });
}

async function editarRetiro(original, nuevo) {
  // Tipo "RETIROS" en frontend = PEDIR_SIN_PAGAR en HISTORIAL.
  const numero = parseInt(original.NUMERO, 10);
  const empe = await getInventarioByNumero(numero);
  if (!empe) throw new Error(`Articulo ${numero} no existe en INVENTARIO`);

  const retiroNuevo = (nuevo['RETIRO(PEDIR)'] ?? nuevo.RETIRO ?? '').toString().toUpperCase().trim();

  const updates = {
    RETIROS: retiroNuevo,
    'FECHA RETIRO': ahoraISO()
  };
  const futuro = { ...empe, ...updates };

  const { error } = await supabase
    .from('INVENTARIO')
    .update(updates)
    .eq('NUMERO', numero);
  if (error) throw error;

  await syncRetirosFromInventario(futuro);

  await registrarEdicion({
    tipoOriginal: 'RETIROS',
    original,
    resumenCambios: { RETIROS: retiroNuevo }
  });
}

async function editarBar(original, nuevo) {
  const valAntes = toNumber(original.VALOR);
  const valNuevo = toNumber(nuevo.VALOR ?? nuevo.valor ?? valAntes);
  const d = delta(valAntes, valNuevo);

  // BAR usa (MARCA TEMPORAL, VALOR) como PK natural. Se identifica
  // por la marca temporal exacta y el valor antiguo.
  const { error } = await supabase
    .from('BAR')
    .update({ VALOR: valNuevo })
    .eq('MARCA TEMPORAL', original.FECHA)
    .eq('VALOR', valAntes);
  if (error) throw error;

  await ajustarCaja(original.FECHA, original.OPER, 'BAR', d);

  await registrarEdicion({
    tipoOriginal: 'BAR',
    original,
    valorAhora: valNuevo,
    resumenCambios: { VAL_ANT: valAntes, VAL_NEW: valNuevo }
  });
}

async function editarGuardadero(original, nuevo) {
  const valAntes = toNumber(original.VALOR);
  const valNuevo = toNumber(nuevo.VALOR ?? nuevo.valor ?? valAntes);
  const nombreNuevo = toUpper(nuevo.NOMBRE ?? original.NOMBRE);
  const d = delta(valAntes, valNuevo);

  const { error } = await supabase
    .from('GUARDADERO')
    .update({ VALOR: valNuevo, NOMBRE: nombreNuevo })
    .eq('MARCA TEMPORAL', original.FECHA)
    .eq('VALOR', valAntes);
  if (error) throw error;

  await ajustarCaja(original.FECHA, original.OPER, 'GUARDA', d);

  await registrarEdicion({
    tipoOriginal: 'GUARDADERO',
    original,
    valorAhora: valNuevo,
    resumenCambios: { VAL_ANT: valAntes, VAL_NEW: valNuevo, NOMBRE: nombreNuevo }
  });
}

async function editarGastos(original, nuevo) {
  const valAntes = toNumber(original.VALOR);
  const valNuevo = toNumber(nuevo.VALOR ?? nuevo.valor ?? valAntes);
  const descAntes = (original.DESCRIPCION || '').toString();
  const descNuevo = toUpper(nuevo.DESCRIPCION ?? descAntes);
  const d = delta(valAntes, valNuevo);

  const { error } = await supabase
    .from('GASTOS')
    .update({ VALOR: valNuevo, DESCRIPCION: descNuevo })
    .eq('FECHA', original.FECHA)
    .eq('TURNO', original.OPER)
    .eq('VALOR', valAntes)
    .eq('DESCRIPCION', descAntes);
  if (error) throw error;

  await ajustarCaja(original.FECHA, original.OPER, 'GASTOS', d);

  await registrarEdicion({
    tipoOriginal: 'GASTOS',
    original,
    valorAhora: valNuevo,
    resumenCambios: {
      VAL_ANT: valAntes, VAL_NEW: valNuevo,
      DESC_ANT: descAntes, DESC_NEW: descNuevo
    }
  });
}

async function editarCaja(original, nuevo) {
  // Solo editamos el subtipo BASE (CIERRE no escribe en CAJA).
  const fechaCaja = toCajaFecha(original.FECHA);
  const valNuevo = toNumber(nuevo.VALOR ?? nuevo.valor);

  const { error } = await supabase
    .from('CAJA')
    .update({ BASE: valNuevo })
    .eq('FECHA', fechaCaja)
    .eq('TURNO', original.OPER);
  if (error) throw error;

  await registrarEdicion({
    tipoOriginal: 'CAJA',
    original,
    valorAhora: valNuevo,
    resumenCambios: {
      SUBTIPO: 'BASE',
      VAL_ANT: toNumber(original.VALOR),
      VAL_NEW: valNuevo
    }
  });
}

async function editarDescuento(original, nuevo) {
  // DESCUENTO no es una operacion independiente; queda como
  // tipo placeholder. Si se llega aqui simplemente registramos la
  // edicion sin tocar nada.
  await registrarEdicion({
    tipoOriginal: 'DESCUENTO',
    original,
    resumenCambios: { NOTA: 'Editado manualmente, sin cambios automaticos' }
  });
}

const EDITORES = {
  INGRESO: editarIngreso,
  ABONO: editarAbono,
  INTERESES: editarIntereses,
  AUMENTO: editarAumento,
  DEVOLUCION: editarDevolucion,
  SALIDA: editarSalida,
  RETIROS: editarRetiro,
  BAR: editarBar,
  GUARDADERO: editarGuardadero,
  GASTOS: editarGastos,
  CAJA: editarCaja,
  DESCUENTO: editarDescuento
};

// --------------------------------------------------------------
// HANDLER PRINCIPAL
// --------------------------------------------------------------
module.exports = async (req, res) => {
  try {
    const body = await leerBody(req);
    const accion = leerParam(req, body, 'accion') || 'list';

    if (accion === 'tipos') {
      return res.json({ ok: true, tipos: Array.from(TIPOS_EDITABLES) });
    }

    if (accion === 'list') {
      const turno = leerParam(req, body, 'turno');
      const tipo = (leerParam(req, body, 'tipo') || '').toString().toUpperCase();
      const fechaStr = leerParam(req, body, 'fecha');
      const desdeISO = leerParam(req, body, 'desde');
      const hastaISO = leerParam(req, body, 'hasta');

      if (!turno) return res.status(400).json({ ok: false, error: 'Falta turno' });
      if (!TIPOS_EDITABLES.has(tipo)) {
        return res.status(400).json({ ok: false, error: `Tipo no editable: ${tipo}` });
      }

      const data = await listarOperaciones({ turno, tipo, fechaStr, desdeISO, hastaISO });
      return res.json({ ok: true, ...data, tipo, turno });
    }

    if (accion === 'aplicar') {
      const tipo = (leerParam(req, body, 'tipo') || '').toString().toUpperCase();
      const original = leerParam(req, body, 'original');
      const nuevo = leerParam(req, body, 'nuevo');

      if (!TIPOS_EDITABLES.has(tipo)) {
        return res.status(400).json({ ok: false, error: `Tipo no editable: ${tipo}` });
      }
      if (!original || typeof original !== 'object') {
        return res.status(400).json({ ok: false, error: 'Falta "original"' });
      }
      if (!nuevo || typeof nuevo !== 'object') {
        return res.status(400).json({ ok: false, error: 'Falta "nuevo"' });
      }

      const editor = EDITORES[tipo];
      if (!editor) return res.status(400).json({ ok: false, error: `Sin editor para ${tipo}` });

      await editor(original, nuevo);
      return res.json({ ok: true, mensaje: 'EDICION APLICADA' });
    }

    return res.status(400).json({ ok: false, error: `Accion desconocida: ${accion}` });
  } catch (err) {
    console.error('Error EDITAR:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};

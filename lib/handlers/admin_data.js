const supabase = require('../supabase');
const { exigirAuth } = require('../admin_auth');
const { leerBody } = require('../read_body');

const TABLAS = {
  INVENTARIO: { pk: ['NUMERO'], orden: { col: 'FECHA', asc: false } },
  CAJA:       { pk: ['FECHA', 'TURNO'], orden: { col: 'FECHA', asc: false } },
  RETIROS:    { pk: ['NUMERO'], orden: { col: 'FECHA', asc: false } },
  XALE:       { pk: ['ENVIOS', 'FECHA'], orden: { col: 'FECHA', asc: false } },
  DEV:        { pk: ['DEVOLUCIONES', 'FECHA'], orden: { col: 'FECHA', asc: false } },
  VENDIDO:    { pk: ['NUMERO'], orden: { col: 'FECHA VENTA', asc: false } },
  GUARDADERO: { pk: ['MARCA TEMPORAL', 'VALOR'], orden: { col: 'MARCA TEMPORAL', asc: false } },
  HISTORIAL:  { pk: null, orden: { col: 'FECHA', asc: false } },
  BAR:        { pk: ['MARCA TEMPORAL', 'VALOR'], orden: { col: 'MARCA TEMPORAL', asc: false } },
  SALIDAS:    { pk: ['NUMERO'], orden: { col: 'FECHA', asc: false } },
  GASTOS:     { pk: ['FECHA', 'TURNO', 'VALOR', 'DESCRIPCION'], orden: { col: 'FECHA', asc: false } }
};

function leerParam(req, body, nombre) {
  if (body && body[nombre] !== undefined) return body[nombre];
  if (req.query && req.query[nombre] !== undefined) return req.query[nombre];
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const v = url.searchParams.get(nombre);
    if (v !== null) return v;
  } catch (_) {}
  return null;
}

function aplicarFiltroPk(query, tablaCfg, where) {
  for (const col of tablaCfg.pk) {
    if (where[col] === undefined || where[col] === null) {
      throw new Error(`Falta el campo ${col} para identificar la fila`);
    }
    query = query.eq(col, where[col]);
  }
  return query;
}

module.exports = async (req, res) => {
  const body = await leerBody(req);
  if (!exigirAuth(req, res, body)) return;

  const accion = leerParam(req, body, 'accion') || 'list';
  const tabla = leerParam(req, body, 'tabla');

  if (accion === 'tablas') {
    return res.json({
      ok: true,
      tablas: Object.keys(TABLAS).map(name => ({
        name,
        pk: TABLAS[name].pk,
        editable: TABLAS[name].pk !== null
      }))
    });
  }

  if (!tabla || !TABLAS[tabla]) {
    return res.status(400).json({ ok: false, error: `Tabla no permitida: ${tabla}` });
  }
  const cfg = TABLAS[tabla];

  try {
    if (accion === 'list') {
      let q = supabase.from(tabla).select('*').limit(2000);
      if (cfg.orden) {
        q = q.order(cfg.orden.col, { ascending: cfg.orden.asc, nullsFirst: false });
      }
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ ok: true, tabla, rows: data || [] });
    }

    if (accion === 'update') {
      if (!cfg.pk) return res.status(400).json({ ok: false, error: 'Tabla no editable' });
      const where = leerParam(req, body, 'where');
      const set = leerParam(req, body, 'set');
      if (!where || !set) return res.status(400).json({ ok: false, error: 'Faltan where/set' });

      let q = supabase.from(tabla).update(set);
      q = aplicarFiltroPk(q, cfg, where);
      const { error } = await q;
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (accion === 'insert') {
      const rows = leerParam(req, body, 'rows');
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ ok: false, error: 'Faltan rows' });
      }
      const { error } = await supabase.from(tabla).insert(rows);
      if (error) throw error;
      return res.json({ ok: true, insertadas: rows.length });
    }

    if (accion === 'delete') {
      if (!cfg.pk) return res.status(400).json({ ok: false, error: 'Tabla no editable' });
      const where = leerParam(req, body, 'where');
      if (!where) return res.status(400).json({ ok: false, error: 'Falta where' });

      let q = supabase.from(tabla).delete();
      q = aplicarFiltroPk(q, cfg, where);
      const { error } = await q;
      if (error) throw error;
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Accion desconocida: ' + accion });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};

const supabase = require('../supabase');
const { parsearFecha, extraerFechaDate } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      VALOR: valorRaw,
      DESCRIPCION: descRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const valor = parseFloat(valorRaw) || 0;
    const descripcion = (descRaw || '').toUpperCase().trim();
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    await Promise.all([
      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'gastos', p_valor: valor
      }),

      supabase.from('gastos').insert({ fecha, turno, valor, descripcion }),

      supabase.from('movimientos').insert({
        tipo: 'GASTOS', fecha, operador_id: turno, valor,
        descripcion, detalle: { descripcion }
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error GASTOS:', error);
    res.status(500).json({ error: error.message });
  }
};

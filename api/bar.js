const supabase = require('../lib/supabase');
const { parsearFecha, extraerFechaDate } = require('../lib/helpers');

module.exports = async (req, res) => {
  try {
    const {
      VALOR: valorRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const valor = parseFloat(valorRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    await Promise.all([
      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'bar', p_valor: valor
      }),

      supabase.from('bar').insert({ fecha, turno, valor }),

      supabase.from('movimientos').insert({
        tipo: 'BAR', fecha, operador_id: turno, valor
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error BAR:', error);
    res.status(500).json({ error: error.message });
  }
};

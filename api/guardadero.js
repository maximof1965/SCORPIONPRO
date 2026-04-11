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
        p_fecha: fechaDate, p_turno: turno, p_campo: 'guardadero', p_valor: valor
      }),

      supabase.from('guardadero').insert({ fecha, turno, valor }),

      supabase.from('movimientos').insert({
        tipo: 'GUARDADERO', fecha, operador_id: turno, valor
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error GUARDADERO:', error);
    res.status(500).json({ error: error.message });
  }
};

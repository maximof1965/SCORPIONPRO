const supabase = require('../supabase');
const { parsearFecha, extraerFechaDate } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      TIPO: tipo,
      VALOR: valorRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    if (tipo === 'BASE') {
      const valor = parseFloat(valorRaw) || 0;

      await supabase.rpc('obtener_o_crear_caja', { p_fecha: fechaDate, p_turno: turno });
      await Promise.all([
        supabase.from('caja').update({ base: valor }).eq('fecha', fechaDate).eq('turno', turno),

        supabase.from('movimientos').insert({
          tipo: 'CAJA', fecha, operador_id: turno, valor,
          detalle: { subtipo: 'BASE' }
        })
      ]);

      return res.json({ ok: true });
    }

    if (tipo === 'CIERRE') {
      await supabase.rpc('obtener_o_crear_caja', { p_fecha: fechaDate, p_turno: turno });

      const { data: cajaData } = await supabase
        .from('caja')
        .select('*')
        .eq('fecha', fechaDate)
        .eq('turno', turno)
        .single();

      if (!cajaData) {
        return res.json({
          FECHA: fechaDate, BASE: 0, RETIRO: 0, GUARDA: 0,
          BAR: 0, CONTRATOS: 0, GASTOS: 0, VENTAS: 0, 'CUADRE CAJA': 0
        });
      }

      return res.json({
        FECHA: cajaData.fecha,
        BASE: cajaData.base || 0,
        RETIRO: cajaData.retiros || 0,
        GUARDA: cajaData.guardadero || 0,
        BAR: cajaData.bar || 0,
        CONTRATOS: cajaData.contratos || 0,
        GASTOS: cajaData.gastos || 0,
        VENTAS: cajaData.ventas || 0,
        'CUADRE CAJA': cajaData.cuadre || 0
      });
    }

    res.json({ ok: false, mensaje: 'TIPO no válido' });
  } catch (error) {
    console.error('Error CAJA:', error);
    res.status(500).json({ error: error.message });
  }
};

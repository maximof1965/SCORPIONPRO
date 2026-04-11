const supabase = require('../lib/supabase');
const { parsearFecha, extraerFechaDate } = require('../lib/helpers');

module.exports = async (req, res) => {
  try {
    const {
      identificador,
      numero: numeroAlt,
      valor: valorRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(identificador || numeroAlt);
    const valor = parseFloat(valorRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    const { data: empeno } = await supabase
      .from('empenos')
      .select('id, vr_abonado')
      .eq('numero', numero)
      .eq('estado', 'activo')
      .single();

    if (!empeno) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const nuevoAbonado = (empeno.vr_abonado || 0) - valor;

    await Promise.all([
      supabase.from('empenos').update({ vr_abonado: nuevoAbonado }).eq('id', empeno.id),

      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'retiros', p_valor: valor
      }),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'DEVOLUCION', fecha, operador_id: turno,
        valor
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error DEVOLUCION:', error);
    res.status(500).json({ error: error.message });
  }
};

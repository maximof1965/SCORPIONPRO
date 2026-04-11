const supabase = require('../supabase');
const { parsearFecha, extraerFechaDate } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      intereses: interesesRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const intereses = parseFloat(interesesRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    const { data: empeno } = await supabase
      .from('empenos')
      .select('id, vr_intereses')
      .eq('numero', numero)
      .eq('estado', 'activo')
      .single();

    if (!empeno) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const nuevoIntereses = (empeno.vr_intereses || 0) + intereses;

    await Promise.all([
      supabase.from('empenos').update({ vr_intereses: nuevoIntereses }).eq('id', empeno.id),

      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'retiros', p_valor: intereses
      }),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'INTERESES', fecha, operador_id: turno,
        valor: intereses, intereses
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error INTERESES:', error);
    res.status(500).json({ error: error.message });
  }
};

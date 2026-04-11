const supabase = require('../lib/supabase');
const { parsearFecha, extraerFechaDate } = require('../lib/helpers');

module.exports = async (req, res) => {
  try {
    const {
      identificador,
      numero: numeroAlt,
      aumento: aumentoRaw,
      pago_aumento: pagoAumentoRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(identificador || numeroAlt);
    const aumento = parseFloat(aumentoRaw) || 0;
    const pagoAumento = parseFloat(pagoAumentoRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    const { data: empeno } = await supabase
      .from('empenos')
      .select('id, vr_prestado, vr_retiro, aumento')
      .eq('numero', numero)
      .eq('estado', 'activo')
      .single();

    if (!empeno) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const nuevoVrPrestado = (empeno.vr_prestado || 0) + aumento;
    const nuevoVrRetiro = (empeno.vr_retiro || 0) + aumento;
    const historialAumento = empeno.aumento
      ? `${empeno.aumento}-${aumento}-${pagoAumento}`
      : `${aumento}-${pagoAumento}`;

    await Promise.all([
      supabase.from('empenos').update({
        vr_prestado: nuevoVrPrestado,
        vr_retiro: nuevoVrRetiro,
        utilidad: nuevoVrRetiro - nuevoVrPrestado,
        aumento: historialAumento,
        fecha_aumento: fecha
      }).eq('id', empeno.id),

      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'contratos', p_valor: aumento
      }),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'AUMENTO', fecha, operador_id: turno,
        valor: aumento, aumento: historialAumento,
        detalle: { aumento, pago_aumento: pagoAumento }
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error AUMENTO:', error);
    res.status(500).json({ error: error.message });
  }
};

const supabase = require('../supabase');
const { parsearFecha, extraerFechaDate } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      'NUMERO(ABO)': numeroRaw,
      ABONO: abonoRaw,
      'DESCUENTO(ABO)': descuentoRaw,
      'RETIRO(ABO)': retiroRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const abono = parseFloat(abonoRaw) || 0;
    const descuento = parseFloat(descuentoRaw) || 0;
    const retiro = (retiroRaw || '').toUpperCase().trim();
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    const { data: empeno } = await supabase
      .from('empenos')
      .select('id, vr_abonado')
      .eq('numero', numero)
      .eq('estado', 'activo')
      .single();

    if (!empeno) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const nuevoAbonado = (empeno.vr_abonado || 0) + abono;
    const updateEmpeno = { vr_abonado: nuevoAbonado };
    if (descuento) updateEmpeno.descuento = descuento;
    if (retiro) {
      updateEmpeno.retiros = retiro;
      updateEmpeno.fecha_retiro = fecha;
    }

    await Promise.all([
      supabase.from('empenos').update(updateEmpeno).eq('id', empeno.id),

      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'retiros', p_valor: abono
      }),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'ABONO', fecha, operador_id: turno,
        valor: abono, descuento, retiros: retiro || null,
        detalle: { retiro }
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error ABONO:', error);
    res.status(500).json({ error: error.message });
  }
};

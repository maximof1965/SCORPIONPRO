const supabase = require('../supabase');
const { parsearFecha, extraerFechaDate } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      valor_venta: valorVentaRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const valorVenta = parseFloat(valorVentaRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    const { data: empeno } = await supabase
      .from('empenos')
      .select('id, vr_prestado')
      .eq('numero', numero)
      .in('estado', ['activo', 'saca'])
      .single();

    if (!empeno) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const utilidad = valorVenta - (empeno.vr_prestado || 0);

    const { data: sacaData } = await supabase
      .from('saca')
      .select('id')
      .eq('empeno_id', empeno.id)
      .eq('estado', 'en_saca')
      .single();

    const ops = [
      supabase.from('empenos').update({ estado: 'vendido' }).eq('id', empeno.id),

      supabase.from('vendido').insert({
        saca_id: sacaData?.id || null,
        empeno_id: empeno.id, numero, fecha_venta: fecha, operador_id: turno,
        valor_venta: valorVenta, vr_prestado: empeno.vr_prestado, utilidad
      }),

      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'ventas', p_valor: valorVenta
      }),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'VENTAS', fecha, operador_id: turno,
        valor: valorVenta, detalle: { utilidad }
      })
    ];

    if (sacaData) {
      ops.push(
        supabase.from('saca').update({ estado: 'vendido' }).eq('id', sacaData.id)
      );
    }

    await Promise.all(ops);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error VENTAS:', error);
    res.status(500).json({ error: error.message });
  }
};

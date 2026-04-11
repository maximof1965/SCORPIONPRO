const supabase = require('../lib/supabase');
const { parsearFecha, extraerFechaDate } = require('../lib/helpers');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      valor: valorRaw,
      descuento: descuentoRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const valor = parseFloat(valorRaw) || 0;
    const descuento = parseFloat(descuentoRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    const { data: empeno } = await supabase
      .from('empenos')
      .select('id, vr_abonado')
      .eq('numero', numero)
      .eq('estado', 'activo')
      .single();

    if (!empeno) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const nuevoAbonado = (empeno.vr_abonado || 0) + valor;

    await Promise.all([
      supabase.from('empenos').update({
        vr_abonado: nuevoAbonado, descuento, estado: 'salida'
      }).eq('id', empeno.id),

      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'retiros', p_valor: valor
      }),

      supabase.from('salidas').insert({
        empeno_id: empeno.id, numero, fecha, operador_id: turno,
        valor_pagado: valor, descuento
      }),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'SALIDA', fecha, operador_id: turno,
        valor, descuento
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error SALIDA:', error);
    res.status(500).json({ error: error.message });
  }
};

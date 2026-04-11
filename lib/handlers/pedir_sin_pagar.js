const supabase = require('../supabase');
const { parsearFecha } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      'RETIRO(PEDIR)': retiroRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const retiro = (retiroRaw || '').toUpperCase().trim();
    const fecha = parsearFecha(marcaTemporal);

    const { data: empeno } = await supabase
      .from('empenos')
      .select('id')
      .eq('numero', numero)
      .eq('estado', 'activo')
      .single();

    if (!empeno) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    await Promise.all([
      supabase.from('empenos').update({
        retiros: retiro, fecha_retiro: fecha
      }).eq('id', empeno.id),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'PEDIR_SIN_PAGAR', fecha, operador_id: turno,
        retiros: retiro, detalle: { retiro }
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error PEDIR_SIN_PAGAR:', error);
    res.status(500).json({ error: error.message });
  }
};

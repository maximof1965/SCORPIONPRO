const supabase = require('../supabase');
const { parsearFecha } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      esperar: esperarRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const esperar = (esperarRaw || '').toUpperCase().trim();
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
        espera: esperar, fecha_espera: fecha
      }).eq('id', empeno.id),

      supabase.from('movimientos').insert({
        empeno_id: empeno.id, numero, tipo: 'ESPERA', fecha, operador_id: turno,
        detalle: { esperar }
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error ESPERA:', error);
    res.status(500).json({ error: error.message });
  }
};

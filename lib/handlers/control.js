const supabase = require('../supabase');

module.exports = async (req, res) => {
  try {
    const { subtipo, NUMERO, 'Marca temporal': marcaTemporal, TURNO: turno } = req.query;

    const numeros = Array.isArray(NUMERO)
      ? NUMERO.map(n => parseInt(n)).filter(n => !isNaN(n))
      : NUMERO ? [parseInt(NUMERO)].filter(n => !isNaN(n)) : [];

    if (numeros.length === 0) return res.json({ ok: false, mensaje: 'Sin números válidos' });

    const fecha = new Date().toISOString();
    const tabla = subtipo === 'ENVIOS' ? 'xale' : 'dev';

    const filas = numeros.map(n => ({
      numero: n, fecha, operador_id: turno || null
    }));

    // Para ENVIOS, vincular el empeno_id si existe
    for (const fila of filas) {
      const { data: empeno } = await supabase
        .from('empenos')
        .select('id')
        .eq('numero', fila.numero)
        .eq('estado', 'activo')
        .single();
      if (empeno) fila.empeno_id = empeno.id;
    }

    await Promise.all([
      supabase.from(tabla).insert(filas),
      supabase.from('movimientos').insert(
        numeros.map(n => ({
          numero: n, tipo: 'CONTROL', fecha, operador_id: turno,
          detalle: { subtipo }
        }))
      )
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error CONTROL:', error);
    res.status(500).json({ error: error.message });
  }
};

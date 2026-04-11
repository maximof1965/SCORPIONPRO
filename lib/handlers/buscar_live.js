const supabase = require('../supabase');

module.exports = async (req, res) => {
  try {
    const { campo, q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const termino = q.trim().toUpperCase();
    let data = [];

    if (campo === 'numero') {
      const { data: result } = await supabase
        .from('empenos')
        .select('numero, nombre_cliente, cedula_cliente, tipo_articulo, vr_prestado, vr_retiro')
        .eq('estado', 'activo')
        .ilike('numero::text', `${termino}%`)
        .limit(8);
      data = result || [];
    } else if (campo === 'cedula') {
      const { data: result } = await supabase
        .from('empenos')
        .select('numero, nombre_cliente, cedula_cliente, tipo_articulo, vr_prestado, vr_retiro')
        .eq('estado', 'activo')
        .ilike('cedula_cliente', `%${termino}%`)
        .limit(8);
      data = result || [];
    } else if (campo === 'nombre') {
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('buscar_empenos_fuzzy', { termino, limite: 8 });

      if (!rpcError && rpcResult && rpcResult.length > 0) {
        data = rpcResult.map(r => ({
          numero: r.numero,
          nombre_cliente: r.nombre_cliente,
          cedula_cliente: r.cedula_cliente,
          tipo_articulo: r.tipo_articulo,
          vr_prestado: r.vr_prestado,
          vr_retiro: r.vr_retiro
        }));
      } else {
        const pattern = termino.split('').join('%');
        const { data: fallback } = await supabase
          .from('empenos')
          .select('numero, nombre_cliente, cedula_cliente, tipo_articulo, vr_prestado, vr_retiro')
          .eq('estado', 'activo')
          .ilike('nombre_cliente', `%${pattern}%`)
          .limit(8);
        data = fallback || [];
      }
    }

    const resultado = data.map(e => ({
      NUMERO: e.numero,
      NOMBRE: e.nombre_cliente || '',
      CC: e.cedula_cliente || '',
      ART: e.tipo_articulo || '',
      'VR PR': e.vr_prestado,
      'VR RT': e.vr_retiro
    }));

    res.json(resultado);
  } catch (error) {
    console.error('Error BUSCAR_LIVE:', error);
    res.status(500).json({ error: error.message });
  }
};

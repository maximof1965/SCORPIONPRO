const supabase = require('../supabase');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      nombre_completo: nombreRaw,
      cedula: cedulaRaw
    } = req.query;

    const numero = numeroRaw ? parseInt(numeroRaw) : null;
    const cedula = (cedulaRaw || '').trim();
    const nombre = (nombreRaw || '').toUpperCase().trim();

    if (!numero && !cedula && !nombre) return res.json([]);

    let data = [];

    if (numero) {
      const { data: result, error } = await supabase
        .from('empenos')
        .select('*')
        .eq('estado', 'activo')
        .eq('numero', numero)
        .limit(10);
      if (error) throw error;
      data = result || [];
    } else if (cedula) {
      const { data: result, error } = await supabase
        .from('empenos')
        .select('*')
        .eq('estado', 'activo')
        .eq('cedula_cliente', cedula)
        .limit(10);
      if (error) throw error;
      data = result || [];
    } else if (nombre) {
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('buscar_empenos_fuzzy', { termino: nombre, limite: 10 });

      if (!rpcError && rpcResult && rpcResult.length > 0) {
        data = rpcResult;
      } else {
        const { data: fallback, error } = await supabase
          .from('empenos')
          .select('*')
          .eq('estado', 'activo')
          .ilike('nombre_cliente', `%${nombre}%`)
          .limit(10);
        if (error) throw error;
        data = fallback || [];
      }
    }

    const resultado = data.map(e => ({
      FECHA: e.fecha,
      OPER: e.operador_id,
      NUMERO: e.numero,
      'VR PR': e.vr_prestado,
      'VR RT': e.vr_retiro,
      NOMBRE: e.nombre_cliente || '',
      CC: e.cedula_cliente || '',
      ART: e.tipo_articulo,
      DESCRIPCION: e.descripcion,
      LLEVAR: e.llevar,
      'VR IN': e.vr_intereses,
      'VR AB': e.vr_abonado,
      ESPERA: e.espera,
      'FECHA ESPERA': e.fecha_espera,
      RETIROS: e.retiros,
      'FECHA RETIRO': e.fecha_retiro,
      'DES.': e.descuento,
      AUMENTO: e.aumento
    }));

    res.json(resultado);
  } catch (error) {
    console.error('Error BUSCAR:', error);
    res.status(500).json({ error: error.message });
  }
};

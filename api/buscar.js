const supabase = require('../lib/supabase');

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
        .select(`
          numero, fecha, operador_id, tipo_articulo, descripcion,
          vr_prestado, vr_retiro, vr_abonado, vr_intereses,
          llevar, retiros, fecha_retiro, espera, fecha_espera,
          descuento, aumento, fecha_aumento, estado,
          clientes (nombre, documento)
        `)
        .eq('estado', 'activo')
        .eq('numero', numero)
        .limit(10);
      if (error) throw error;
      data = result || [];
    } else if (cedula) {
      const { data: clientes } = await supabase
        .from('clientes')
        .select('id')
        .eq('documento', cedula);

      if (clientes && clientes.length > 0) {
        const clienteIds = clientes.map(c => c.id);
        const { data: result, error } = await supabase
          .from('empenos')
          .select(`
            numero, fecha, operador_id, tipo_articulo, descripcion,
            vr_prestado, vr_retiro, vr_abonado, vr_intereses,
            llevar, retiros, fecha_retiro, espera, fecha_espera,
            descuento, aumento, fecha_aumento, estado,
            clientes (nombre, documento)
          `)
          .eq('estado', 'activo')
          .in('cliente_id', clienteIds)
          .limit(10);
        if (error) throw error;
        data = result || [];
      }
    } else if (nombre) {
      const { data: clientes } = await supabase
        .from('clientes')
        .select('id')
        .ilike('nombre', `%${nombre}%`);

      if (clientes && clientes.length > 0) {
        const clienteIds = clientes.map(c => c.id);
        const { data: result, error } = await supabase
          .from('empenos')
          .select(`
            numero, fecha, operador_id, tipo_articulo, descripcion,
            vr_prestado, vr_retiro, vr_abonado, vr_intereses,
            llevar, retiros, fecha_retiro, espera, fecha_espera,
            descuento, aumento, fecha_aumento, estado,
            clientes (nombre, documento)
          `)
          .eq('estado', 'activo')
          .in('cliente_id', clienteIds)
          .limit(10);
        if (error) throw error;
        data = result || [];
      }
    }

    const resultado = data.map(e => ({
      FECHA: e.fecha,
      OPER: e.operador_id,
      NUMERO: e.numero,
      'VR PR': e.vr_prestado,
      'VR RT': e.vr_retiro,
      NOMBRE: e.clientes?.nombre || '',
      CC: e.clientes?.documento || '',
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

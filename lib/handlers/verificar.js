const supabase = require('../supabase');

module.exports = async (req, res) => {
  try {
    const { 'Marca temporal': marcaTemporal } = req.query;

    const fechaStr = (marcaTemporal || '').split(' ')[0];
    const partes = fechaStr.split('/');
    if (partes.length < 3) return res.json([]);

    const dia = partes[0].padStart(2, '0');
    const mes = partes[1].padStart(2, '0');
    const anioRaw = partes[2];
    const anio = anioRaw.length === 2 ? '20' + anioRaw : anioRaw;
    const fechaISO = `${anio}-${mes}-${dia}`;

    const [empenosRes, salidasRes] = await Promise.all([
      supabase
        .from('empenos')
        .select(`
          numero, fecha, operador_id, vr_prestado, vr_retiro,
          vr_abonado, descuento, estado,
          clientes (nombre, documento)
        `)
        .gte('fecha', `${fechaISO}T00:00:00`)
        .lte('fecha', `${fechaISO}T23:59:59`),

      supabase
        .from('salidas')
        .select('numero, fecha, operador_id, valor_pagado, descuento')
        .gte('fecha', `${fechaISO}T00:00:00`)
        .lte('fecha', `${fechaISO}T23:59:59`)
    ]);

    const empenosData = empenosRes.data || [];
    const salidasData = salidasRes.data || [];
    const numerosEnSalidas = new Set(salidasData.map(s => s.numero));

    const grupo1 = empenosData
      .filter(e => !numerosEnSalidas.has(e.numero))
      .map(e => ({
        grupo: 'GRUPO 1',
        FECHA: e.fecha,
        OPER: e.operador_id,
        NUMERO: e.numero,
        'VR PR': e.vr_prestado,
        'VR RT': e.vr_retiro,
        NOMBRE: e.clientes?.nombre || ''
      }));

    const grupo2 = salidasData.map(s => ({
      grupo: 'GRUPO 2',
      'FECHA SALIDA': s.fecha,
      OPER: s.operador_id,
      NUMERO: s.numero,
      'VR AB': s.valor_pagado,
      DES: s.descuento
    }));

    res.json([...grupo1, ...grupo2]);
  } catch (error) {
    console.error('Error VERIFICAR:', error);
    res.status(500).json({ error: error.message });
  }
};

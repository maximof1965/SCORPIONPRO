const supabase = require('../supabase');
const { buildLoosePattern, toUpper } = require('../db');

module.exports = async (req, res) => {
  try {
    const { campo, q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const termino = toUpper(q);
    let data = [];

    if (campo === 'numero') {
      const digits = termino.replace(/\D/g, '');
      if (!digits) return res.json([]);
      const lower = parseInt(digits + '0'.repeat(Math.max(0, 6 - digits.length)));
      const upper = parseInt(digits + '9'.repeat(Math.max(0, 6 - digits.length)));
      const { data: result } = await supabase
        .from('INVENTARIO')
        .select('*')
        .gte('NUMERO', lower)
        .lte('NUMERO', upper)
        .limit(8);
      data = result || [];
    } else if (campo === 'cedula') {
      const { data: result } = await supabase
        .from('INVENTARIO')
        .select('*')
        .ilike('CC', `%${termino}%`)
        .limit(8);
      data = result || [];
    } else if (campo === 'nombre') {
      const { data: exact } = await supabase
        .from('INVENTARIO')
        .select('*')
        .ilike('NOMBRE', `%${termino}%`)
        .limit(8);

      data = exact || [];
      if (data.length === 0) {
        const pattern = buildLoosePattern(termino);
        const { data: fallback } = await supabase
          .from('INVENTARIO')
          .select('*')
          .ilike('NOMBRE', `%${pattern}%`)
          .limit(8);
        data = fallback || [];
      }
    }

    const resultado = data.map(e => ({
      NUMERO: e['NUMERO'],
      NOMBRE: e['NOMBRE'] || '',
      CC: e['CC'] || '',
      ART: e['ART'] || '',
      'VR PR': e['VR PR'],
      'VR RT': e['VR RT']
    }));

    res.json(resultado);
  } catch (error) {
    console.error('Error BUSCAR_LIVE:', error);
    res.status(500).json({ error: error.message });
  }
};

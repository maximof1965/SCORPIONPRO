const supabase = require('../supabase');
const { parsearFecha } = require('../helpers');
const {
  getInventarioByNumero,
  upsertCajaDelta,
  insertHistorial,
  calcularTotal
} = require('../db');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      intereses: interesesRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const intereses = parseFloat(interesesRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);

    const empe = await getInventarioByNumero(numero);

    if (!empe) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const rowFinal = {
      ...empe,
      'VR IN': (empe['VR IN'] || 0) + intereses,
      'TOT IN': (empe['TOT IN'] || 0) + intereses,
      'FECHA INT': fecha
    };
    rowFinal.TOTAL = calcularTotal(rowFinal);

    await Promise.all([
      supabase.from('INVENTARIO').update({
        'VR IN': rowFinal['VR IN'],
        'TOT IN': rowFinal['TOT IN'],
        'FECHA INT': fecha,
        TOTAL: rowFinal.TOTAL
      }).eq('NUMERO', numero),
      upsertCajaDelta(fecha, turno, 'RETIRO', intereses),
      insertHistorial({
        fecha,
        oper: turno,
        tipo: 'INTERESES',
        numero,
        nombre: empe['NOMBRE'],
        cc: empe['CC'],
        art: empe['ART'],
        descripcion: empe['DESCRIPCION'],
        valor: intereses
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error INTERESES:', error);
    res.status(500).json({ error: error.message });
  }
};

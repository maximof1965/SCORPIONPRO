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
      identificador,
      numero: numeroAlt,
      valor: valorRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(identificador || numeroAlt);
    const valor = parseFloat(valorRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);

    const empe = await getInventarioByNumero(numero);

    if (!empe) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const rowFinal = {
      ...empe,
      'VR AB': (empe['VR AB'] || 0) - valor,
      'FECHA ABON': fecha
    };
    rowFinal.TOTAL = calcularTotal(rowFinal);

    await Promise.all([
      supabase.from('INVENTARIO').update({
        'VR AB': rowFinal['VR AB'],
        'FECHA ABON': fecha,
        TOTAL: rowFinal.TOTAL
      }).eq('NUMERO', numero),
      upsertCajaDelta(fecha, turno, 'RETIRO', valor),
      insertHistorial({
        fecha,
        oper: turno,
        tipo: 'DEVOLUCION',
        numero,
        nombre: empe['NOMBRE'],
        cc: empe['CC'],
        art: empe['ART'],
        descripcion: empe['DESCRIPCION'],
        valor
      })
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error DEVOLUCION:', error);
    res.status(500).json({ error: error.message });
  }
};

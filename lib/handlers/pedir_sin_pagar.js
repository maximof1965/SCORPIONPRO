const supabase = require('../supabase');
const { parsearFecha } = require('../helpers');
const { getInventarioByNumero, insertHistorial, syncRetirosFromInventario } = require('../db');

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

    const empe = await getInventarioByNumero(numero);

    if (!empe) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const rowFinal = {
      ...empe,
      RETIROS: retiro,
      'FECHA RETIRO': fecha
    };

    await Promise.all([
      supabase.from('INVENTARIO').update({
        RETIROS: retiro,
        'FECHA RETIRO': fecha
      }).eq('NUMERO', numero),
      insertHistorial({
        fecha,
        oper: turno,
        tipo: 'PEDIR_SIN_PAGAR',
        numero,
        nombre: empe['NOMBRE'],
        cc: empe['CC'],
        art: empe['ART'],
        descripcion: empe['DESCRIPCION'],
        detalle: { RETIRO: retiro }
      })
    ]);

    await syncRetirosFromInventario(rowFinal);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error PEDIR_SIN_PAGAR:', error);
    res.status(500).json({ error: error.message });
  }
};

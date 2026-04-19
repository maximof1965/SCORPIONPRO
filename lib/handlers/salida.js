const supabase = require('../supabase');
const { parsearFecha } = require('../helpers');
const {
  getInventarioByNumero,
  upsertCajaDelta,
  insertHistorial,
  pickInventarioRow,
  calcularTotal,
  removeRetiro
} = require('../db');

module.exports = async (req, res) => {
  try {
    const {
      numero: numeroRaw,
      valor: valorRaw,
      descuento: descuentoRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const valor = parseFloat(valorRaw) || 0;
    const descuento = parseFloat(descuentoRaw) || 0;
    const fecha = parsearFecha(marcaTemporal);

    const empe = await getInventarioByNumero(numero);

    if (!empe) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const rowSalida = {
      ...empe,
      FECHA: fecha,
      OPER: turno,
      'VR AB': (empe['VR AB'] || 0) + valor,
      'FECHA ABON': fecha,
      DES: descuento || empe.DES || 0
    };
    rowSalida.TOTAL = calcularTotal(rowSalida);

    const { error: insertError } = await supabase
      .from('SALIDAS')
      .insert(pickInventarioRow(rowSalida));
    if (insertError) throw insertError;

    const { error: deleteError } = await supabase
      .from('INVENTARIO')
      .delete()
      .eq('NUMERO', numero);
    if (deleteError) throw deleteError;

    await Promise.all([
      upsertCajaDelta(fecha, turno, 'RETIRO', valor),
      insertHistorial({
        fecha,
        oper: turno,
        tipo: 'SALIDA',
        numero,
        nombre: empe['NOMBRE'],
        cc: empe['CC'],
        art: empe['ART'],
        descripcion: empe['DESCRIPCION'],
        valor,
        detalle: { DES: descuento }
      })
    ]);

    await removeRetiro(numero);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error SALIDA:', error);
    res.status(500).json({ error: error.message });
  }
};

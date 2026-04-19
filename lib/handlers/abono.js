const supabase = require('../supabase');
const { parsearFecha } = require('../helpers');
const {
  getInventarioByNumero,
  upsertCajaDelta,
  insertHistorial,
  syncRetirosFromInventario,
  calcularTotal
} = require('../db');

module.exports = async (req, res) => {
  try {
    const {
      'NUMERO(ABO)': numeroRaw,
      ABONO: abonoRaw,
      'DESCUENTO(ABO)': descuentoRaw,
      'RETIRO(ABO)': retiroRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(numeroRaw);
    const abono = parseFloat(abonoRaw) || 0;
    const descuento = parseFloat(descuentoRaw) || 0;
    const retiro = (retiroRaw || '').toUpperCase().trim();
    const fecha = parsearFecha(marcaTemporal);

    const empe = await getInventarioByNumero(numero);

    if (!empe) return res.json({ ok: false, mensaje: 'ARTICULO NO ENCONTRADO' });

    const updateEmpeno = {
      'VR AB': (empe['VR AB'] || 0) + abono,
      'FECHA ABON': fecha
    };
    if (descuento) updateEmpeno.DES = descuento;
    if (retiro) {
      updateEmpeno.RETIROS = retiro;
      updateEmpeno['FECHA RETIRO'] = fecha;
    }
    const rowFinal = { ...empe, ...updateEmpeno };
    rowFinal.TOTAL = calcularTotal(rowFinal);

    await Promise.all([
      supabase.from('INVENTARIO').update({
        ...updateEmpeno,
        TOTAL: rowFinal.TOTAL
      }).eq('NUMERO', numero),
      upsertCajaDelta(fecha, turno, 'RETIRO', abono),
      insertHistorial({
        fecha,
        oper: turno,
        tipo: 'ABONO',
        numero,
        nombre: empe['NOMBRE'],
        cc: empe['CC'],
        art: empe['ART'],
        descripcion: empe['DESCRIPCION'],
        valor: abono,
        detalle: { DES: descuento, RETIRO: retiro }
      })
    ]);

    await syncRetirosFromInventario(rowFinal);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error ABONO:', error);
    res.status(500).json({ error: error.message });
  }
};

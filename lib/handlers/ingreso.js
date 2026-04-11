const supabase = require('../supabase');
const { parsearFecha, extraerFechaDate } = require('../helpers');

module.exports = async (req, res) => {
  try {
    const {
      identificador,
      'VALOR (ING) ': valorRaw,
      'V RETIRO(ING) ': vRetiroRaw,
      'NOMBRE COMPLETO(ING) ': nombreRaw,
      'CEDULA(ING) ': cedulaRaw,
      'ART(ING)': artRaw,
      DESCRIPCION: descRaw,
      LLEVAR: llevarRaw,
      'Marca temporal': marcaTemporal,
      TURNO: turno
    } = req.query;

    const numero = parseInt(identificador);
    const vrPrestado = parseFloat(valorRaw) || 0;
    const vrRetiro = parseFloat(vRetiroRaw) || 0;
    const nombre = (nombreRaw || '').toUpperCase().trim();
    const cedula = (cedulaRaw || '').trim();
    const art = (artRaw || '').toUpperCase().trim();
    const descripcion = (descRaw || 'NULO').toUpperCase().trim();
    const llevar = (llevarRaw || '').toUpperCase().trim();
    const fecha = parsearFecha(marcaTemporal);
    const fechaDate = extraerFechaDate(fecha);

    const { data: existente } = await supabase
      .from('empenos')
      .select('id')
      .eq('numero', numero)
      .eq('estado', 'activo')
      .single();

    if (existente) {
      return res.json({ mensaje: 'EL NUMERO DE ARTICULO YA ESTA INGRESADO' });
    }

    const utilidad = vrRetiro - vrPrestado;

    await Promise.all([
      supabase.from('empenos').insert({
        numero, fecha, operador_id: turno,
        nombre_cliente: nombre,
        cedula_cliente: cedula,
        tipo_articulo: art, descripcion,
        vr_prestado: vrPrestado, vr_retiro: vrRetiro,
        utilidad, total: vrRetiro, llevar, estado: 'activo'
      }),

      supabase.rpc('acumular_caja', {
        p_fecha: fechaDate, p_turno: turno, p_campo: 'contratos', p_valor: vrPrestado
      }),

      supabase.from('movimientos').insert({
        numero, tipo: 'INGRESO', fecha, operador_id: turno,
        valor: vrPrestado,
        detalle: { vrRetiro, nombre, cedula, art, descripcion, llevar }
      })
    ]);

    res.json({ mensaje: 'INGRESADO CORRECTAMENTE' });
  } catch (error) {
    console.error('Error INGRESO:', error);
    res.status(500).json({ mensaje: 'ERROR INTERNO', error: error.message });
  }
};

const supabase = require('../supabase');
const { parsearFecha } = require('../helpers');
const { insertHistorial, removeRetiro } = require('../db');

module.exports = async (req, res) => {
  try {
    const { subtipo, NUMERO, 'Marca temporal': marcaTemporal, TURNO: turno } = req.query;

    const numeros = Array.isArray(NUMERO)
      ? NUMERO.map(n => parseInt(n)).filter(n => !isNaN(n))
      : NUMERO ? [parseInt(NUMERO)].filter(n => !isNaN(n)) : [];

    if (numeros.length === 0) return res.json({ ok: false, mensaje: 'Sin números válidos' });

    const fecha = parsearFecha(marcaTemporal);
    const tabla = subtipo === 'ENVIOS' ? 'XALE' : 'DEV';
    const campo = subtipo === 'ENVIOS' ? 'ENVIOS' : 'DEVOLUCIONES';
    const filas = numeros.map(n => ({ [campo]: n, FECHA: fecha }));

    // Para DEVOLUCIONES: averiguar primero cuáles de los números enviados
    // están actualmente en la tabla RETIROS, para poder reportarlos en la
    // respuesta. Después se eliminan (idempotente: si no estaba, no pasa nada).
    let retirosEliminados = [];
    if (subtipo === 'DEVOLUCIONES') {
      try {
        const { data: existentesEnRetiros, error: errRet } = await supabase
          .from('RETIROS')
          .select('NUMERO')
          .in('NUMERO', numeros);
        if (errRet) throw errRet;
        retirosEliminados = (existentesEnRetiros || []).map(r => r.NUMERO);
      } catch (e) {
        // No bloqueamos la operación si la consulta de RETIROS falla.
        console.error('CONTROL DEVOLUCIONES: no se pudo consultar RETIROS:', e);
      }
    }

    await Promise.all([
      supabase.from(tabla).insert(filas),
      Promise.all(
        numeros.map(n =>
          insertHistorial({
            fecha,
            oper: turno,
            tipo: subtipo,
            numero: n,
            valor: n,
            detalle: { SUBTIPO: subtipo }
          })
        )
      )
    ]);

    // Eliminar de RETIROS los números que llegan como DEVOLUCION.
    // El operador ya está devolviendo físicamente el artículo, así que
    // si seguía marcado como "RETIRAR" en la tabla RETIROS no tiene
    // sentido que aparezca allí.
    if (subtipo === 'DEVOLUCIONES' && retirosEliminados.length > 0) {
      await Promise.all(
        retirosEliminados.map(n =>
          removeRetiro(n).catch(err => {
            console.error('CONTROL DEVOLUCIONES: error eliminando RETIROS NUMERO=', n, err);
          })
        )
      );
    }

    res.json({
      ok: true,
      eliminados_retiros: {
        count: retirosEliminados.length,
        numeros: retirosEliminados
      }
    });
  } catch (error) {
    console.error('Error CONTROL:', error);
    res.status(500).json({ error: error.message });
  }
};

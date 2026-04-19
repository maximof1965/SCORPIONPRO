function isoSinMs(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function ahoraISO() {
  return isoSinMs(new Date());
}

function parsearFecha(marcaTemporal) {
  if (!marcaTemporal) return ahoraISO();
  const [fechaStr, horaStr = '00:00:00'] = marcaTemporal.split(' ');
  const partes = fechaStr.split('/');
  if (partes.length < 3) return ahoraISO();
  const dia = partes[0].padStart(2, '0');
  const mes = partes[1].padStart(2, '0');
  const anio = partes[2].length === 2 ? '20' + partes[2] : partes[2];
  const horaCompleta = horaStr.split(':').length === 2 ? `${horaStr}:00` : horaStr;
  return isoSinMs(new Date(`${anio}-${mes}-${dia}T${horaCompleta}`));
}

function extraerFechaDate(fechaISO) {
  return fechaISO.split('T')[0];
}

module.exports = { parsearFecha, extraerFechaDate, isoSinMs, ahoraISO };

function parsearFecha(marcaTemporal) {
  if (!marcaTemporal) return new Date().toISOString();
  const [fechaStr, horaStr = '00:00'] = marcaTemporal.split(' ');
  const partes = fechaStr.split('/');
  if (partes.length < 3) return new Date().toISOString();
  const dia = partes[0].padStart(2, '0');
  const mes = partes[1].padStart(2, '0');
  const anio = partes[2].length === 2 ? '20' + partes[2] : partes[2];
  return new Date(`${anio}-${mes}-${dia}T${horaStr}:00`).toISOString();
}

function extraerFechaDate(fechaISO) {
  return fechaISO.split('T')[0];
}

module.exports = { parsearFecha, extraerFechaDate };

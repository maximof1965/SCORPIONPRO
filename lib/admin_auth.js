function leerPassword(req) {
  const headerPwd = req.headers['x-admin-password'];
  if (headerPwd) return headerPwd;
  if (req.body && typeof req.body === 'object' && req.body.password) {
    return req.body.password;
  }
  if (req.query && req.query.password) return req.query.password;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const qp = url.searchParams.get('password');
    if (qp) return qp;
  } catch (_) {}
  return null;
}

function passwordValido(req) {
  const esperado = process.env.ADMIN_PASSWORD;
  if (!esperado) return false;
  const recibido = leerPassword(req);
  if (!recibido) return false;
  return String(recibido) === String(esperado);
}

function exigirAuth(req, res) {
  if (!passwordValido(req)) {
    res.status(401).json({ ok: false, error: 'Clave incorrecta' });
    return false;
  }
  return true;
}

module.exports = { passwordValido, exigirAuth };

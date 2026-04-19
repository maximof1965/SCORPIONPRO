const { passwordValido } = require('../admin_auth');

module.exports = async (req, res) => {
  const ok = passwordValido(req);
  if (!ok) {
    return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
  }
  return res.json({ ok: true });
};

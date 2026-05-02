/**
 * Acceso SCORPION (contraseña en Vercel: SCORPION_APP_PASSWORD).
 */
const { leerBody } = require('../read_body');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.SCORPION_APP_PASSWORD;
  if (!secret || String(secret).trim() === '') {
    return res.status(500).json({
      ok: false,
      error: 'SCORPION_APP_PASSWORD no configurada en Vercel',
    });
  }

  const body = await leerBody(req);
  const pass = body.password != null ? String(body.password) : '';
  if (pass === String(secret)) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
};

const DEV_PORT = process.env.FRONTEND_DEV_PORT || 3001;

/**
 * Build a URL to the React dev server using the incoming request's hostname.
 * Ensures LAN/mobile clients aren't forced to localhost.
 * @param {import('express').Request} req
 * @param {string} path
 */
function buildDevServerUrl(req, path = '/') {
  const hostHeader = req.get('host') || '';
  // host header may include port; we only need hostname part
  const hostname = hostHeader.split(':')[0] || 'localhost';
  return `http://${hostname}:${DEV_PORT}${path}`;
}

module.exports = { buildDevServerUrl }; 
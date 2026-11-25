import http from 'node:http';

// Escucha en el primer puerto libre a partir de `desde` (otra app puede tener ocupado el 8788).
export function escucharEnLibre(app, host, desde, { intentos = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const probar = port => {
      const server = http.createServer(app).listen(port, host);
      server.once('listening', () => resolve({ server, port }));
      server.once('error', err => {
        if (err.code === 'EADDRINUSE' && port - desde + 1 < intentos) return probar(port + 1);
        reject(err);
      });
    };
    probar(desde);
  });
}

export const esLoopback = addr => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);

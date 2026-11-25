import crypto from 'node:crypto';

const COOKIE = 'mi_gym_token';

function igual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function leerCookie(cabecera, nombre) {
  for (const parte of String(cabecera ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return null;
}

// Control de acceso para la app del celular: el servidor escucha en 127.0.0.1, pero cualquier app del equipo podría
// pedirle los datos. Solo quien conoce la clave de la corrida (la app, que la manda una vez en la URL y recibe una
// cookie) puede usarlo.
export function controlDeAcceso(token) {
  return (req, res, next) => {
    const url = new URL(req.originalUrl, 'http://local');
    const enUrl = url.searchParams.get(COOKIE);
    if (enUrl !== null) {
      if (!igual(enUrl, token)) return res.status(403).end();
      url.searchParams.delete(COOKIE);
      res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`);
      return res.redirect(302, url.pathname + url.search);
    }
    const cookie = leerCookie(req.headers.cookie, COOKIE);
    if (cookie !== null && igual(cookie, token)) return next();
    res.status(403).type('text/plain').send('Acceso denegado');
  };
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defensa contra páginas web ajenas que le hablan al servidor local (CSRF) o que lo alcanzan con DNS rebinding.
// - Host: solo se atiende si el pedido llegó por una dirección propia (127.0.0.1, localhost, [::1] y, en modo LAN,
//   las IP de esta PC en la red) y por el puerto en el que realmente se escucha. Un dominio ajeno que apunta a
//   127.0.0.1 trae su propio nombre en Host y se rechaza.
// - Cambios (POST/PUT/PATCH/DELETE) bajo /api: exigen la cabecera X-Mi-Gym. Una página ajena no puede mandarla sin
//   un preflight CORS, que este servidor nunca concede. Si el pedido trae Origin, tiene que ser uno propio.
export function protegerPedidos({ lan = false, direcciones = () => [] } = {}) {
  const propios = puerto => {
    const nombres = ['127.0.0.1', 'localhost', '[::1]'];
    if (lan) {
      for (const u of direcciones(puerto)) { try { nombres.push(new URL(u).host.replace(/:\d+$/, '')); } catch { /* inválida */ } }
    }
    return new Set(nombres.map(n => `${n}:${puerto}`));
  };
  return (req, res, next) => {
    const puerto = req.socket.localPort;
    const permitidos = propios(puerto);
    const host = String(req.headers.host ?? '').toLowerCase();
    if (!permitidos.has(host)) return res.status(403).type('text/plain').send('Host no permitido');
    if (!METODOS_SEGUROS.has(req.method) && req.originalUrl.split('?')[0].startsWith('/api')) {
      if (req.headers['x-mi-gym'] !== '1') return res.status(403).json({ error: 'Falta la cabecera X-Mi-Gym' });
      const origen = req.headers.origin;
      if (origen !== undefined && !(origen.toLowerCase().startsWith('http://') && permitidos.has(origen.toLowerCase().slice(7)))) {
        return res.status(403).json({ error: 'Origen no permitido' });
      }
    }
    next();
  };
}

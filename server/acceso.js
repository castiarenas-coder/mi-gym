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

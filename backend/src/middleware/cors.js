export function createCorsMiddleware({ isAllowedOrigin }) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Telegram-Init-Data, x-novanet-session-id, ngrok-skip-browser-warning, Idempotency-Key');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

// Development only. The UddoktaPay sandbox drops the port from redirect_url, so after paying it
// sends the browser to http://localhost/payment/return?... (port 80), where nothing listens.
// This tiny server listens on 127.0.0.1:80 and forwards /payment/* to the web app.
// Real domains have no port, so production never needs it. Started by `pnpm dev`; if port 80 is
// taken or not allowed, it says so and exits without stopping the other dev processes.
import http from 'node:http';

if (process.env.NODE_ENV === 'production') process.exit(0);
const target = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const handler = (req, res) => {
  const path = req.url ?? '/';
  if (!path.startsWith('/payment/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Dev payment-return forwarder: only /payment/* is forwarded.');
    return;
  }
  res.writeHead(307, { Location: target + path });
  res.end();
};

// Browsers try IPv6 (::1) and IPv4 for "localhost"; listen on both, as long as one works.
let listening = 0;
let failed = 0;
for (const host of ['127.0.0.1', '::1']) {
  const server = http.createServer(handler);
  server.on('error', (err) => {
    failed += 1;
    if (failed === 2 && listening === 0) {
      console.warn(
        `Payment return forwarder not started (${err.code ?? err.message}). After a sandbox ` +
          'payment, add :3000 to the address by hand.',
      );
      process.exit(0);
    }
  });
  server.listen(80, host, () => {
    listening += 1;
    if (listening === 1)
      console.log(`Payment return forwarder: http://localhost/payment/* -> ${target}/payment/*`);
  });
}

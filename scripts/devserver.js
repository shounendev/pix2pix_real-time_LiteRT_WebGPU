import * as esbuild from 'esbuild';
import http from 'node:http';

let ctx = await esbuild.context({
  bundle: true,
  target: 'es2020',
  outfile: 'dist/_demo_bin.js',
  sourcemap: true,
  entryPoints: ['src/index.ts'],
});

let {host, port} = await ctx.serve({servedir: 'dist', port: 3003});

http.createServer((req, res) => {
      const options = {
        hostname: host,
        port: port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      };

      const proxyReq = http.request(options, proxyRes => {
        if (proxyRes.statusCode === 404) {
          res.writeHead(404, {'Content-Type': 'text/html'});
          res.end('<h1>Not found</h1>');
          return;
        }

        const headers = {
          ...proxyRes.headers,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        };
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res, {end: true});
      });

      req.pipe(proxyReq, {end: true});
    })
    .listen(8001);

console.log('Server listening on http://localhost:8001');
await ctx.watch();

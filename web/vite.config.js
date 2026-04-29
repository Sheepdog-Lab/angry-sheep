export default {
  root: '.',
  server: {
    open: true,
    // Lets Cursor / Simple Browser and LAN devices reach the dev server (not only 127.0.0.1 loopback quirks).
    host: true,
    // Dev: run `cd server/mp-relay && npm i && npm start` then Vite proxies WS here.
    proxy: {
      '/mp-ws': {
        target: 'ws://127.0.0.1:8788',
        ws: true,
        changeOrigin: true,
      },
    },
  },
};

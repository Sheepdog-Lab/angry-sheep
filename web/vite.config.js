export default {
  root: '.',
  server: {
    open: true,
    // Lets Cursor / Simple Browser and LAN devices reach the dev server (not only 127.0.0.1 loopback quirks).
    host: true,
  },
};

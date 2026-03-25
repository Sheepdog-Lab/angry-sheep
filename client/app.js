(function () {
  const WS_URL = "ws://localhost:8765";
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function parsePayload(raw) {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return { width: canvas.width, height: canvas.height, markers: data };
    }
    return {
      width: data.width || canvas.width,
      height: data.height || canvas.height,
      markers: data.markers || [],
    };
  }

  function draw(markers, frameW, frameH) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, h);

    const fw = frameW || w;
    const fh = frameH || h;
    const sx = w / fw;
    const sy = h / fh;

    markers.forEach(function (m) {
      const x = m.x * sx;
      const y = m.y * sy;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#58a6ff";
      ctx.fill();
      ctx.strokeStyle = "#c9d1d9";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f0f6fc";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(m.id), x, y);
    });
  }

  function connect() {
    setStatus("Connecting…");
    let socket;
    try {
      socket = new WebSocket(WS_URL);
    } catch (e) {
      setStatus("WebSocket error: " + e.message, "err");
      return;
    }

    socket.addEventListener("open", function () {
      setStatus("Connected — " + WS_URL, "ok");
    });

    socket.addEventListener("message", function (ev) {
      try {
        const { width, height, markers } = parsePayload(ev.data);
        draw(markers, width, height);
      } catch (e) {
        setStatus("Bad message: " + e.message, "err");
      }
    });

    socket.addEventListener("close", function () {
      setStatus("Disconnected — retrying in 2s…", "err");
      setTimeout(connect, 2000);
    });

    socket.addEventListener("error", function () {
      setStatus("Connection error", "err");
    });
  }

  connect();
})();

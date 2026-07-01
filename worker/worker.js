function toBase64Url(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRegion(value) {
  return String(value || "").trim().toLowerCase();
}

function buildSsUrl(server) {
  const userInfo = `${server.method}:${server.password}`;
  const encoded = toBase64Url(userInfo);
  return `ss://${encoded}@${server.server}:${server.port}/?outline=1`;
}

function buildSsconfUrl(origin, token, region) {
  const host = origin.replace(/^https?:\/\//, "");
  return `ssconf://${host}/sub/${encodeURIComponent(token)}/${encodeURIComponent(region)}.json#NovaNetMM`;
}

function buildOpenUrl(origin, token, region) {
  return `${origin}/open/${encodeURIComponent(token)}/${encodeURIComponent(region)}`;
}

function buildJsonConfig(server) {
  const label = `NovaNet MM ${server.region || server.tag || "server"}`;

  return {
    server: server.server,
    server_port: server.port,
    password: server.password,
    method: server.method,
  };
}

function pickServer(servers, region) {
  if (!Array.isArray(servers) || servers.length === 0) return null;

  if (region) {
    const wanted = normalizeRegion(region);
    const matched = servers.find(
      (item) => normalizeRegion(item.region) === wanted
    );
    if (matched) return matched;
  }

  return servers[0];
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function textResponse(text, status = 200, extraHeaders = {}) {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function fetchSubscription(env, token) {
  if (!env.BACKEND_BASE_URL) {
    throw new Error("Missing BACKEND_BASE_URL");
  }

  const backendUrl =
    `${env.BACKEND_BASE_URL.replace(/\/$/, "")}` +
    `/api/public/subscription?token=${encodeURIComponent(token)}`;

  const resp = await fetch(backendUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
      "ngrok-skip-browser-warning": "true",
    },
  });

  if (!resp.ok) {
    let errorBody = null;
    try {
      errorBody = await resp.json();
    } catch {
      errorBody = { error: await resp.text() };
    }

    const err = new Error(errorBody?.error || "Upstream error");
    err.status = resp.status;
    err.payload = errorBody;
    throw err;
  }

  const payload = await resp.json();

  if (!payload?.ok) {
    const err = new Error(payload?.error || "Invalid subscription payload");
    err.status = 400;
    err.payload = payload;
    throw err;
  }

  if (!Array.isArray(payload.servers) || payload.servers.length === 0) {
    const err = new Error("No active servers available");
    err.status = 404;
    throw err;
  }

  return payload;
}

function buildPortalHtml({ token, payload, origin }) {
  const customerName = escapeHtml(payload.customer?.full_name || "Customer");
  const expiresAt = payload.expires_at
    ? new Date(payload.expires_at).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Unknown";

  const serverCards = payload.servers
    .map((server) => {
      const region = escapeHtml(server.region || "server");
      const tag = escapeHtml(server.tag || region);
      const openUrl = buildOpenUrl(origin, token, server.region);
      const jsonUrl = `${origin}/sub/${encodeURIComponent(token)}/${encodeURIComponent(
        server.region
      )}.json`;

      return `
        <div class="card">
          <div class="row">
            <div>
              <div class="title">${tag}</div>
              <div class="muted">${region}</div>
            </div>
            <div class="badge">${region}</div>
          </div>

          <div class="meta">
            <div><span>Host</span><strong>${escapeHtml(server.server)}</strong></div>
            <div><span>Port</span><strong>${escapeHtml(server.port)}</strong></div>
            <div><span>Method</span><strong>${escapeHtml(server.method)}</strong></div>
          </div>

          <div class="actions">
            <a class="btn primary" href="${openUrl}" target="_blank" rel="noopener noreferrer">Add To Outline</a>
            <button class="btn" onclick="copyText('${openUrl}')">Copy Import URL</button>
            <button class="btn" onclick="copySs('${escapeHtml(
              buildSsUrl(server)
            )}')">Copy ss://</button>
            <a class="btn" href="${jsonUrl}" target="_blank" rel="noopener noreferrer">View JSON</a>
          </div>
        </div>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NovaNet MM</title>
  <style>
    :root {
      --bg: #06070c;
      --panel: #0d1320;
      --card: #10192a;
      --line: rgba(255,255,255,0.08);
      --text: #f4f7fb;
      --muted: #a7b2c5;
      --brand1: #10b7e8;
      --brand2: #3970ff;
      --green: #19c37d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background:
        radial-gradient(circle at top, rgba(57,112,255,0.18), transparent 35%),
        linear-gradient(180deg, #070b12 0%, #04060a 100%);
      color: var(--text);
    }
    .wrap {
      max-width: 760px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
    .hero, .card, .info {
      background: linear-gradient(180deg, rgba(15,24,40,0.96), rgba(10,16,28,0.96));
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.28);
    }
    .hero {
      padding: 22px;
      margin-bottom: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }
    .brand h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
    }
    .sub {
      color: var(--muted);
      margin-top: 6px;
      font-size: 14px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(25,195,125,0.12);
      color: #7ee2b4;
      font-weight: 600;
      font-size: 13px;
      border: 1px solid rgba(25,195,125,0.18);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .info {
      padding: 16px;
    }
    .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }
    .value {
      font-size: 18px;
      font-weight: 700;
      word-break: break-word;
    }
    .section-title {
      margin: 24px 2px 12px;
      font-size: 20px;
      font-weight: 700;
    }
    .card {
      padding: 18px;
      margin-bottom: 14px;
    }
    .row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .muted {
      color: var(--muted);
      font-size: 14px;
    }
    .badge {
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(57,112,255,0.12);
      color: #9db7ff;
      border: 1px solid rgba(57,112,255,0.2);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0,1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .meta div {
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
    }
    .meta span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .meta strong {
      display: block;
      font-size: 14px;
      word-break: break-word;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .btn {
      appearance: none;
      border: 0;
      text-decoration: none;
      cursor: pointer;
      padding: 12px 16px;
      border-radius: 14px;
      font-weight: 700;
      font-size: 14px;
      background: rgba(255,255,255,0.06);
      color: var(--text);
      border: 1px solid var(--line);
    }
    .btn.primary {
      background: linear-gradient(90deg, var(--brand1), var(--brand2));
      color: white;
      border: 0;
    }
    .notice {
      margin-top: 18px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .toast {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      background: rgba(18, 26, 42, 0.96);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 10px 14px;
      color: white;
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms ease;
    }
    .toast.show { opacity: 1; }
    @media (max-width: 640px) {
      .grid, .meta {
        grid-template-columns: 1fr;
      }
      .brand {
        flex-direction: column;
        align-items: flex-start;
      }
      .title {
        font-size: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="brand">
        <div>
          <h1>NovaNet MM</h1>
          <div class="sub">Customer VPN Portal</div>
        </div>
        <div class="pill">Active Access</div>
      </div>

      <div class="grid">
        <div class="info">
          <div class="label">Customer</div>
          <div class="value">${customerName}</div>
        </div>
        <div class="info">
          <div class="label">Valid Until</div>
          <div class="value">${escapeHtml(expiresAt)}</div>
        </div>
        <div class="info">
          <div class="label">Access Token</div>
          <div class="value">${escapeHtml(token)}</div>
        </div>
        <div class="info">
          <div class="label">Available Regions</div>
          <div class="value">${payload.servers.length}</div>
        </div>
      </div>

      <div class="notice">
        Choose a region below, then open the key in Outline or copy the raw <code>ss://</code> key.
      </div>
    </div>

    <div class="section-title">Available Servers</div>
    ${serverCards}
  </div>

  <div id="toast" class="toast">Copied</div>

  <script>
    function showToast(message) {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1600);
    }

    async function copyText(value) {
      try {
        await navigator.clipboard.writeText(value);
        showToast("Copied");
      } catch {
        showToast("Copy failed");
      }
    }

    async function copySs(value) {
      try {
        await navigator.clipboard.writeText(value);
        showToast("ss:// copied");
      } catch {
        showToast("Copy failed");
      }
    }
  </script>
</body>
</html>`;
}

function buildOpenInOutlineHtml({ origin, token, server }) {
  const region = server.region;
  const tag = escapeHtml(server.tag || region || "server");
  const ssconfUrl = buildSsconfUrl(origin, token, region);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>NovaNet MM</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: #000;
      color: #fff;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 20px 40px;
    }
    .wrap {
      width: 100%;
      max-width: 420px;
      text-align: center;
    }
    .logo {
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 10px;
    }
    .title {
      font-size: 34px;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 18px;
    }
    .server {
      font-size: 16px;
      opacity: 0.8;
      margin-bottom: 28px;
    }
    .status {
      font-size: 15px;
      opacity: 0.78;
      margin-bottom: 18px;
      line-height: 1.5;
    }
    .primary, .download {
      display: block;
      width: 100%;
      text-decoration: none;
      text-align: center;
      border-radius: 14px;
      font-weight: 800;
      padding: 16px 18px;
      font-size: 18px;
      border: 0;
      cursor: pointer;
    }
    .primary {
      background: linear-gradient(90deg, #18b8eb, #4477ff);
      color: white;
      margin-bottom: 18px;
    }
    .download {
      background: #16203a;
      color: white;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .copy {
      margin-top: 18px;
      font-size: 13px;
      opacity: 0.65;
      cursor: pointer;
      word-break: break-word;
    }
    .hidden-launch {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">NovaNet MM</div>
    <div class="title">Add Key To Outline</div>
    <div class="server">${tag}</div>

    <div class="status" id="status-text">
      Opening Outline...
    </div>

    <a class="primary" id="open-link" href="${ssconfUrl}">Add Key To Outline</a>

    <a class="download" href="https://getoutline.org/">
      Go to Download Center
    </a>

    <div class="copy" id="copy-link">Copy ssconf:// link</div>
    <a class="hidden-launch" id="hidden-launch" href="${ssconfUrl}">launch</a>
  </div>

  <script>
    const ssconfUrl = ${JSON.stringify(ssconfUrl)};
    const statusText = document.getElementById("status-text");
    const hiddenLaunch = document.getElementById("hidden-launch");

    async function copyText(value) {
      try {
        await navigator.clipboard.writeText(value);
        alert("Copied");
      } catch {
        alert("Copy failed");
      }
    }

    function launchOutline() {
      try {
        hiddenLaunch.click();
      } catch {}

      try {
        window.location.replace(ssconfUrl);
      } catch {}

      try {
        window.location.href = ssconfUrl;
      } catch {}

      try {
        window.location.assign(ssconfUrl);
      } catch {}
    }

    document.getElementById("copy-link").addEventListener("click", () => copyText(ssconfUrl));

    document.getElementById("open-link").addEventListener("click", (event) => {
      event.preventDefault();
      launchOutline();
    });

    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        launchOutline();
      }, 10);
    });

    setTimeout(() => {
      statusText.textContent = "If Outline did not open automatically, tap the button below.";
    }, 900);
  </script>
</body>
</html>`;
}

function buildBridgeErrorHtml(message) {
  const safe = escapeHtml(message);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Invalid Request</title>
  <style>
    body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;
         display:flex;align-items:center;justify-content:center;min-height:100vh;
         padding:24px;text-align:center;}
    p{opacity:.7;font-size:15px;max-width:300px;line-height:1.5;}
  </style>
</head>
<body><p>${safe}</p></body>
</html>`;
}

function buildMiniAppBridgeHtml({ ssconfUrl }) {
  // escapeHtml handles & < > " ' — safe for href attributes and visible text
  const safeUrl = escapeHtml(ssconfUrl);
  // For embedding inside <script>: JSON.stringify handles control chars, then
  // unicode-escape < > & to prevent HTML-parser confusion (e.g. </script> injection)
  const safeUrlJs = JSON.stringify(ssconfUrl)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>NovaNet MM — Add to Outline</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; min-height: 100%;
      background: #000; color: #fff;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body { display: flex; align-items: center; justify-content: center; padding: 24px 20px 40px; }
    .wrap { width: 100%; max-width: 420px; text-align: center; }
    .logo { font-size: 20px; font-weight: 800; margin-bottom: 10px; }
    .title { font-size: 34px; font-weight: 800; line-height: 1.15; margin-bottom: 18px; }
    .status { font-size: 15px; opacity: 0.78; margin-bottom: 18px; line-height: 1.5; }
    .primary, .download {
      display: block; width: 100%; text-decoration: none; text-align: center;
      border-radius: 14px; font-weight: 800; padding: 16px 18px;
      font-size: 18px; border: 0; cursor: pointer;
    }
    .primary {
      background: linear-gradient(90deg, #18b8eb, #4477ff);
      color: white; margin-bottom: 12px;
    }
    .download {
      background: #16203a; color: white;
      border: 1px solid rgba(255,255,255,0.08); margin-bottom: 20px;
    }
    .copy-block { text-align: left; }
    .copy-label { font-size: 13px; opacity: 0.6; margin-bottom: 8px; }
    .copy-url {
      display: block; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
      padding: 10px 12px; font-size: 12px; word-break: break-all;
      opacity: 0.75; margin-bottom: 8px; font-family: monospace;
    }
    .copy-btn {
      appearance: none; background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
      color: white; cursor: pointer; font-size: 13px;
      font-weight: 700; padding: 8px 14px; width: 100%;
    }
    .hidden-launch { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .toast {
      position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
      background: rgba(18,26,42,0.96); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 999px; padding: 10px 14px; color: white;
      opacity: 0; pointer-events: none; transition: opacity 180ms ease; white-space: nowrap;
    }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">NovaNet MM</div>
    <div class="title">Add Key To Outline</div>

    <div class="status" id="status-text">Opening Outline…</div>

    <a class="primary" id="open-link" href="${safeUrl}">Add Key To Outline</a>

    <a class="download" href="https://getoutline.org/" rel="noopener noreferrer">
      Get Outline App
    </a>

    <div class="copy-block">
      <div class="copy-label">If Outline didn't open, copy and paste into Outline manually:</div>
      <code class="copy-url" id="copy-url">${safeUrl}</code>
      <button class="copy-btn" id="copy-btn">Copy Key</button>
    </div>

    <a class="hidden-launch" id="hidden-launch" href="${safeUrl}">launch</a>
  </div>

  <div id="toast" class="toast">Copied</div>

  <script>
    const ssconfUrl = ${safeUrlJs};

    function showToast(msg) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), 1600);
    }

    document.getElementById("copy-btn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ssconfUrl);
        showToast("Key copied");
      } catch {
        showToast("Copy failed — select the text above");
      }
    });

    document.getElementById("open-link").addEventListener("click", (e) => {
      e.preventDefault();
      launchOutline();
    });

    function launchOutline() {
      try { document.getElementById("hidden-launch").click(); } catch {}
      try { window.location.replace(ssconfUrl); } catch {}
      try { window.location.href = ssconfUrl; } catch {}
      try { window.location.assign(ssconfUrl); } catch {}
    }

    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(launchOutline, 10);
    });

    setTimeout(() => {
      document.getElementById("status-text").textContent =
        "If Outline didn't open automatically, tap the button above.";
    }, 900);
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/") {
        return jsonResponse({
          ok: true,
          name: "NovaNet MM Customer Portal",
          routes: {
            portal: "/t/<token>",
            ss: "/sub/<token>.ss",
            json: "/sub/<token>.json",
            region_ss: "/sub/<token>/<region>.ss",
            region_json: "/sub/<token>/<region>.json",
            open: "/open/<token>/<region>",
          },
        });
      }

      const portalMatch = path.match(/^\/t\/([^/]+)$/);
      if (portalMatch) {
        const token = portalMatch[1];
        const payload = await fetchSubscription(env, token);

        return htmlResponse(
          buildPortalHtml({
            token,
            payload,
            origin: url.origin,
          })
        );
      }

      const simpleMatch = path.match(/^\/sub\/([^/]+)\.(json|ss)$/);
      if (simpleMatch) {
        const [, token, format] = simpleMatch;
        const region = url.searchParams.get("region");
        const payload = await fetchSubscription(env, token);
        const selected = pickServer(payload.servers, region);

        if (!selected) {
          return jsonResponse({ error: "Requested region not available" }, 404);
        }

        if (format === "ss") {
          return textResponse(buildSsUrl(selected));
        }

        return jsonResponse(buildJsonConfig(selected));
      }

      const regionMatch = path.match(/^\/sub\/([^/]+)\/([^/]+)\.(json|ss)$/);
      if (regionMatch) {
        const [, token, region, format] = regionMatch;
        const payload = await fetchSubscription(env, token);
        const selected = pickServer(payload.servers, region);

        if (!selected) {
          return jsonResponse({ error: "Requested region not available" }, 404);
        }

        if (format === "ss") {
          return textResponse(buildSsUrl(selected));
        }

        return jsonResponse(buildJsonConfig(selected));
      }

      const openMatch = path.match(/^\/open\/([^/]+)\/([^/]+)$/);
      if (openMatch) {
        const [, token, region] = openMatch;
        const payload = await fetchSubscription(env, token);
        const selected = pickServer(payload.servers, region);

        if (!selected) {
          return jsonResponse({ error: "Requested region not available" }, 404);
        }

        return htmlResponse(
          buildOpenInOutlineHtml({
            origin: url.origin,
            token,
            server: selected,
          })
        );
      }

      if (path === "/open-key") {
        const rawUrl = url.searchParams.get("url") || "";
        if (!rawUrl.startsWith("ssconf://")) {
          return htmlResponse(
            buildBridgeErrorHtml("Invalid link. Only Outline ssconf:// keys are accepted."),
            400
          );
        }
        return htmlResponse(buildMiniAppBridgeHtml({ ssconfUrl: rawUrl }));
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      return jsonResponse(
        {
          error: error?.message || "Worker crash",
        },
        error?.status || 500
      );
    }
  },
};

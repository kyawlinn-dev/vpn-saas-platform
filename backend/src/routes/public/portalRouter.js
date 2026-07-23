import express from "express";

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendHtml(res, html, status = 200) {
  res
    .status(status)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .send(html);
}

function buildMiniAppBridgeHtml({ ssconfUrl }) {
  const safeUrl = escapeHtml(ssconfUrl);
  const safeUrlJs = JSON.stringify(ssconfUrl)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>NovaNet MM - Add to Outline</title>
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}
    html,body{margin:0;padding:0;min-height:100%;background:#000;color:#fff;font-family:Inter,system-ui,-apple-system,sans-serif}
    body{display:flex;align-items:center;justify-content:center;padding:24px 20px 40px}
    .wrap{width:100%;max-width:420px;text-align:center}
    .logo{font-size:20px;font-weight:800;margin-bottom:10px}
    .title{font-size:34px;font-weight:800;line-height:1.15;margin-bottom:18px}
    .status{font-size:15px;opacity:.78;margin-bottom:18px;line-height:1.5}
    .primary,.download{display:block;width:100%;text-decoration:none;text-align:center;border-radius:14px;font-weight:800;padding:16px 18px;font-size:18px;border:0;cursor:pointer}
    .primary{background:linear-gradient(90deg,#18b8eb,#4477ff);color:white;margin-bottom:12px}
    .download{background:#16203a;color:white;border:1px solid rgba(255,255,255,.08);margin-bottom:20px}
    .copy-block{text-align:left}
    .copy-label{font-size:13px;opacity:.6;margin-bottom:8px}
    .copy-url{display:block;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;font-size:12px;word-break:break-all;opacity:.75;margin-bottom:8px;font-family:monospace}
    .copy-btn{appearance:none;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:white;cursor:pointer;font-size:13px;font-weight:700;padding:8px 14px;width:100%}
    .hidden-launch{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
    .toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:rgba(18,26,42,.96);border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:10px 14px;color:white;opacity:0;pointer-events:none;transition:opacity 180ms ease;white-space:nowrap}
    .toast.show{opacity:1}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">NovaNet MM</div>
    <div class="title">Add Key To Outline</div>
    <div class="status" id="status-text">Opening Outline...</div>
    <a class="primary" id="open-link" href="${safeUrl}">Add Key To Outline</a>
    <a class="download" href="https://getoutline.org/" rel="noopener noreferrer">Get Outline App</a>
    <div class="copy-block">
      <div class="copy-label">If Outline did not open, copy and paste into Outline manually:</div>
      <code class="copy-url" id="copy-url">${safeUrl}</code>
      <button class="copy-btn" id="copy-btn">Copy Key</button>
    </div>
    <a class="hidden-launch" id="hidden-launch" href="${safeUrl}">launch</a>
  </div>
  <div id="toast" class="toast">Copied</div>
  <script>
    const ssconfUrl=${safeUrlJs};
    function showToast(m){const el=document.getElementById("toast");el.textContent=m;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1600)}
    function launch(){try{document.getElementById("hidden-launch").click()}catch{}try{window.location.replace(ssconfUrl)}catch{}try{window.location.href=ssconfUrl}catch{}}
    document.getElementById("copy-btn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(ssconfUrl);showToast("Key copied")}catch{showToast("Copy failed - select the text above")}})
    document.getElementById("open-link").addEventListener("click",e=>{e.preventDefault();launch()})
    window.addEventListener("DOMContentLoaded",()=>setTimeout(launch,10))
    setTimeout(()=>{document.getElementById("status-text").textContent="If Outline did not open automatically, tap the button above."},900)
  </script>
</body>
</html>`;
}

function buildBridgeErrorHtml(message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invalid Request</title>
  <style>body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}p{opacity:.7;font-size:15px;max-width:300px;line-height:1.5}</style>
</head>
<body><p>${escapeHtml(message)}</p></body>
</html>`;
}

// GET /open-key?url=ssconf://... - Outline add-key bridge for bot and Mini App.
router.get("/open-key", (req, res) => {
  const rawUrl = String(req.query.url || "");
  if (!rawUrl.startsWith("ssconf://")) {
    return sendHtml(
      res,
      buildBridgeErrorHtml("Invalid link. Only Outline ssconf:// keys are accepted."),
      400
    );
  }

  return sendHtml(res, buildMiniAppBridgeHtml({ ssconfUrl: rawUrl }));
});

export default router;

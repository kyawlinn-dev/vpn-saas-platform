export const API_BASE = String(
  import.meta.env.VITE_BACKEND_BASE_URL || ""
).replace(/\/$/, "");

function buildUrl(path) {
  if (!API_BASE) {
    throw new Error("Missing VITE_BACKEND_BASE_URL");
  }

  if (path.startsWith("http")) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseResponse(response) {
  const text = await response.text();

  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `Request failed: ${response.status}`
    );
  }

  return payload;
}

export async function requestJson(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    ...options,
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(options.headers || {}),
    },
  });

  return parseResponse(response);
}

export async function postJson(path, body, options = {}) {
  const response = await fetch(buildUrl(path), {
    ...options,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(options.headers || {}),
    },
    body: JSON.stringify(body || {}),
  });

  return parseResponse(response);
}
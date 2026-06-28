function decodeBase64Flexible(input) {
  const normalized = String(input || "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitMethodAndPassword(value) {
  const raw = safeDecodeURIComponent(String(value || "").trim());
  const colonIndex = raw.indexOf(":");

  if (colonIndex !== -1) {
    return {
      method: raw.slice(0, colonIndex).trim(),
      password: raw.slice(colonIndex + 1),
    };
  }

  const decoded = decodeBase64Flexible(raw);
  const decodedColonIndex = decoded.indexOf(":");

  if (decodedColonIndex === -1) {
    throw new Error("Invalid Shadowsocks credentials payload");
  }

  return {
    method: decoded.slice(0, decodedColonIndex).trim(),
    password: decoded.slice(decodedColonIndex + 1),
  };
}

function normalizeServer(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw.slice(1, -1).trim();
  }

  return raw;
}

export function parseSsUrl(ssUrl) {
  if (!ssUrl || typeof ssUrl !== "string") {
    throw new Error("Invalid ssUrl");
  }

  const raw = ssUrl.trim();

  if (!raw.startsWith("ss://")) {
    throw new Error("Invalid ssUrl");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid ssUrl: ${error.message}`);
  }

  let credentialsPart = parsedUrl.username || "";
  let server = normalizeServer(parsedUrl.hostname);
  let port = parsedUrl.port ? Number(parsedUrl.port) : NaN;

  // Supports:
  // 1) ss://BASE64(method:password)@host:port/?outline=1
  // 2) ss://BASE64(method:password@host:port)
  const encodedCombinedCandidate =
    !credentialsPart && !parsedUrl.port
      ? `${parsedUrl.hostname || ""}${parsedUrl.pathname || ""}`.replace(/^\//, "").trim()
      : `${credentialsPart}${parsedUrl.pathname || ""}`.replace(/^\//, "").trim();

  if ((!credentialsPart || Number.isNaN(port)) && encodedCombinedCandidate) {
    const decodedCombined = decodeBase64Flexible(
      safeDecodeURIComponent(encodedCombinedCandidate)
    );

    const atIndex = decodedCombined.lastIndexOf("@");
    const colonIndex = decodedCombined.lastIndexOf(":");

    if (atIndex !== -1 && colonIndex !== -1 && colonIndex > atIndex) {
      credentialsPart = decodedCombined.slice(0, atIndex);
      server = normalizeServer(decodedCombined.slice(atIndex + 1, colonIndex));
      port = Number(decodedCombined.slice(colonIndex + 1));
    }
  }

  const { method, password } = splitMethodAndPassword(credentialsPart);

  if (!server || Number.isNaN(port) || port <= 0) {
    throw new Error("Invalid parsed server config");
  }

  if (!method || password === "") {
    throw new Error("Invalid parsed Shadowsocks credentials");
  }

  return {
    server,
    port,
    method,
    password,
  };
}
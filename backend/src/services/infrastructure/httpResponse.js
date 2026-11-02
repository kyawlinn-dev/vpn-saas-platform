export async function readBoundedJson(response, maxBytes = 4194304) {
  if (Number(response.headers?.get('content-length')) > maxBytes) throw new Error('RESPONSE_TOO_LARGE');
  const reader = response.body?.getReader();
  if (!reader) return null;
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const content = Buffer.concat(chunks).toString('utf8');
  return content ? JSON.parse(content) : null;
}

// Web Crypto SHA-256 → lowercase hex. Used everywhere we need a stable
// content-addressed key (snapshot blobs, plugin caches, recipe inputs).
//
// Accepts either bytes or a UTF-8 string for convenience.
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  // Copy into a fresh buffer — `crypto.subtle.digest` requires a
  // BufferSource it can detach, and `Uint8Array<ArrayBufferLike>` from
  // wasm/IDB may already be aliased.
  const copy = new Uint8Array(bytes).buffer;
  const buf = await crypto.subtle.digest("SHA-256", copy);
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

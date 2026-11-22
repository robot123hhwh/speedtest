export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Timing-Allow-Origin": "*",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // 1. Connection, Geo-Coordinates & Edge Metadata
  if (mode === "meta") {
    const cf = request.cf || {};
    const lat = Number(cf.latitude);
    const lon = Number(cf.longitude);

    return new Response(
      JSON.stringify({
        ip: request.headers.get("cf-connecting-ip") || "Unknown",
        colo: cf.colo || "AUTO",
        city: cf.city || "Unknown",
        country: cf.country || "",
        isp: cf.asOrganization || "Unknown ISP",
        asn: cf.asn ? `AS${cf.asn}` : "",
        lat: Number.isFinite(lat) && lat !== 0 ? lat : -43.532,
        lon: Number.isFinite(lon) && lon !== 0 ? lon : 172.636,
        httpProtocol: cf.httpProtocol || "HTTP/2",
        tlsVersion: cf.tlsVersion || "TLSv1.3",
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // 2. Ultra-fast Ping endpoint
  if (mode === "ping") {
    return new Response(null, { status: 204, headers });
  }

  // 3. Fallback Download stream endpoint
  if (mode === "down") {
    const mb = Math.min(Math.max(parseInt(url.searchParams.get("mb") || "25", 10) || 25, 1), 50);
    const totalBytes = mb * 1024 * 1024;
    const chunkSize = 65536;
    const chunk = new Uint8Array(chunkSize);
    crypto.getRandomValues(chunk);

    let sent = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (sent >= totalBytes) {
          controller.close();
          return;
        }
        const remaining = totalBytes - sent;
        const size = Math.min(remaining, chunkSize);
        controller.enqueue(size === chunkSize ? chunk : chunk.subarray(0, size));
        sent += size;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(totalBytes),
      },
    });
  }

  // 4. Fallback Upload sink (native arrayBuffer drain avoids JS loop CPU 1102 limits)
  if (mode === "up" && request.method === "POST") {
    let bytes = 0;
    if (request.body) {
      const buf = await request.arrayBuffer();
      bytes = buf.byteLength;
    }
    return new Response(JSON.stringify({ ok: true, bytes }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response("Invalid mode", { status: 400, headers });
}

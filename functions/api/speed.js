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

  // 3. Download stream endpoint
  if (mode === "down") {
    const mb = Math.min(Math.max(parseInt(url.searchParams.get("mb") || "50", 10) || 50, 1), 100);
    const totalBytes = mb * 1024 * 1024;
    const chunkSize = 65536; // 64KB chunks
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

  // 4. Zero-allocation Streaming Upload Sink (prevents Worker RAM/GC stalls on 500+ Mbps)
  if (mode === "up" && request.method === "POST") {
    let received = 0;
    if (request.body) {
      const reader = request.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
        }
      } catch {
        // Client aborted stream at end of test window — normal
      }
    }
    return new Response(JSON.stringify({ ok: true, bytes: received }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response("Invalid mode", { status: 400, headers });
}

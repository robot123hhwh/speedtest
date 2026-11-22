export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Access-Control-Allow-Origin": "*",
    "Timing-Allow-Origin": "*",
  };

  // 1. Connection, Geo-Coordinates & Edge Metadata
  if (mode === "meta") {
    const cf = request.cf || {};
    return new Response(
      JSON.stringify({
        ip: request.headers.get("cf-connecting-ip") || "Unknown",
        colo: cf.colo || "AUTO",
        city: cf.city || "Unknown",
        isp: cf.asOrganization || "Unknown ISP",
        asn: cf.asn ? `AS${cf.asn}` : "",
        lat: cf.latitude || -43.532, // Falls back to Christchurch coords if masked
        lon: cf.longitude || 172.636,
        httpProtocol: cf.httpProtocol || "HTTP/2",
        tlsVersion: cf.tlsVersion || "TLSv1.3",
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // 2. Ultra-fast Ping endpoint
  if (mode === "ping") {
    return new Response("", { status: 204, headers });
  }

  // 3. Download stream endpoint
  if (mode === "down") {
    const mb = Math.min(parseInt(url.searchParams.get("mb") || "50", 10), 100);
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
        controller.enqueue(chunk.subarray(0, size));
        sent += size;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { ...headers, "Content-Type": "application/octet-stream" },
    });
  }

  // 4. Max-Throughput Upload Sink (Reads buffer instantly to unlock 500+ Mbps)
  if (mode === "up" && request.method === "POST") {
    if (request.body) {
      await request.arrayBuffer(); 
    }
    return new Response("ok", { status: 200, headers });
  }

  return new Response("Invalid mode", { status: 400, headers });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Access-Control-Allow-Origin": "*",
  };

  // 0. Connection & Edge Metadata endpoint
  if (mode === "meta") {
    const cf = request.cf || {};
    const ip = request.headers.get("cf-connecting-ip") || "Unknown";
    return new Response(
      JSON.stringify({
        ip,
        colo: cf.colo || "AUTO",
        city: cf.city || "Unknown",
        country: cf.country || "",
        isp: cf.asOrganization || "Unknown ISP",
        asn: cf.asn ? `AS${cf.asn}` : "",
        httpProtocol: cf.httpProtocol || "HTTP/2",
        tlsVersion: cf.tlsVersion || "TLSv1.3",
      }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  }

  // 1. Ping / Jitter / Packet Loss endpoint
  if (mode === "ping") {
    return new Response("pong", { status: 200, headers });
  }

  // 2. Download stream endpoint
  if (mode === "down") {
    const mb = Math.min(parseInt(url.searchParams.get("mb") || "50", 10), 100);
    const totalBytes = mb * 1024 * 1024;
    const chunkSize = 65536; // 64KB
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
        if (remaining < chunkSize) {
          controller.enqueue(chunk.subarray(0, remaining));
          sent += remaining;
        } else {
          controller.enqueue(chunk);
          sent += chunkSize;
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
      },
    });
  }

  // 3. Upload sink endpoint
  if (mode === "up" && request.method === "POST") {
    const reader = request.body?.getReader();
    let received = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
      }
    }
    return new Response(JSON.stringify({ received }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response("Invalid mode", { status: 400, headers });
}

import { createHmac } from "crypto";

const VERCEL_SECRET = Bun.env.VERCEL_SECRET ?? "";
const VERCEL_HEADER_VALUE = Bun.env.VERCEL_HEADER_VALUE ?? "";
const LOKI_URL = Bun.env.LOKI_URL ?? "http://localhost:3100/loki/api/v1/push";
const JOB = Bun.env.JOB ?? "vercel";
const SERVICE_NAME = Bun.env.SERVICE_NAME ?? "vercel";

Bun.serve({
  port: 3000,

  async fetch(req) {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/") {
      return new Response("Not Found", { status: 404 });
    }

    const rawBody = await req.arrayBuffer();
    const bodyString = new TextDecoder().decode(rawBody);

    const hmac = createHmac("sha1", VERCEL_SECRET)
      .update(bodyString, "utf8")
      .digest("hex");

    const receivedSignature = req.headers.get("x-vercel-signature");

    if (!VERCEL_SECRET || hmac !== receivedSignature) {
      return new Response("Forbidden", { status: 403 });
    }

    let input;
    try {
      input = JSON.parse(bodyString);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!Array.isArray(input)) {
      return new Response(JSON.stringify({ status: "OK" }), {
        status: 200,
        headers: {
          "x-Vercel-Verify": VERCEL_HEADER_VALUE,
          "Content-Type": "application/json",
        },
      });
    }

    const values = input.map((log) => {
      const tsMs = log.timestamp || Date.now();
      const tsNs = `${tsMs}000000`;
      const message = log.message || "";
      return [tsNs, message];
    });

    const lokiPayload = {
      streams: [
        {
          stream: { job: JOB, service_name: SERVICE_NAME },
          values,
        },
      ],
    };

    await fetch(LOKI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lokiPayload),
    });

    return new Response(JSON.stringify({ status: "OK" }), {
      status: 200,
      headers: {
        "x-Vercel-Verify": VERCEL_HEADER_VALUE,
        "Content-Type": "application/json",
      },
    });
  },
});

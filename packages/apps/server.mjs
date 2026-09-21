// Purpose: Reuse Workbench's local authentication, persistence and lease for standalone decision applications.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Store } from "../core/store.mjs";
import { acquireWorkspace } from "../core/lease.mjs";
export async function createLocalApp({
  web,
  database = ":memory:",
  token = randomBytes(32).toString("hex"),
  handle,
  onError = console.error,
}) {
  if (typeof token !== "string" || token.length < 24)
    throw Error("Access token too short");
  const release = acquireWorkspace(database);
  let store;
  try {
    store = new Store(database);
  } catch (error) {
    release();
    throw error;
  }
  let active = 0;
  const server = http.createServer(async (req, res) => {
    let counted = false;
    const send = (status, value, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(type === "application/json" ? JSON.stringify(value) : value);
    };
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    try {
      const host = req.headers.host,
        port = server.address()?.port;
      if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host))
        throw Object.assign(Error("Loopback hosts only"), { status: 403 });
      const path = new URL(req.url, `http://${host}`).pathname;
      if (!path.startsWith("/api/")) {
        const file = {
          "/": "index.html",
          "/app.js": "app.js",
          "/styles.css": "styles.css",
        }[path];
        if (req.method !== "GET" || !file)
          throw Object.assign(Error("Not found"), { status: 404 });
        return send(
          200,
          await readFile(new URL(file, web)),
          file.endsWith(".html")
            ? "text/html"
            : file.endsWith(".css")
              ? "text/css"
              : "text/javascript",
        );
      }
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        throw Object.assign(Error("Cross-origin request denied"), {
          status: 403,
        });
      const actual = Buffer.from(req.headers.authorization ?? ""),
        expected = Buffer.from("Bearer " + token);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw Object.assign(Error("Local access token required"), {
          status: 401,
        });
      if (active >= 4)
        throw Object.assign(Error("Application busy"), { status: 429 });
      active++;
      counted = true;
      if (!["POST", "GET"].includes(req.method))
        throw Object.assign(Error("Method not allowed"), { status: 405 });
      let body = {};
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw Error("Send application/json");
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 4000000) throw Error("Request exceeds 4 MB");
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks));
        if (!body || Array.isArray(body) || typeof body !== "object")
          throw Error("JSON object required");
      }
      const result = await handle({ path, method: req.method, body, store });
      if (result === undefined)
        throw Object.assign(Error("Unknown API route"), { status: 404 });
      send(200, result);
    } catch (error) {
      if (!error.status) {
        store.event("error", { message: error.message });
        onError(error);
      }
      send(error.status ?? 400, { error: error.message });
    } finally {
      if (counted) active--;
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 10000;
  return {
    server,
    store,
    token,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      store.close();
      release();
    },
  };
}
export async function startLocalApp(options) {
  const app = await createLocalApp(options);
  await new Promise((resolve) =>
    app.server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", resolve),
  );
  console.log(
    `http://127.0.0.1:${app.server.address().port}/#token=${app.token}`,
  );
  process.once("SIGINT", async () => {
    await app.close();
    process.exit(0);
  });
  return app;
}

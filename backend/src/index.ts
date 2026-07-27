import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { discoveryRouter } from "./modules/discovery/router";
import { productsRouter } from "./modules/products/router";
import { contentRouter } from "./modules/content/router";
import { schedulerRouter } from "./modules/scheduler/router";
import { startAutoPoster } from "./modules/scheduler/auto-poster";

const app = new Hono();

// Middleware
app.use("*", cors());

// Health check
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Module routes
app.route("/api/discovery", discoveryRouter);
app.route("/api/products", productsRouter);
app.route("/api/content", contentRouter);
app.route("/api/scheduler", schedulerRouter);

// Start server — explicitly use 3001, ignoring any system PORT
const port = 3001;

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`🚀 TrendMint backend running on http://localhost:${server.port}`);

// Start auto-poster if enabled
startAutoPoster();

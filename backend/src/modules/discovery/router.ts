import { Hono } from "hono";

export const discoveryRouter = new Hono();

// GET /api/discovery — list discovered products
discoveryRouter.get("/", (c) => {
  return c.json({
    module: "discovery",
    description: "Reddit product discovery — coming soon",
    endpoints: ["GET /", "POST /scan"],
  });
});

// POST /api/discovery/scan — trigger a Reddit scan
discoveryRouter.post("/scan", (c) => {
  return c.json({ message: "Scan triggered (placeholder)" }, 202);
});

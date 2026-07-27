import { Hono } from "hono";
import { getDiscoveryService } from "./service";

export const discoveryRouter = new Hono();

// GET /api/discovery — current status
discoveryRouter.get("/", (c) => {
  try {
    const service = getDiscoveryService();
    const status = service.getStatus();
    return c.json(status);
  } catch (err) {
    return c.json(
      { error: "Failed to get discovery status", detail: String(err) },
      500
    );
  }
});

// GET /api/discovery/status — alias for status
discoveryRouter.get("/status", (c) => {
  try {
    const service = getDiscoveryService();
    const status = service.getStatus();
    return c.json(status);
  } catch (err) {
    return c.json(
      { error: "Failed to get discovery status", detail: String(err) },
      500
    );
  }
});

// POST /api/discovery/scan — trigger a scan
discoveryRouter.post("/scan", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));

    const service = getDiscoveryService();
    const result = await service.scan({
      subreddits: body.subreddits,
      limit: body.limit,
      sort: body.sort,
      time: body.time,
    });

    if (result.success) {
      return c.json(result, 200);
    } else {
      return c.json(result, 400);
    }
  } catch (err) {
    return c.json(
      {
        success: false,
        error: "Scan failed",
        detail: String(err),
      },
      500
    );
  }
});

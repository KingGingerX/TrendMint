import { Hono } from "hono";

export const schedulerRouter = new Hono();

// GET /api/scheduler — view posting queue
schedulerRouter.get("/", (c) => {
  return c.json({
    module: "scheduler",
    description: "Twitter/X posting queue — coming soon",
    endpoints: ["GET /", "POST /post", "GET /history"],
  });
});

// POST /api/scheduler/post — manually trigger a post
schedulerRouter.post("/post", (c) => {
  return c.json({ message: "Post triggered (placeholder)" }, 202);
});

// GET /api/scheduler/history — post history
schedulerRouter.get("/history", (c) => {
  return c.json({ posts: [], message: "Post history (placeholder)" });
});

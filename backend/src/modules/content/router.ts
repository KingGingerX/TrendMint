import { Hono } from "hono";

export const contentRouter = new Hono();

// GET /api/content — list generated posts
contentRouter.get("/", (c) => {
  return c.json({
    module: "content",
    description: "OpenAI content generation — coming soon",
    endpoints: ["GET /", "POST /generate"],
  });
});

// POST /api/content/generate — generate a post for a product
contentRouter.post("/generate", (c) => {
  return c.json({ message: "Generate triggered (placeholder)" }, 202);
});

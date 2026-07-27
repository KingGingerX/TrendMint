import { Hono } from "hono";

export const productsRouter = new Hono();

// GET /api/products — list products in the queue
productsRouter.get("/", (c) => {
  return c.json({
    module: "products",
    description: "Amazon PAAPI + ClickBank lookups — coming soon",
    endpoints: ["GET /", "GET /:id", "POST /lookup"],
  });
});

// GET /api/products/:id — single product detail
productsRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  return c.json({ id, message: "Product detail (placeholder)" });
});

// POST /api/products/lookup — look up product by ASIN
productsRouter.post("/lookup", (c) => {
  return c.json({ message: "Lookup triggered (placeholder)" }, 202);
});

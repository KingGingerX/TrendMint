const BASE_URL = ""; // Uses Vite proxy in dev

interface ApiOptions {
  method?: string;
  body?: unknown;
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

api.get = <T = unknown>(path: string) => api<T>(path);
api.post = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "POST", body });

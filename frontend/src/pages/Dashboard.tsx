import { useEffect, useState, useCallback } from "react";
import { useToast } from "../components/Toast";
import {
  getDiscoveryStatus,
  getProducts,
  getStats,
  getContent,
  getQueue,
  getOverviewStats,
  triggerDiscoveryScan,
  lookupProducts,
  generateContent,
  postNow,
  type DiscoveryStatus,
  type ProductsResponse,
  type SchedulerStats,
  type ContentResponse,
  type QueueResponse,
  type StatsOverview,
} from "../lib/api";

type LoadingAction = "scan" | "lookup" | "generate" | "post" | null;

export function Dashboard() {
  const { toast } = useToast();

  const [discovery, setDiscovery] = useState<DiscoveryStatus | null>(null);
  const [products, setProducts] = useState<ProductsResponse | null>(null);
  const [schedulerStats, setSchedulerStats] = useState<SchedulerStats | null>(null);
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [d, p, s, c, q, o] = await Promise.all([
        getDiscoveryStatus(),
        getProducts({ limit: 5 }),
        getStats(),
        getContent({ limit: 5 }),
        getQueue(),
        getOverviewStats(),
      ]);
      setDiscovery(d);
      setProducts(p);
      setSchedulerStats(s);
      setContent(c);
      setQueue(q);
      setOverview(o);
      setError(null);
    } catch (err) {
      setError("Cannot connect to backend");
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleAction = async (
    action: LoadingAction,
    fn: () => Promise<unknown>,
    successMsg: string
  ) => {
    setLoading(action);
    try {
      const result = await fn();
      toast(successMsg, "success");
      // Refresh all data
      await fetchAll();
      return result;
    } catch (err) {
      toast(String(err), "error");
    } finally {
      setLoading(null);
    }
  };

  // Stats
  const productsDiscovered = products?.counts?.discovered ?? (discovery?.discovered ?? 0);
  const productsApproved = products?.counts?.approved ?? 0;
  const draftsReady = schedulerStats?.totalDrafts ?? 0;
  const postsToday = schedulerStats?.postsToday ?? 0;
  const clicksToday = overview?.clicks_today ?? 0;
  const clicksTotal = overview?.clicks_total ?? 0;
  const earningsTotal = overview?.earnings_total ?? 0;

  // Recent activity: combine posted + drafted content, sorted by date
  const recentPosts = (content?.posts ?? [])
    .filter((p) => p.status === "posted" || p.status === "draft")
    .slice(0, 5);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-red-400 text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-300 mb-2">
          Cannot connect to backend
        </h2>
        <p className="text-gray-500 text-sm">
          Make sure the backend is running on port 3001.
        </p>
        <button
          onClick={fetchAll}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="Products Discovered" value={productsDiscovered} />
        <StatCard label="Products Approved" value={productsApproved} color="emerald" />
        <StatCard label="Drafts Ready" value={draftsReady} color="yellow" />
        <StatCard label="Posts Today" value={postsToday} color="purple" />
        <StatCard
          label="Clicks Today / Total"
          value={`${clicksToday} / ${clicksTotal}`}
          color="blue"
        />
        <StatCard
          label="Earnings ($)"
          value={`${earningsTotal.toFixed(2)}`}
          color="emerald"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <ActionButton
          label="Run Discovery Scan"
          loading={loading === "scan"}
          disabled={loading !== null}
          onClick={() =>
            handleAction("scan", () => triggerDiscoveryScan(), "Scan completed")
          }
        />
        <ActionButton
          label="Lookup Products"
          loading={loading === "lookup"}
          disabled={loading !== null}
          onClick={() =>
            handleAction("lookup", () => lookupProducts({ processDiscovered: true }), "Product lookup completed")
          }
        />
        <ActionButton
          label="Generate Content"
          loading={loading === "generate"}
          disabled={loading !== null}
          onClick={() =>
            handleAction("generate", () => generateContent(), "Content generation completed")
          }
        />
        <ActionButton
          label="Post Next"
          loading={loading === "post"}
          disabled={loading !== null}
          variant="accent"
          onClick={() =>
            handleAction("post", () => postNow(), "Post sent!")
          }
        />
      </div>

      {/* Recent activity */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-medium mb-4">Recent Activity</h3>
        {recentPosts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-lg mb-2">No activity yet</p>
            <p className="text-gray-600 text-sm">
              Run a discovery scan and generate content to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentPosts.map((post) => (
              <div
                key={post.id}
                className="flex items-start justify-between py-2 border-b border-gray-800 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">
                    {post.content
                      ? post.content.slice(0, 80) +
                        (post.content.length > 80 ? "…" : "")
                      : "Untitled"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {post.product_title || "Unknown product"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={post.status} />
                  <span className="text-xs text-gray-600">
                    {post.posted_at
                      ? new Date(post.posted_at).toLocaleString()
                      : post.generated_at
                      ? new Date(post.generated_at).toLocaleString()
                      : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────

function StatCard({
  label,
  value,
  color = "default",
}: {
  label: string;
  value: number | string;
  color?: "default" | "emerald" | "yellow" | "purple" | "blue";
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-400"
      : color === "yellow"
      ? "text-yellow-400"
      : color === "purple"
      ? "text-purple-400"
      : color === "blue"
      ? "text-blue-400"
      : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  loading,
  disabled,
  variant = "default",
  onClick,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  variant?: "default" | "accent";
  onClick: () => void;
}) {
  const base =
    variant === "accent"
      ? "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800"
      : "bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
    >
      {loading && <Spinner small />}
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  let color = "";
  switch (status) {
    case "draft":
      color = "bg-yellow-900/40 text-yellow-400 border-yellow-700";
      break;
    case "posted":
      color = "bg-emerald-900/40 text-emerald-400 border-emerald-700";
      break;
    case "failed":
      color = "bg-red-900/40 text-red-400 border-red-700";
      break;
    default:
      color = "bg-gray-800 text-gray-400 border-gray-700";
  }
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}
    >
      {status}
    </span>
  );
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <svg
      className={`animate-spin ${small ? "h-4 w-4" : "h-6 w-6"} text-current`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

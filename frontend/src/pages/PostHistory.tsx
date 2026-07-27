import { useEffect, useState, useCallback } from "react";
import { getContent, type ContentPost, type ContentResponse } from "../lib/api";

export function PostHistory() {
  const [data, setData] = useState<ContentResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getContent(
        statusFilter ? { status: statusFilter } : undefined
      );
      setData(result);
      setError(null);
    } catch {
      setError("Cannot connect to backend");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-red-400 text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-300 mb-2">
          Cannot connect to backend
        </h2>
        <button
          onClick={fetchPosts}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Post History</h2>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="failed">Failed</option>
        </select>
        {data?.counts && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {Object.entries(data.counts).map(([status, count]) => (
              <span key={status}>
                {status}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : !data?.posts.length ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-lg mb-2">No posts yet</p>
          <p className="text-gray-600 text-sm">
            Generated social posts and their posting status will appear here.
            Generate content from the Dashboard or Product Queue first.
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-left">
                <th className="px-4 py-3 font-medium">Tweet</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Posted At</th>
                <th className="px-4 py-3 font-medium">Tweet Link</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((post) => (
                <tr
                  key={post.id}
                  className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-200 max-w-md">
                    <p className="truncate">
                      {post.content || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                    {post.product_title || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <PostStatusBadge status={post.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {post.posted_at
                      ? new Date(post.posted_at).toLocaleString()
                      : post.generated_at
                      ? new Date(post.generated_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {post.tweet_id ? (
                      <a
                        href={`https://x.com/user/status/${post.tweet_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline text-xs"
                      >
                        View →
                      </a>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Count */}
          <div className="px-4 py-3 border-t border-gray-800 text-sm text-gray-500">
            {data.total} post{data.total !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function PostStatusBadge({ status }: { status: string }) {
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

function Spinner() {
  return (
    <svg
      className="animate-spin h-6 w-6 text-emerald-400"
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

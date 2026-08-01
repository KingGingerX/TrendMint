import { useEffect, useState, useCallback } from "react";
import { useToast } from "../components/Toast";
import {
  getDiscoveryStatus,
  getStats,
  getAutoPostStatus,
  toggleAutoPost,
  verifyCredentials,
  type DiscoveryStatus,
  type SchedulerStats,
  type AutoPostStatus,
  type VerifyResult,
} from "../lib/api";

export function Settings() {
  const { toast } = useToast();

  const [discovery, setDiscovery] = useState<DiscoveryStatus | null>(null);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [autoPost, setAutoPost] = useState<AutoPostStatus | null>(null);
  const [twitterVerify, setTwitterVerify] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s, a, v] = await Promise.all([
        getDiscoveryStatus().catch(() => null),
        getStats().catch(() => null),
        getAutoPostStatus().catch(() => null),
        verifyCredentials().catch(() => null),
      ]);
      setDiscovery(d);
      setStats(s);
      setAutoPost(a);
      setTwitterVerify(v);
      setError(null);
    } catch {
      setError("Cannot connect to backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleToggle = async () => {
    if (autoPost === null) return;
    setToggling(true);
    try {
      const result = await toggleAutoPost(!autoPost.enabled);
      setAutoPost({
        ...autoPost,
        enabled: result.autoPostEnabled,
        message: result.message,
      });
      toast(result.message, "success");
      // Refresh stats
      const s = await getStats();
      setStats(s);
    } catch (err) {
      toast(String(err), "error");
    } finally {
      setToggling(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-red-400 text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-300 mb-2">
          Cannot connect to backend
        </h2>
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
      <h2 className="text-2xl font-semibold mb-6">Settings</h2>

      <div className="space-y-6 max-w-2xl">
        {/* API Configuration */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4">API Configuration</h3>
          <p className="text-sm text-gray-400 mb-4">
            API keys are loaded from environment variables on the backend.
            Check <code className="text-emerald-400">.env.example</code> for
            required keys.
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner small /> Checking credentials…
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <SettingRow
                label="Amazon PAAPI"
                configured={false}
                note="Check AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY / AMAZON_PARTNER_TAG"
              />
              <SettingRow
                label="Twitter/X API"
                configured={twitterVerify?.ok ?? false}
                note={
                  twitterVerify?.ok
                    ? "Connected"
                    : twitterVerify?.error || "Not configured"
                }
              />
              <SettingRow
                label="Reddit API"
                configured={discovery?.redditCredentialsSet ?? false}
                note={
                  discovery?.redditCredentialsSet
                    ? "Connected"
                    : "Check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET"
                }
              />
              <SettingRow
                label="Anthropic"
                configured={false}
                note="Check ANTHROPIC_API_KEY"
              />
              <SettingRow
                label="ClickBank"
                configured={false}
                note="Optional — check CLICKBANK_DEV_KEY / CLICKBANK_CLERK_KEY"
              />
            </div>
          )}
        </div>

        {/* Filter Thresholds */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4">Filter Thresholds</h3>
          <p className="text-sm text-gray-400 mb-4">
            Products must meet these criteria to be approved during lookup.
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-gray-500 block mb-1">Minimum Price</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200">
                $30.00
              </div>
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Max Sales Rank</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200">
                5,000
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Thresholds are configured in the backend filter module. To change
            them, update the DEFAULT_FILTER_CONFIG in{" "}
            <code className="text-gray-500">backend/src/modules/products/filter.ts</code>.
          </p>
        </div>

        {/* Redirect URL */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4">Click Tracking</h3>
          <p className="text-sm text-gray-400 mb-4">
            Tweet links use TrendMint redirect URLs for click tracking.
            Each post gets a unique redirect URL that logs a click before
            forwarding to the affiliate link.
          </p>
          <div>
            <label className="text-sm text-gray-500 block mb-1">
              Base Redirect URL
            </label>
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 font-mono text-sm">
              {window.location.origin.includes("localhost")
                ? "http://localhost:3001/r/:postId"
                : `${window.location.protocol}//${window.location.hostname}:3001/r/:postId`}
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Set <code className="text-gray-500">BASE_URL</code> in{" "}
            <code className="text-gray-500">.env</code> to change the redirect
            base (default: http://localhost:3001).
          </p>
        </div>

        {/* Auto-Poster */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4">Auto-Poster</h3>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-300">
                {autoPost?.enabled
                  ? "Auto-posting is enabled"
                  : "Auto-posting is disabled"}
              </p>
              {autoPost?.note && (
                <p className="text-xs text-gray-500 mt-1">{autoPost.note}</p>
              )}
            </div>
            <button
              onClick={handleToggle}
              disabled={toggling || loading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoPost?.enabled ? "bg-emerald-600" : "bg-gray-700"
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoPost?.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Posting Schedule */}
          <h4 className="text-sm font-medium text-gray-400 mb-3">
            Posting Schedule
          </h4>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner small /> Loading stats…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Daily Limit</p>
                <p className="text-gray-200 font-medium">
                  {stats?.postsToday ?? 0} / {stats?.dailyLimit ?? 50}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Monthly Limit</p>
                <p className="text-gray-200 font-medium">
                  {stats?.postsThisMonth ?? 0} / {stats?.monthlyLimit ?? 1500}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Min Interval</p>
                <p className="text-gray-200 font-medium">
                  {stats?.minimumIntervalMinutes ?? 15} min
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Next Post In</p>
                <p className="text-gray-200 font-medium">
                  {stats?.secondsUntilNextPost != null && stats.secondsUntilNextPost > 0
                    ? `${Math.ceil(stats.secondsUntilNextPost / 60)}m ${stats.secondsUntilNextPost % 60}s`
                    : "Ready"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  configured,
  note,
}: {
  label: string;
  configured: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <div>
        <span className="text-gray-300">{label}</span>
        {note && (
          <p className="text-xs text-gray-600 mt-0.5">{note}</p>
        )}
      </div>
      <span className={configured ? "text-emerald-400" : "text-red-400"}>
        {configured ? "✓ Configured" : "✗ Not set"}
      </span>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <svg
      className={`animate-spin ${small ? "h-4 w-4" : "h-6 w-6"} text-emerald-400`}
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

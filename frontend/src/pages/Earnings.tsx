import { useEffect, useState, useCallback } from "react";
import { useToast } from "../components/Toast";
import {
  getEarnings,
  getEarningsSummary,
  addEarnings,
  type EarningsEntry,
  type EarningsListResponse,
  type EarningsSummary,
} from "../lib/api";

export function Earnings() {
  const { toast } = useToast();

  const [entries, setEntries] = useState<EarningsListResponse | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formAmount, setFormAmount] = useState("");
  const [formSource, setFormSource] = useState("amazon");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        getEarnings(),
        getEarningsSummary(),
      ]);
      setEntries(e);
      setSummary(s);
      setError(null);
    } catch {
      setError("Cannot connect to backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) {
      toast("Enter a valid amount", "error");
      return;
    }
    if (!formSource.trim()) {
      toast("Select a source", "error");
      return;
    }

    setSubmitting(true);
    try {
      await addEarnings({
        amount,
        source: formSource.trim(),
        description: formDescription.trim() || undefined,
        recorded_at: formDate
          ? new Date(formDate).toISOString()
          : undefined,
      });
      toast("Earnings entry added", "success");
      setFormAmount("");
      setFormDescription("");
      setFormDate(new Date().toISOString().slice(0, 10));
      await fetchData();
    } catch (err) {
      toast(String(err), "error");
    } finally {
      setSubmitting(false);
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
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Earnings</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Total Earnings"
          value={`$${(summary?.total ?? 0).toFixed(2)}`}
        />
        <SummaryCard
          label="This Month"
          value={`$${(summary?.thisMonth ?? 0).toFixed(2)}`}
          color="emerald"
        />
        <SummaryCard
          label="Total Entries"
          value={entries?.total ?? 0}
          color="yellow"
        />
        <SummaryCard
          label="Sources"
          value={summary?.bySource?.length ?? 0}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Add Earnings Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4">Add Earnings</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1">
                Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">
                Source
              </label>
              <select
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="amazon">Amazon</option>
                <option value="clickbank">ClickBank</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">
                Description
              </label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g., Q3 commission"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">
                Date
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Spinner small />}
              Add Entry
            </button>
          </form>
        </div>

        {/* By Source */}
        <div className="lg:col-span-2 space-y-6">
          {/* Source breakdown */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <>
              {/* Source table */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-medium mb-4">By Source</h3>
                {!summary?.bySource?.length ? (
                  <p className="text-gray-500 text-sm">No earnings recorded yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500 text-left">
                        <th className="pb-2 font-medium">Source</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                        <th className="pb-2 font-medium text-right">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.bySource.map((s) => (
                        <tr
                          key={s.source}
                          className="border-b border-gray-800 last:border-0"
                        >
                          <td className="py-2 text-gray-200 capitalize">
                            {s.source}
                          </td>
                          <td className="py-2 text-emerald-400 text-right">
                            ${s.total.toFixed(2)}
                          </td>
                          <td className="py-2 text-gray-400 text-right">
                            {s.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Monthly breakdown */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-medium mb-4">By Month</h3>
                {!summary?.byMonth?.length ? (
                  <p className="text-gray-500 text-sm">No monthly data yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500 text-left">
                        <th className="pb-2 font-medium">Month</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                        <th className="pb-2 font-medium text-right">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byMonth.map((m) => (
                        <tr
                          key={m.month}
                          className="border-b border-gray-800 last:border-0"
                        >
                          <td className="py-2 text-gray-200">{m.month}</td>
                          <td className="py-2 text-emerald-400 text-right">
                            ${m.total.toFixed(2)}
                          </td>
                          <td className="py-2 text-gray-400 text-right">
                            {m.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* All entries table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <h3 className="text-lg font-medium px-6 pt-6 pb-4">All Entries</h3>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : !entries?.entries.length ? (
          <div className="px-6 pb-6 text-center">
            <p className="text-gray-500 text-sm">No earnings entries yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-left">
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Source</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-6 py-3 text-emerald-400 font-medium">
                    ${entry.amount.toFixed(2)} {entry.currency}
                  </td>
                  <td className="px-6 py-3 text-gray-300 capitalize">
                    {entry.source}
                  </td>
                  <td className="px-6 py-3 text-gray-400 max-w-xs truncate">
                    {entry.description || "—"}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(entry.recorded_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {entries && entries.total > 0 && (
          <div className="px-6 py-3 border-t border-gray-800 text-sm text-gray-500">
            {entries.total} entry{entries.total !== 1 ? "es" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = "default",
}: {
  label: string;
  value: number | string;
  color?: "default" | "emerald" | "yellow" | "purple";
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-400"
      : color === "yellow"
      ? "text-yellow-400"
      : color === "purple"
      ? "text-purple-400"
      : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
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

import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Dashboard() {
  const [health, setHealth] = useState<{ status: string } | null>(null);

  useEffect(() => {
    api.get("/api/health").then(setHealth).catch(console.error);
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Dashboard</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Products Found" value="—" />
        <StatCard label="Posts Sent" value="—" />
        <StatCard label="Commissions" value="—" />
      </div>

      {/* System status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-medium mb-3">System Status</h3>
        <div className="space-y-2 text-sm text-gray-400">
          <StatusRow label="Backend" status={health?.status === "ok" ? "online" : "checking..."} />
          <StatusRow label="Database" status="pending" />
          <StatusRow label="Twitter/X" status="pending" />
          <StatusRow label="Reddit" status="pending" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const color =
    status === "online" ? "text-emerald-400" : status === "checking..." ? "text-yellow-400" : "text-gray-600";
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={color}>{status}</span>
    </div>
  );
}

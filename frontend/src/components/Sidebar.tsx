import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { getStats, type SchedulerStats } from "../lib/api";

const navItems = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/products", label: "Product Queue", icon: "📦" },
  { to: "/posts", label: "Post History", icon: "📝" },
  { to: "/earnings", label: "Earnings", icon: "💰" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const [stats, setStats] = useState<SchedulerStats | null>(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {});
    // Poll every 30s
    const interval = setInterval(() => {
      getStats()
        .then(setStats)
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-emerald-400">🪙 TrendMint</h1>
        <p className="text-xs text-gray-500 mt-1">Affiliate Engine MVP</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-emerald-900/30 text-emerald-300 font-medium"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Auto-post</span>
          <span
            className={`font-medium ${
              stats?.autoPostEnabled ? "text-emerald-400" : "text-gray-600"
            }`}
          >
            {stats?.autoPostEnabled ? "ON" : "OFF"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Drafts</span>
          <span className="text-yellow-400 font-medium">
            {stats?.totalDrafts ?? "—"}
          </span>
        </div>
        <div className="pt-2 text-gray-600">
          TrendMint v0.1.0
        </div>
      </div>
    </aside>
  );
}

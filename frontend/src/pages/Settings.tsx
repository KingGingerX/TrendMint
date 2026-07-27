export function Settings() {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Settings</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg">
        <h3 className="text-lg font-medium mb-4">API Configuration</h3>
        <p className="text-sm text-gray-400 mb-4">
          API keys are loaded from environment variables on the backend.
          Check <code className="text-emerald-400">.env.example</code> for required keys.
        </p>
        <div className="space-y-3 text-sm">
          <SettingRow label="Amazon PAAPI" configured={false} />
          <SettingRow label="Twitter/X API" configured={false} />
          <SettingRow label="Reddit API" configured={false} />
          <SettingRow label="OpenAI" configured={false} />
          <SettingRow label="ClickBank" configured={false} />
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span className="text-gray-300">{label}</span>
      <span className={configured ? "text-emerald-400" : "text-red-400"}>
        {configured ? "Configured" : "Not set"}
      </span>
    </div>
  );
}

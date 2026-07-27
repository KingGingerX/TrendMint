export function ProductQueue() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Product Queue</h2>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          🔍 Scan for Products
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-gray-500 text-lg mb-2">No products yet</p>
        <p className="text-gray-600 text-sm">
          Products discovered from Reddit and affiliate networks will appear here.
        </p>
      </div>
    </div>
  );
}

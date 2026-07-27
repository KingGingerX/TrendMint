import { useEffect, useState, useCallback } from "react";
import { useToast } from "../components/Toast";
import {
  getProducts,
  getProduct,
  triggerDiscoveryScan,
  lookupProducts,
  type Product,
  type ProductsResponse,
} from "../lib/api";

const PAGE_SIZE = 20;

export function ProductQueue() {
  const { toast } = useToast();

  const [data, setData] = useState<ProductsResponse | null>(null);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [minPriceFilter, setMinPriceFilter] = useState("");
  const [maxRankFilter, setMaxRankFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (statusFilter) params.status = statusFilter;
      if (minPriceFilter) params.minPrice = Number(minPriceFilter);
      if (maxRankFilter) params.maxRank = Number(maxRankFilter);

      const result = await getProducts(params as Parameters<typeof getProducts>[0]);
      setData(result);
      setError(null);
    } catch (err) {
      setError("Cannot connect to backend");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, minPriceFilter, maxRankFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleScan = async () => {
    setActionLoading("scan");
    try {
      const result = await triggerDiscoveryScan();
      if (result.success) {
        toast(`Found ${result.newProducts} new products`, "success");
      } else {
        toast(result.errors[0] || "Scan failed", "error");
      }
      await fetchProducts();
    } catch (err) {
      toast(String(err), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleLookup = async () => {
    setActionLoading("lookup");
    try {
      const result = await lookupProducts({ processDiscovered: true });
      toast(
        `Enriched ${result.enriched}, approved ${result.approved}, rejected ${result.rejected}`,
        "success"
      );
      await fetchProducts();
    } catch (err) {
      toast(String(err), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedProduct(null);
      return;
    }
    setExpandedId(id);
    setExpandedProduct(null);
    try {
      const result = await getProduct(id);
      setExpandedProduct(result.product);
    } catch {
      toast("Failed to load product details", "error");
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-red-400 text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-red-300 mb-2">
          Cannot connect to backend
        </h2>
        <button
          onClick={fetchProducts}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Product Queue</h2>
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={actionLoading !== null}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {actionLoading === "scan" && <Spinner small />}
            🔍 Scan
          </button>
          <button
            onClick={handleLookup}
            disabled={actionLoading !== null}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {actionLoading === "lookup" && <Spinner small />}
            🔎 Lookup
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
        >
          <option value="">All Statuses</option>
          <option value="discovered">Discovered</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="posted">Posted</option>
        </select>
        <input
          type="number"
          placeholder="Min price ($)"
          value={minPriceFilter}
          onChange={(e) => {
            setMinPriceFilter(e.target.value);
            setPage(0);
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 w-36"
        />
        <input
          type="number"
          placeholder="Max sales rank"
          value={maxRankFilter}
          onChange={(e) => {
            setMaxRankFilter(e.target.value);
            setPage(0);
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 w-40"
        />
        <button
          onClick={() => {
            setStatusFilter("");
            setMinPriceFilter("");
            setMaxRankFilter("");
            setPage(0);
          }}
          className="text-xs text-gray-500 hover:text-gray-300 px-2"
        >
          Clear filters
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : !data?.products.length ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-lg mb-2">No products discovered yet</p>
          <p className="text-gray-600 text-sm mb-4">
            Products discovered from Reddit and affiliate networks will appear here.
            Run a discovery scan to get started.
          </p>
          <button
            onClick={handleScan}
            disabled={actionLoading !== null}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Run Discovery Scan
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-left">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Sales Rank</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <>
                  <tr
                    key={p.id}
                    onClick={() => handleExpand(p.id)}
                    className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-200 max-w-xs truncate">
                      {p.title || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {p.price != null ? `$${p.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {p.sales_rank != null ? `#${p.sales_rank.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {p.category || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ProductStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {p.source || "—"}
                    </td>
                  </tr>
                  {expandedId === p.id && (
                    <tr key={`${p.id}-detail`}>
                      <td colSpan={6} className="bg-gray-800/50 px-4 py-4">
                        {!expandedProduct ? (
                          <div className="flex items-center justify-center py-4">
                            <Spinner small />
                          </div>
                        ) : (
                          <ProductDetail product={expandedProduct} />
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 text-sm">
            <span className="text-gray-500">
              {data.total} product{data.total !== 1 ? "s" : ""}
              {data.counts &&
                Object.entries(data.counts).length > 0 &&
                ` — ${Object.entries(data.counts)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 hover:bg-gray-700 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-gray-400">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page + 1 >= totalPages}
                className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 hover:bg-gray-700 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductStatusBadge({ status }: { status: string }) {
  let color = "";
  switch (status) {
    case "discovered":
      color = "bg-blue-900/40 text-blue-400 border-blue-700";
      break;
    case "approved":
      color = "bg-emerald-900/40 text-emerald-400 border-emerald-700";
      break;
    case "rejected":
      color = "bg-red-900/40 text-red-400 border-red-700";
      break;
    case "posted":
      color = "bg-purple-900/40 text-purple-400 border-purple-700";
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

function ProductDetail({ product }: { product: Product }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-2">
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.title || ""}
            className="w-32 h-32 object-contain bg-white rounded-lg p-2"
          />
        )}
        <h4 className="text-gray-100 font-medium">
          {product.title || "Untitled Product"}
        </h4>
        {product.affiliate_link && (
          <a
            href={product.affiliate_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline break-all block"
          >
            {product.affiliate_link}
          </a>
        )}
      </div>
      <div className="space-y-2 text-gray-400">
        <div>
          <span className="text-gray-500">Price: </span>
          {product.price != null ? `$${product.price.toFixed(2)}` : "—"}
        </div>
        <div>
          <span className="text-gray-500">Sales Rank: </span>
          {product.sales_rank != null ? `#${product.sales_rank.toLocaleString()}` : "—"}
        </div>
        <div>
          <span className="text-gray-500">ASIN: </span>
          {product.asin || "—"}
        </div>
        <div>
          <span className="text-gray-500">Category: </span>
          {product.category || "—"}
        </div>
        <div>
          <span className="text-gray-500">Source: </span>
          {product.source || "—"}
        </div>
        <div>
          <span className="text-gray-500">Discovered: </span>
          {product.discovered_at
            ? new Date(product.discovered_at).toLocaleString()
            : "—"}
        </div>
        {product.rejection_reason && (
          <div className="text-red-400">
            <span className="text-gray-500">Rejection: </span>
            {product.rejection_reason}
          </div>
        )}
      </div>
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

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiPut, apiDelete } from "../lib/api";
import { PageHeader, Skeleton, EmptyState, ErrorBanner, Button, Modal, ConfirmModal, SearchBar } from "../components/ui";

// ── Types ───────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  stock_count: number;
}

interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  stock_count: number;
}

const emptyForm = (): ProductFormData => ({
  name: "",
  sku: "",
  barcode: "",
  stock_count: 0,
});

const formFromProduct = (p: Product): ProductFormData => ({
  name: p.name,
  sku: p.sku,
  barcode: p.barcode ?? "",
  stock_count: p.stock_count,
});

// ── Page Component ──────────────────────────────────────────────────

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // ── Fetch products ───────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet("/api/products");
      setProducts(data);
    } catch (err: any) {
      setError(err.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── Open / close modal ───────────────────────────────────────────

  const openAdd = () => {
    setEditingProduct(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm(formFromProduct(product));
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProduct(null);
    setFormError(null);
  };

  // ── Save (create or update) ──────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim() || !form.sku.trim()) {
      setFormError("Name and SKU are required");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        stock_count: form.stock_count,
      };

      const url = editingProduct
        ? `/api/products/${editingProduct.id}`
        : "/api/products";

      const data = editingProduct
        ? await apiPut(url, payload)
        : await apiPost(url, payload);

      if (editingProduct) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? data : p))
        );
      } else {
        setProducts((prev) => [...prev, data]);
      }

      closeModal();
    } catch (err: any) {
      setFormError(err.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await apiDelete(`/api/products/${deleteTarget.id}`);
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete product");
      setDeleteTarget(null);
    }
  };

  // ── Filtered products ────────────────────────────────────────────

  const filteredProducts = search
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode && p.barcode.includes(search))
      )
    : products;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        description="Manage your inventory products, SKUs, and barcodes"
        actions={
          <Button variant="primary" onClick={openAdd}>
            <span className="text-lg mr-1">＋</span>
            Add Product
          </Button>
        }
      />

      {/* Error banner */}
      {error && <ErrorBanner message={error} onRetry={fetchProducts} />}

      {/* Search */}
      {!loading && products.length > 0 && (
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name, SKU, or barcode…"
        />
      )}

      {/* Products table / empty state */}
      {loading ? (
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="table-row" />
          ))}
        </div>
      ) : filteredProducts.length === 0 && !search ? (
        <EmptyState
          icon="📦"
          title="No products yet"
          description="Create your first product to start tracking inventory"
          action={{ label: "Add Product", onClick: openAdd }}
        />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-rose-100 bg-rose-50/40">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Barcode
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {filteredProducts.map((product, i) => (
                  <tr
                    key={product.id}
                    className={`hover:bg-rose-50/50 transition-all duration-300 ${
                      i % 2 === 1 ? "bg-rose-50/20" : "bg-white"
                    }`}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-rose-400 font-mono">
                      {product.sku}
                    </td>
                    <td className="px-6 py-4 text-sm text-rose-400 font-mono">
                      {product.barcode ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                          product.stock_count <= 5
                            ? product.stock_count === 0
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {product.stock_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/products/${product.id}`)}>
                          View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleteTarget(product)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-rose-50">
            {filteredProducts.map((product) => (
              <div key={product.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {product.name}
                    </p>
                    <p className="text-xs text-rose-400 font-mono mt-0.5">
                      SKU: {product.sku}
                    </p>
                    {product.barcode && (
                      <p className="text-xs text-rose-400 font-mono">
                        Barcode: {product.barcode}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      product.stock_count <= 5
                        ? product.stock_count === 0
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {product.stock_count}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => navigate(`/products/${product.id}`)}>
                    View
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(product)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1" onClick={() => setDeleteTarget(product)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search empty state */}
      {!loading && search && filteredProducts.length === 0 && products.length > 0 && (
        <EmptyState
          icon="🔍"
          title="No products match"
          description={`No products found matching "${search}"`}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingProduct ? "Edit Product" : "Add Product"}
      >
        <form onSubmit={handleSave} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-neutral-900 mb-1.5">
              Name *
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 outline-none transition-all duration-300"
              placeholder="e.g. Glitter Gold #3"
              autoFocus
            />
          </div>

          {/* SKU */}
          <div>
            <label htmlFor="sku" className="block text-sm font-semibold text-neutral-900 mb-1.5">
              SKU *
            </label>
            <input
              id="sku"
              type="text"
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              className="w-full px-4 py-3 border border-rose-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 outline-none transition-all duration-300"
              placeholder="e.g. GLT-003"
            />
          </div>

          {/* Barcode */}
          <div>
            <label htmlFor="barcode" className="block text-sm font-semibold text-neutral-900 mb-1.5">
              Barcode
            </label>
            <input
              id="barcode"
              type="text"
              value={form.barcode}
              onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              className="w-full px-4 py-3 border border-rose-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 outline-none transition-all duration-300"
              placeholder="e.g. 5901234567890"
            />
            <p className="text-xs text-rose-400 mt-1">
              USB scanner will type the barcode + Enter into this field.
            </p>
          </div>

          {/* Stock Count */}
          <div>
            <label htmlFor="stock_count" className="block text-sm font-semibold text-neutral-900 mb-1.5">
              Initial Stock Count
            </label>
            <input
              id="stock_count"
              type="number"
              min="0"
              value={form.stock_count}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  stock_count: Math.max(0, parseInt(e.target.value) || 0),
                }))
              }
              className="w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 outline-none transition-all duration-300"
            />
          </div>

          {/* Form error */}
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {formError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={closeModal} type="button">
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" type="submit" loading={saving}>
              {editingProduct ? "Save Changes" : "Add Product"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Product?"
        message={`This will permanently delete ${deleteTarget?.name || ""} (SKU: ${deleteTarget?.sku || ""}). This action cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

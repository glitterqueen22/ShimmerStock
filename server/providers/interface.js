/**
 * CommerceProvider — abstract contract for commerce channel adapters.
 *
 * All commerce integrations (Shopify, WooCommerce, Square, etc.) implement
 * this interface.  Core business logic calls these methods — never provider-
 * specific code.  Adding a new channel means writing one adapter class; route
 * code stays unchanged.
 *
 * @interface
 */

/**
 * Standardized order object returned by every provider.
 *
 * @typedef {Object} ProviderOrder
 * @property {string}  orderId      — unique ID from the channel (e.g. Shopify order ID)
 * @property {number}  orderNumber  — human-readable order number
 * @property {string}  customerName — customer display name
 * @property {ProviderLineItem[]} lineItems
 */

/**
 * Single line item in a standardized order.
 *
 * @typedef {Object} ProviderLineItem
 * @property {number} variantId     — channel-specific variant ID
 * @property {string} sku
 * @property {string} title         — product title
 * @property {string} variantTitle  — variant title (e.g. "8oz", "Red")
 * @property {number} quantity      — ordered quantity
 */

/**
 * Standardized product object returned by every provider.
 *
 * @typedef {Object} ProviderProduct
 * @property {string}  productId — unique ID from the channel (e.g. Shopify product ID)
 * @property {string}  title     — product title
 * @property {ProviderVariant[]} variants
 */

/**
 * Single variant in a standardized product.
 *
 * @typedef {Object} ProviderVariant
 * @property {number} variantId — channel-specific variant ID
 * @property {string} sku
 * @property {string} barcode
 * @property {string} title     — variant title
 */

/**
 * Status snapshot returned by {@link CommerceProvider#getStatus}.
 *
 * @typedef {Object} ProviderStatus
 * @property {boolean} configured — true when the provider has credentials and is reachable
 * @property {string}  mode       — "readonly" | "full"
 * @property {boolean} canWrite   — true when mode === "full"
 */

/**
 * Result of a single inventory push.
 *
 * @typedef {Object} PushResult
 * @property {boolean} success
 * @property {string}  [error] — reason when success is false
 */

// ── The contract (documented methods — no implementation) ──────────────────

export default class CommerceProvider {
  /**
   * Fetch open orders from the commerce channel.
   *
   * @returns {Promise<ProviderOrder[]>}
   */
  async fetchOrders() {
    throw new Error("Not implemented");
  }

  /**
   * Fetch products (all or a paginated subset) from the commerce channel.
   *
   * @returns {Promise<ProviderProduct[]>}
   */
  async fetchProducts() {
    throw new Error("Not implemented");
  }

  /**
   * Push the current stock level for a variant back to the commerce channel.
   *
   * The adapter is responsible for resolving any channel-specific identifiers
   * (inventory item IDs, location IDs) internally.
   *
   * @param {string} sku       — SKU for logging / cross-reference
   * @param {number} variantId — channel-specific variant ID
   * @param {number} newStock  — the quantity to set
   * @returns {Promise<PushResult>}
   */
  async pushInventory(sku, variantId, newStock) {
    throw new Error("Not implemented");
  }

  /**
   * Return the current status snapshot for this provider.
   *
   * @returns {ProviderStatus}
   */
  getStatus() {
    throw new Error("Not implemented");
  }

  /**
   * Change the sync mode at runtime.
   *
   * @param {"readonly"|"full"} mode
   * @returns {void}
   */
  async setMode(mode) {
    throw new Error("Not implemented");
  }
}

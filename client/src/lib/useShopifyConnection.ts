/**
 * useShopifyConnection — lightweight hook to detect Shopify pilot connection state.
 *
 * Returns whether a Shopify store is connected in read-only mode for the current
 * business. Used to conditionally change Add Product / New Order button labels and
 * context notes so users understand local-only records during reconciliation.
 */

import { useState, useEffect } from "react";
import { apiGet } from "./api";

interface ShopifyConnectionState {
  isConnected: boolean;
  syncMode: "readonly" | "full" | null;
  loading: boolean;
}

/**
 * Fetch Shopify connection status for the current business session.
 *
 * Returns loading=true until the first response arrives, then sets
 * isConnected=true and syncMode from the API response.
 * On any error, defaults to isConnected=false (safe non-blocking default).
 */
export function useShopifyConnection(): ShopifyConnectionState {
  const [state, setState] = useState<ShopifyConnectionState>({
    isConnected: false,
    syncMode: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<{ connected: boolean; syncMode?: "readonly" | "full" }>("/api/shopify/status")
      .then(data => {
        if (!cancelled) {
          setState({
            isConnected: !!data?.connected,
            syncMode: data?.syncMode ?? null,
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ isConnected: false, syncMode: null, loading: false });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

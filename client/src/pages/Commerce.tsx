import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Button } from "../components/ui";
import Novi from "../components/Novi";
import ShopifyConnect from "../components/ShopifyConnect";
import type { ShopifyStatus } from "../components/ShopifyConnect";

export default function Commerce() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);

  const handleConnected = useCallback((_: ShopifyStatus) => {
    setConnected(true);
  }, []);

  const handleDisconnected = useCallback(() => {
    setConnected(false);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Commerce"
        novi={<Novi size="sm" accessory="marketing" />}
        actions={
          connected && (
            <Button variant="secondary" onClick={() => navigate("/orders")}>
              View Orders →
            </Button>
          )
        }
      />

      <ShopifyConnect
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onSyncComplete={() => {
          // After sync, could refresh orders count here
        }}
      />

      {connected && (
        <div className="text-center pt-4">
          <Button
            variant="primary"
            onClick={() => navigate("/orders")}
            size="lg"
          >
            Go to Orders Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}

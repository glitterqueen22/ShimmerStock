import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Button } from "../components/ui";
import Novi from "../components/Novi";
import ShopifyConnect from "../components/ShopifyConnect";
import ShopifyPilotReadiness from "../components/ShopifyPilotReadiness";
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
        description="Shopify read-only connection — Early Access"
        novi={<Novi size="sm" accessory="marketing" />}
        actions={
          connected && (
            <Button variant="secondary" onClick={() => navigate("/orders")}>
              View Orders →
            </Button>
          )
        }
      />

      {/* Pilot readiness states — always shown in Early Access */}
      <ShopifyPilotReadiness
        connectionState={connected ? "readonly_connected" : "disconnected"}
        showChecklist={!connected}
      />

      <ShopifyConnect
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onSyncComplete={() => {}}
      />

      {connected && (
        <div className="text-center pt-4">
          <Button variant="primary" onClick={() => navigate("/orders")} size="lg">
            Go to Orders Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
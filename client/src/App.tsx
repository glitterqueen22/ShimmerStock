import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { IndustryProvider } from "./context/IndustryContext";
import { Navbar, ToastProvider } from "./components/ui";
import Novi from "./components/Novi";
import { measurePageLoad } from "./lib/perf";
import HQ from "./pages/HQ";
import BusinessBestie from "./pages/BusinessBestie";
import Products from "./pages/Products";
import Scan from "./pages/Scan";
import Orders from "./pages/Orders";
import AuditLog from "./pages/AuditLog";
import SyncLog from "./pages/SyncLog";
import Production from "./pages/Production";
import Calculation from "./pages/Calculation";
import Purchasing from "./pages/Purchasing";
import Timeline from "./pages/Timeline";
import ProductHQ from "./pages/ProductHQ";
import Opportunities from "./pages/Opportunities";
import Warehouse from "./pages/Warehouse";
import CustomerHub from "./pages/CustomerHub";
import Partner from "./pages/Partner";
import Settings from "./pages/Settings";
import Studio from "./pages/Studio";
import Growth from "./pages/Growth";
import Team from "./pages/Team";
import Fulfillment from "./pages/Fulfillment";
import Onboarding from "./pages/Onboarding";
import BrandSetup from "./pages/BrandSetup";
import Commerce from "./pages/Commerce";
import NoviMessages from "./pages/NoviMessages";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NoviContextualPanel from "./components/novi/NoviContextualPanel";
import AskNoviWidget from "./components/novi/AskNoviWidget";

function ProtectedApp() {
  const location = useLocation();

  // Measure page load on route changes
  useEffect(() => {
    measurePageLoad(location.pathname);
  }, [location.pathname]);

  return (
    <IndustryProvider>
      <div className="min-h-screen bg-transparent">
        <Navbar />
        <NoviContextualPanel />
        <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Navigate to="/bestie" replace />} />
            <Route path="/bestie" element={<BusinessBestie />} />
            <Route path="/hq" element={<HQ />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductHQ />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="/sync-log" element={<SyncLog />} />
            <Route path="/production" element={<Production />} />
            <Route path="/calc" element={<Calculation />} />
            <Route path="/purchasing" element={<Purchasing />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/opportunities" element={<Opportunities />} />
            <Route path="/warehouse" element={<Warehouse />} />
            <Route path="/customers" element={<CustomerHub />} />
            <Route path="/affiliates" element={<Navigate to="/partners" replace />} />
            <Route path="/partners" element={<Partner />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/growth" element={<Growth />} />
            <Route path="/team" element={<Team />} />
            <Route path="/fulfillment" element={<Fulfillment />} />
            <Route path="/brand-setup" element={<BrandSetup />} />
            <Route path="/commerce" element={<Commerce />} />
            <Route path="/novi" element={<NoviMessages />} />
            <Route path="/onboarding" element={<Onboarding />} />
            {/* Catch-all: redirect to bestie */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <AskNoviWidget />
      </div>
    </IndustryProvider>
  );
}

function App() {
  const { isAuthenticated, loading, mustChangePassword } = useAuth();
  const location = useLocation();

  // Show nothing while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{
             background: "linear-gradient(135deg, #fdf2f5 0%, #ffdae1 50%, #f7e8ec 100%)",
             backgroundAttachment: "fixed",
           }}>
        <div className="text-center">
          <Novi expression="calm" size="xl" animated />
          <p className="text-rose-400 text-lg font-medium mt-4">Loading…</p>
        </div>
      </div>
    );
  }

  // Reset password page is always accessible (public route)
  if (location.pathname === "/reset-password") {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    );
  }

  // If on login page, show it regardless of auth state
  if (location.pathname === "/login") {
    // If authenticated but must change password, allow showing login/change-password
    if (isAuthenticated && !mustChangePassword) {
      return <Navigate to="/" replace />;
    }
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  // If mustChangePassword is set, force to login page
  if (mustChangePassword) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // All other routes: require auth
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ToastProvider>
      <ProtectedApp />
    </ToastProvider>
  );
}

export default App;

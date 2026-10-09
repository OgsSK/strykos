import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { StoreProvider, useStore } from "@/context/StoreProvider";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Catalog from "@/pages/Catalog";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Wishlist from "@/pages/Wishlist";
import Auth from "@/pages/Auth";
import Account from "@/pages/Account";
import BrandsPage from "@/pages/BrandsPage";
import StaticPage from "@/pages/StaticPage";
import NotFound from "@/pages/NotFound";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminSettings from "@/pages/admin/AdminSettings";

function Protected({ children, admin }) {
  const { user, authChecked } = useStore();
  if (!authChecked) return <div className="p-20 text-center text-ink-muted">...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <StoreProvider>
        <BrowserRouter>
          <Toaster position="top-center" richColors />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/search" element={<Catalog />} />
              <Route path="/product/:slug" element={<ProductDetail />} />
              <Route path="/brands" element={<BrandsPage />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/confirmation" element={<OrderConfirmation />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/login" element={<Auth mode="login" />} />
              <Route path="/register" element={<Auth mode="register" />} />
              <Route path="/account" element={<Protected><Account /></Protected>} />
              <Route path="/page/:slug" element={<StaticPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/admin" element={<Protected admin><AdminLayout /></Protected>}>
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </div>
  );
}

export default App;

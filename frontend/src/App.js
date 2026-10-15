import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminBrands from "@/pages/admin/AdminBrands";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminCustomers, { AdminCustomerDetail } from "@/pages/admin/AdminCustomers";
// ⭐ NOUVEAU : page admin livreurs
import AdminDrivers from "@/pages/admin/AdminDrivers";
import AdminPromos from "@/pages/admin/AdminPromos";
import AdminEmails from "@/pages/admin/AdminEmails";
import TrackOrder from "@/pages/TrackOrder";
import { ForgotPassword, ResetPassword } from "@/pages/PasswordReset";
import AdminReviews from "@/pages/admin/AdminReviews";
import AdminNewsletter from "@/pages/admin/AdminNewsletter";
import NewsletterUnsubscribe from "@/pages/NewsletterUnsubscribe";
import ConfirmEmailChange from "@/pages/ConfirmEmailChange";
import ConfirmEmail from "@/pages/ConfirmEmail"; // ⭐ NOUVEAU
import ScrollToTop from "@/components/ScrollToTop";
// ⭐ NOUVEAU : espace livreur
import Driver from "@/pages/Driver";
import DriverLogin from "@/pages/DriverLogin";
import DriverSetup from "@/pages/DriverSetup";

function Protected({ children, admin, driverOnly }) {
  const { user, authChecked } = useStore();
  const location = useLocation();

  if (!authChecked) return <div className="p-20 text-center text-ink-muted">...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;

  // ⭐ Un driver ne peut accéder qu'aux pages marquées driverOnly
  // (sauf pages publiques : login et setup)
  if (
    user.role === "driver" &&
    !driverOnly &&
    location.pathname !== "/livreur/login" &&
    location.pathname !== "/livreur/setup"
  ) {
    return <Navigate to="/livreur" replace />;
  }

  return children;
}

function App() {
  return (
    <div className="App">
      <StoreProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Toaster position="top-center" richColors />
          <Routes>
            {/* ⭐ Espace livreur — SANS header/footer du site */}
            <Route path="/livreur/setup" element={<DriverSetup />} />
            <Route path="/livreur/login" element={<DriverLogin />} />
            <Route
              path="/livreur"
              element={
                <Protected driverOnly>
                  <Driver />
                </Protected>
              }
            />

            {/* Site principal — AVEC header/footer */}
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
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/confirm-email" element={<ConfirmEmail />} />
              <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
              <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribe />} />
              <Route path="/account" element={<Protected><Account /></Protected>} />
              <Route path="/page/:slug" element={<StaticPage />} />
              <Route path="/suivi" element={<TrackOrder />} />
              <Route path="/track" element={<TrackOrder />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Admin */}
            <Route path="/admin" element={<Protected admin><AdminLayout /></Protected>}>
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="orders/:id" element={<AdminOrderDetail />} />
              <Route path="brands" element={<AdminBrands />} />
              <Route path="categories" element={<AdminCategories />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="customers/:id" element={<AdminCustomerDetail />} />
              {/* ⭐ NOUVEAU : gestion des livreurs */}
              <Route path="drivers" element={<AdminDrivers />} />
              <Route path="promos" element={<AdminPromos />} />
              <Route path="emails" element={<AdminEmails />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="newsletter" element={<AdminNewsletter />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </div>
  );
}

export default App;
import "@/App.css";
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { StoreProvider, useStore } from "@/context/StoreProvider";
import ScrollToTop from "@/components/ScrollToTop";

// --- Importations légères (chargées immédiatement) ---
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Catalog from "@/pages/Catalog";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Auth from "@/pages/Auth";
import NotFound from "@/pages/NotFound";

// --- Importations LAZY LOADING (chargées seulement au besoin) ---
// Boutique secondaire
const Wishlist = lazy(() => import("@/pages/Wishlist"));
const Account = lazy(() => import("@/pages/Account"));
const BrandsPage = lazy(() => import("@/pages/BrandsPage"));
const StaticPage = lazy(() => import("@/pages/StaticPage"));
const TrackOrder = lazy(() => import("@/pages/TrackOrder"));
const ForgotPassword = lazy(() => import("@/pages/PasswordReset").then(m => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/PasswordReset").then(m => ({ default: m.ResetPassword })));
const NewsletterUnsubscribe = lazy(() => import("@/pages/NewsletterUnsubscribe"));
const ConfirmEmailChange = lazy(() => import("@/pages/ConfirmEmailChange"));
const ConfirmEmail = lazy(() => import("@/pages/ConfirmEmail"));

// Admin
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("@/pages/admin/AdminProducts"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminOrderDetail = lazy(() => import("@/pages/admin/AdminOrderDetail"));
const AdminBrands = lazy(() => import("@/pages/admin/AdminBrands"));
const AdminCategories = lazy(() => import("@/pages/admin/AdminCategories"));
const AdminCustomers = lazy(() => import("@/pages/admin/AdminCustomers"));
const AdminCustomerDetail = lazy(() => import("@/pages/admin/AdminCustomers").then(m => ({ default: m.AdminCustomerDetail })));
const AdminDrivers = lazy(() => import("@/pages/admin/AdminDrivers"));
const AdminPromos = lazy(() => import("@/pages/admin/AdminPromos"));
const AdminEmails = lazy(() => import("@/pages/admin/AdminEmails"));
const AdminReviews = lazy(() => import("@/pages/admin/AdminReviews"));
const AdminNewsletter = lazy(() => import("@/pages/admin/AdminNewsletter"));

// Espace livreur
const Driver = lazy(() => import("@/pages/Driver"));
const DriverLogin = lazy(() => import("@/pages/DriverLogin"));
const DriverSetup = lazy(() => import("@/pages/DriverSetup"));


function Protected({ children, admin, driverOnly }) {
  const { user, authChecked } = useStore();
  const location = useLocation();

  if (!authChecked) return <div className="p-20 text-center text-ink-muted">Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;

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
          
          {/* Le Suspense affiche "Chargement" pendant que le code de la page se télécharge */}
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-secondary">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
            </div>
          }>
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
                <Route path="drivers" element={<AdminDrivers />} />
                <Route path="promos" element={<AdminPromos />} />
                <Route path="emails" element={<AdminEmails />} />
                <Route path="reviews" element={<AdminReviews />} />
                <Route path="newsletter" element={<AdminNewsletter />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </StoreProvider>
    </div>
  );
}

export default App;
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { PermissionRoute, ProtectedRoute } from "./auth/ProtectedRoute.jsx";
import { AppLayout } from "./components/AppLayout.jsx";
import { AdminOrdersPage } from "./pages/AdminOrdersPage.jsx";
import { CartPage } from "./pages/CartPage.jsx";
import { CatalogAdminPage } from "./pages/CatalogAdminPage.jsx";
import { CheckoutPage } from "./pages/CheckoutPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { InventoryPage } from "./pages/InventoryPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { OrderDetailPage } from "./pages/OrderDetailPage.jsx";
import { OrdersPage } from "./pages/OrdersPage.jsx";
import { ProductDetailPage } from "./pages/ProductDetailPage.jsx";
import { ProductsPage } from "./pages/ProductsPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { UsersPage } from "./pages/UsersPage.jsx";
import "./styles.css";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="cart"
          element={
            <ProtectedRoute>
              <CartPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="checkout"
          element={
            <ProtectedRoute>
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders"
          element={
            <ProtectedRoute>
              <OrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:orderId"
          element={
            <ProtectedRoute>
              <OrderDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/catalog"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="products:manage">
                <CatalogAdminPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/inventory"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="inventory:read">
                <InventoryPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/orders"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="orders:read">
                <AdminOrdersPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="users:read">
                <UsersPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

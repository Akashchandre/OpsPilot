import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { PermissionRoute, ProtectedRoute } from "./auth/ProtectedRoute.jsx";
import { AppLayout } from "./components/AppLayout.jsx";
import { AdminOrdersPage } from "./pages/AdminOrdersPage.jsx";
import { AdminSupportPage } from "./pages/AdminSupportPage.jsx";
import { BusinessWorkflowsPage } from "./pages/BusinessWorkflowsPage.jsx";
import { CartPage } from "./pages/CartPage.jsx";
import { CatalogAdminPage } from "./pages/CatalogAdminPage.jsx";
import { CheckoutPage } from "./pages/CheckoutPage.jsx";
import { CustomerAssistantPage } from "./pages/CustomerAssistantPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import {
  CustomerDocumentAssistantPage,
  OwnerDocumentAssistantPage,
} from "./pages/DocumentAssistantPage.jsx";
import { DocumentsPage } from "./pages/DocumentsPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { InventoryPage } from "./pages/InventoryPage.jsx";
import { JobsPage } from "./pages/JobsPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NewSupportTicketPage } from "./pages/NewSupportTicketPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { OrderDetailPage } from "./pages/OrderDetailPage.jsx";
import { OrdersPage } from "./pages/OrdersPage.jsx";
import { OwnerAssistantPage } from "./pages/OwnerAssistantPage.jsx";
import { ProductDetailPage } from "./pages/ProductDetailPage.jsx";
import { ProductsPage } from "./pages/ProductsPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { ReportsPage } from "./pages/ReportsPage.jsx";
import { SupportPage } from "./pages/SupportPage.jsx";
import { SupportTicketPage } from "./pages/SupportTicketPage.jsx";
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
          path="support"
          element={
            <ProtectedRoute>
              <SupportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="support/new"
          element={
            <ProtectedRoute>
              <NewSupportTicketPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="support/:ticketId"
          element={
            <ProtectedRoute>
              <SupportTicketPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="assistant"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="ai:customer:use">
                <CustomerAssistantPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="assistant/documents"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="ai:customer:use">
                <CustomerDocumentAssistantPage />
              </PermissionRoute>
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
        <Route
          path="admin/support"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="support:tickets:read">
                <AdminSupportPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/reports"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="reports:read">
                <ReportsPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/jobs"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="jobs:read">
                <JobsPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/documents"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="documents:read">
                <DocumentsPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/document-assistant"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="ai:owner:use">
                <OwnerDocumentAssistantPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/workflows"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="ai:workflows:business:use">
                <BusinessWorkflowsPage />
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/assistant"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="ai:owner:use">
                <PermissionRoute permission="reports:read">
                  <OwnerAssistantPage />
                </PermissionRoute>
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

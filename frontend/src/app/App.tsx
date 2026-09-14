import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { Button, Result, Spin } from "antd";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";
import { LoginPage } from "../features/auth/LoginPage";
import { PasswordModal } from "../features/auth/PasswordModal";
const PublicSharePage = lazy(() => import("../features/files/PublicSharePage"));
const FilesPage = lazy(() =>
  import("../features/files/FilesPage").then((module) => ({
    default: module.FilesPage,
  })),
);

function AuthenticatedRoutes() {
  const { user, loading, error, retry } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="app-loading">
        <Spin size="large" />
        <p>正在開啟工作空間…</p>
      </main>
    );
  if (error)
    return (
      <Result
        status="error"
        title="暫時無法連線"
        subTitle={error}
        extra={<Button onClick={retry}>重試</Button>}
      />
    );
  if (!user) return <LoginPage />;
  if (user.must_change_password)
    return (
      <main className="app-loading">
        <h1>請先修改初始密碼</h1>
        <PasswordModal open onClose={() => {}} />
      </main>
    );
  return (
    <Suspense
      fallback={
        <main className="app-loading">
          <Spin size="large" />
        </main>
      }
    >
      {![
        "/files",
        "/shares",
        "/trash",
        "/admin",
        "/settings/profile",
        "/settings/security",
        "/settings/accounts",
      ].includes(location.pathname) ? (
        <Navigate to={`/files${location.search}`} replace />
      ) : location.pathname === "/admin" ? (
        <Navigate to="/settings/accounts" replace />
      ) : (
        <FilesPage key={user.username} />
      )}
    </Suspense>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/share"
        element={
          <Suspense fallback={<Spin />}>
            <PublicSharePage />
          </Suspense>
        }
      />
      <Route
        path="*"
        element={
          <AuthProvider>
            <AuthenticatedRoutes />
          </AuthProvider>
        }
      />
    </Routes>
  );
}

const router = createBrowserRouter([{ path: "*", element: <AppRoutes /> }]);
export function Application() {
  return <RouterProvider router={router} />;
}

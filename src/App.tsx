/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ThemeEngine from "./components/ThemeEngine";
import { useStore } from "./store/useStore";

// Lazy load semua halaman — hanya dimuat saat dibutuhkan
// Ini sangat mengurangi ukuran bundle awal (Room.tsx saja ~60KB source)
const Landing = lazy(() => import("./pages/Landing"));
const ProfileSetup = lazy(() => import("./pages/ProfileSetup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Room = lazy(() => import("./pages/Room"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const profile = useStore((state) => state.profile);
  if (!profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Fallback minimal — background gelap saja agar tidak ada flash putih
const PageLoader = () => (
  <div className="min-h-screen bg-[#05060a]" />
);

export default function App() {
  return (
    <BrowserRouter>
      <ThemeEngine />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/profile" element={<ProfileSetup />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:roomId"
            element={
              <ProtectedRoute>
                <Room />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

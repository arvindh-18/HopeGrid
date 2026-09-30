// src/App.tsx — all routes (architecture.md §5.2). Only the lead edits route definitions (AR-36).
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '../shared/types';
import { Spinner, ToastProvider } from './components/ui';
import { AuthProvider, homeFor, useAuth } from './hooks/useAuth';
import { LanguageProvider } from './i18n';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import PublicMap from './pages/PublicMap';
import Report from './pages/Report';
import ReportSent from './pages/ReportSent';
import Track from './pages/Track';
import Dashboard from './pages/admin/Dashboard';
import IncidentPage from './pages/admin/IncidentPage';
import Resources from './pages/admin/Resources';
import AssignmentPage from './pages/volunteer/AssignmentPage';
import VolunteerHome from './pages/volunteer/VolunteerHome';
import VolunteerRegister from './pages/VolunteerRegister';
import Volunteers from './pages/admin/Volunteers';

/** Unauthenticated → /login. Wrong role → that user's home. */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <div className="grid min-h-screen place-items-center"><Spinner size={28} /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/report" element={<Report />} />
            <Route path="/report/sent/:id" element={<ReportSent />} />
            <Route path="/track" element={<Track />} />
            <Route path="/map" element={<PublicMap />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<RequireRole role="ADMIN"><Dashboard /></RequireRole>} />
            <Route path="/admin/incidents/:id" element={<RequireRole role="ADMIN"><IncidentPage /></RequireRole>} />
            <Route path="/admin/resources" element={<RequireRole role="ADMIN"><Resources /></RequireRole>} />
            <Route path="/volunteer/register" element={<VolunteerRegister />} />
            <Route path="/admin/volunteers" element={<RequireRole role="ADMIN"><Volunteers /></RequireRole>} />
            <Route path="/volunteer" element={<RequireRole role="VOLUNTEER"><VolunteerHome /></RequireRole>} />
            <Route path="/volunteer/assignments/:id" element={<RequireRole role="VOLUNTEER"><AssignmentPage /></RequireRole>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

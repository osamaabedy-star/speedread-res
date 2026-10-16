import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: ("student" | "teacher" | "supervisor" | "general_supervisor")[] }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile && !profile.approved && profile.role !== "general_supervisor") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4 text-center">
        <div className="max-w-md bg-[var(--card-bg)] p-8 rounded-2xl shadow-xl border border-[var(--border)]">
          <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <h2 className="text-2xl font-bold text-[var(--primary)] mb-4">الحساب قيد المراجعة</h2>
          <p className="text-[var(--text-light)] mb-4">
            شكراً لتسجيلك! حسابك حالياً قيد المراجعة من قبل الإدارة. يرجى المحاولة مرة أخرى لاحقاً بمجرد تفعيل حسابك.
          </p>
          <div className="bg-[var(--bg)] p-3 rounded-lg mb-8 text-sm">
            <span className="text-[var(--text-light)]">الحساب الحالي: </span>
            <span className="font-bold text-[var(--text)]">{user?.email || user?.phoneNumber || "غير معروف"}</span>
          </div>
          <button 
            onClick={() => {
              import('./firebase').then(({ auth }) => auth.signOut());
            }}
            className="w-full py-3 bg-[var(--bg)] text-[var(--text)] rounded-full font-bold border border-[var(--border)] hover:bg-gray-100 transition-all"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

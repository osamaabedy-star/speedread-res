import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";
import { Layout } from "./Layout";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Reader from "./Reader";
import Quiz from "./Quiz";
import Reports from "./Reports";
import Admin from "./Admin";
import Leaderboard from "./Leaderboard";
import Whiteboard from "./Whiteboard";
import TeacherDashboard from "./TeacherDashboard";

function Home() {
  const { profile } = useAuth();
  if (profile?.role === "teacher" || profile?.role === "supervisor" || profile?.role === "general_supervisor") {
    return <TeacherDashboard />;
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout>
                <Home />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/leaderboard" element={
            <ProtectedRoute>
              <Layout>
                <Leaderboard />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/read" element={
            <ProtectedRoute>
              <HomeRedirect to="/read">
                <Reader />
              </HomeRedirect>
            </ProtectedRoute>
          } />

          <Route path="/quiz" element={
            <ProtectedRoute>
              <Quiz />
            </ProtectedRoute>
          } />

          <Route path="/reports" element={
            <ProtectedRoute>
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={["general_supervisor", "supervisor"]}>
              <Layout>
                <Admin />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/whiteboard" element={
            <ProtectedRoute allowedRoles={["general_supervisor", "supervisor", "teacher"]}>
              <Whiteboard />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

// Helper to handle nested route context if needed, but not strictly necessary here
function HomeRedirect({ children }: { children: React.ReactNode, to: string }) {
  return <>{children}</>;
}

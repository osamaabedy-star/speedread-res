import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { auth } from "./firebase";
import { LogOut, Home, ChartLine, ShieldCheck, Sun, Moon, Leaf, Trophy } from "lucide-react";
import { cn } from "./utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = React.useState(localStorage.getItem("theme") || "light");

  React.useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
      <header className="container mx-auto px-4 py-4">
        <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-4 flex items-center justify-between shadow-sm border border-[var(--border)] flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 text-[var(--primary)] hover:opacity-80">
              <ChartLine size={32} />
              <h1 className="text-2xl font-bold">منصة القراءة</h1>
            </Link>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {user && (
              <div className="flex items-center gap-1 bg-[var(--bg)] p-1 rounded-full border border-[var(--border)]">
                <Link to="/" className={cn("px-4 py-2 rounded-full text-sm font-bold transition-all hover:bg-[var(--card-bg)]", location.pathname === "/" && "bg-[var(--primary)] text-white shadow-md")}>
                  <span>الرئيسية</span>
                </Link>
                <Link to="/reports" className={cn("px-4 py-2 rounded-full text-sm font-bold transition-all hover:bg-[var(--card-bg)]", location.pathname === "/reports" && "bg-[var(--primary)] text-white shadow-md")}>
                  <span>التقارير</span>
                </Link>
                <Link to="/leaderboard" className={cn("px-4 py-2 rounded-full text-sm font-bold transition-all hover:bg-[var(--card-bg)]", location.pathname === "/leaderboard" && "bg-[var(--primary)] text-white shadow-md")}>
                  <span>المتصدرون</span>
                </Link>
              </div>
            )}

            <div className="flex gap-2 bg-[var(--bg)] p-1 rounded-full border border-[var(--border)]">
              <button onClick={() => setTheme("light")} className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-all", theme === "light" ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text-light)] hover:bg-[var(--card-bg)]")}>
                <Sun size={16} />
              </button>
              <button onClick={() => setTheme("dark")} className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-all", theme === "dark" ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text-light)] hover:bg-[var(--card-bg)]")}>
                <Moon size={16} />
              </button>
              <button onClick={() => setTheme("comfort")} className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-all", theme === "comfort" ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text-light)] hover:bg-[var(--card-bg)]")}>
                <Leaf size={16} />
              </button>
            </div>

            {user && (
              <div className="flex items-center gap-3 bg-[var(--card-bg)] px-3 py-1.5 rounded-full border border-[var(--border)] shadow-sm">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold text-xs">
                  {profile?.username?.[0].toUpperCase()}
                </div>
                <div className="hidden sm:block text-right">
                  <div className="text-[10px] font-bold text-[var(--primary)] leading-none mb-0.5">{profile?.role === "student" ? "طالب" : "معلم"}</div>
                  <div className="text-xs font-bold leading-none">{profile?.username}</div>
                </div>
                <button onClick={handleLogout} className="text-[var(--accent)] hover:bg-red-50 p-1.5 rounded-full transition-all">
                  <LogOut size={16} />
                </button>
              </div>
            )}

            {(profile?.role === "general_supervisor" || profile?.role === "supervisor") && (
              <Link to="/admin" className="flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2 rounded-full hover:opacity-90 transition-all font-bold text-sm shadow-md">
                <ShieldCheck size={18} />
                <span>لوحة الإدارة</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pb-12">
        {children}
      </main>

      <footer className="container mx-auto px-4 py-8 text-center text-[var(--text-light)] text-sm border-t border-[var(--border)]">
        <div className="flex items-center justify-center gap-2">
          <ChartLine size={16} />
          <span>إحصائيات مبنية على أدائك</span>
        </div>
      </footer>
    </div>
  );
}

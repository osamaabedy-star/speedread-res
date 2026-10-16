import React, { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { db } from "./firebase";
import { UserProfile } from "./types";
import { Trophy, Medal, Crown, Star, Search, Filter, Loader2, TrendingUp, Zap } from "lucide-react";
import { cn, toIndianNumbers } from "./utils";
import { useAuth } from "./AuthContext";

export default function Leaderboard() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"speed" | "xp">("xp");

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "users"),
          where("role", "==", "user"),
          where("approved", "==", true),
          orderBy(tab === "xp" ? "xp" : "bestSpeed", "desc"),
          limit(20)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setUsers(data);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, [tab]);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Crown className="text-yellow-400" size={24} />;
      case 1: return <Medal className="text-gray-400" size={24} />;
      case 2: return <Medal className="text-amber-600" size={24} />;
      default: return null;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--primary)] opacity-5 blur-3xl -mr-16 -mt-16"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-[var(--accent)] opacity-5 blur-3xl -ml-16 -mb-16"></div>
        
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-[var(--primary)] text-white rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
            <Trophy size={40} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-[var(--primary)]">لوحة المتصدرين</h2>
            <p className="text-[var(--text-light)] mt-2 font-medium">أفضل الأبطال في رحلة القراءة السريعة</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mt-8 p-1 bg-[var(--bg)] rounded-full w-fit mx-auto border border-[var(--border)]">
          <button 
            onClick={() => setTab("xp")}
            className={cn(
              "px-8 py-3 rounded-full font-bold transition-all flex items-center gap-2",
              tab === "xp" ? "bg-[var(--primary)] text-white shadow-md scale-105" : "text-[var(--text-light)] hover:text-[var(--primary)]"
            )}
          >
            <Star size={18} />
            <span>نقاط الخبرة (XP)</span>
          </button>
          <button 
            onClick={() => setTab("speed")}
            className={cn(
              "px-8 py-3 rounded-full font-bold transition-all flex items-center gap-2",
              tab === "speed" ? "bg-[var(--primary)] text-white shadow-md scale-105" : "text-[var(--text-light)] hover:text-[var(--primary)]"
            )}
          >
            <Zap size={18} />
            <span>أعلى سرعة (WPM)</span>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-md overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-[var(--primary)]" size={40} />
            <p className="font-bold text-[var(--text-light)]">جاري تحميل الأبطال...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[var(--bg)] border-b border-[var(--border)]">
                  <th className="p-4 font-black text-center w-20">المركز</th>
                  <th className="p-4 font-black">المستخدم</th>
                  <th className="p-4 font-black text-center">المستوى</th>
                  <th className="p-4 font-black text-center">{tab === "xp" ? "نقاط الخبرة" : "أعلى سرعة"}</th>
                  <th className="p-4 font-black text-center">السلسلة</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, index) => (
                  <tr 
                    key={u.uid} 
                    className={cn(
                      "border-b border-[var(--border)] transition-colors hover:bg-[var(--bg)]",
                      u.uid === profile?.uid && "bg-[var(--primary)]/5"
                    )}
                  >
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center">
                        {getRankIcon(index) || (
                          <span className="text-lg font-bold text-[var(--text-light)]">#{toIndianNumbers(index + 1)}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center font-bold">
                          {u.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold">{u.username} {u.uid === profile?.uid && <span className="text-xs bg-[var(--primary)] text-white px-2 py-0.5 rounded-full mr-2">أنت</span>}</p>
                          <p className="text-[10px] text-[var(--text-light)]">{u.fullName || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="bg-[var(--bg)] px-3 py-1 rounded-lg border border-[var(--border)] font-bold text-xs">
                        {toIndianNumbers(u.level)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {tab === "xp" ? (
                          <>
                            <Star size={16} className="text-yellow-500 fill-yellow-500" />
                            <span className="text-xl font-black text-[var(--primary)]">{toIndianNumbers(u.xp)}</span>
                          </>
                        ) : (
                          <>
                            <Zap size={16} className="text-blue-500 fill-blue-500" />
                            <span className="text-xl font-black text-[var(--primary)]">{toIndianNumbers(u.bestSpeed)}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-orange-500">
                        <TrendingUp size={16} />
                        <span className="font-bold">{toIndianNumbers(u.streak)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ReadingSession, QuizResult } from "./types";
import { cn, toIndianNumbers, formatTime } from "./utils";
import { ChartLine, BookOpen, Gauge, Percent, Clock, History, Eye, Loader2, ChevronRight, AlertCircle, CheckCircle, Trash2, Database, Zap } from "lucide-react";
import { collection, query, where, getDocs, orderBy, limit, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { SignaturePad } from "./components/SignaturePad";

export default function Reports() {
  const { user: currentUser, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // If targetUserId is passed in location state, we view that user's reports (admins/teachers only)
  const targetUserId = location.state?.userId || location.state?.targetUserId;
  const targetUsername = location.state?.username;
  
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [quizzes, setQuizzes] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSession, setSelectedSession] = useState<ReadingSession | null>(null);
  const [selectedQuizForSigning, setSelectedQuizForSigning] = useState<QuizResult | null>(null);

  const viewUid = targetUserId || currentUser?.uid;

  useEffect(() => {
    if (!viewUid) return;
    const fetchData = async () => {
      try {
        let sessionsData: ReadingSession[] = [];
        try {
          const sessionsQuery = query(collection(db, "reading_sessions"), where("userId", "==", viewUid), orderBy("date", "desc"), limit(50));
          const sessionsSnap = await getDocs(sessionsQuery);
          sessionsData = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReadingSession));
        } catch (idxErr) {
          const fallbackQ = query(collection(db, "reading_sessions"), where("userId", "==", viewUid));
          const fallbackSnap = await getDocs(fallbackQ);
          sessionsData = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReadingSession));
          sessionsData.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        }
        setSessions(sessionsData);

        let quizzesData: QuizResult[] = [];
        try {
          const quizzesQuery = query(collection(db, "quiz_results"), where("userId", "==", viewUid), orderBy("date", "desc"), limit(50));
          const quizzesSnap = await getDocs(quizzesQuery);
          quizzesData = quizzesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizResult));
        } catch (idxErr) {
          const fallbackQ = query(collection(db, "quiz_results"), where("userId", "==", viewUid));
          const fallbackSnap = await getDocs(fallbackQ);
          quizzesData = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizResult));
          quizzesData.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        }
        setQuizzes(quizzesData);
      } catch (err: any) {
        console.error("Failed to fetch reports:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [viewUid]);

  const validSessions = sessions.filter(s => s.speed && isFinite(s.speed));
  const totalSessions = validSessions.length;
  const totalReadingTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const avgSpeed = totalSessions > 0 ? Math.round(validSessions.reduce((sum, s) => sum + (s.speed || 0), 0) / totalSessions) : 0;
  const avgScore = quizzes.length > 0 ? Math.round(quizzes.reduce((sum, q) => sum + (q.score || 0), 0) / quizzes.length) : 0;

  const speedChartData = [...validSessions].reverse().map((s, i) => ({ name: `جلسة ${i+1}`, speed: s.speed }));
  
  const scoreStats = { excellent: 0, good: 0, acceptable: 0, poor: 0 };
  quizzes.forEach(q => {
    if (q.score >= 85) scoreStats.excellent++;
    else if (q.score >= 70) scoreStats.good++;
    else if (q.score >= 50) scoreStats.acceptable++;
    else scoreStats.poor++;
  });
  const pieData = [
    { name: "ممتاز (85+)", value: scoreStats.excellent, color: "#10b981" },
    { name: "جيد (70-84)", value: scoreStats.good, color: "#4361ee" },
    { name: "مقبول (50-69)", value: scoreStats.acceptable, color: "#f59e0b" },
    { name: "ضعيف (<50)", value: scoreStats.poor, color: "#ef4444" }
  ].filter(d => d.value > 0);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]"><Loader2 className="animate-spin text-[var(--primary)]" size={48} /></div>;

  return (
    <div className="space-y-2.5 max-w-5xl mx-auto pb-8 font-tajawal rtl px-2 sm:px-0" dir="rtl">
      {/* 1. الشريط العلوي المصغر */}
      <div className="bg-[var(--card-bg)] rounded-xl px-3 py-2 border border-[var(--border)] shadow-2xs flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[var(--primary)] font-bold">
          <ChartLine size={16} />
          <h2 className="text-sm sm:text-base font-black text-gray-900">{targetUsername ? `تقرير الطالب: ${targetUsername}` : "تقاريري"}</h2>
        </div>
        <div className="flex gap-1.5">
          <button 
            onClick={() => navigate(profile?.role === "teacher" ? "/teacher" : "/")} 
            className="bg-[var(--bg)] text-[var(--text)] px-3 py-1 rounded-lg text-xs font-bold border border-[var(--border)] hover:bg-gray-100 transition-all cursor-pointer"
          >
            {profile?.role === "teacher" ? "لوحة المعلم" : "الرئيسية"}
          </button>
        </div>
      </div>

      {/* 2. مربعات الإحصاءات المصغرة والمدمجة في شريط أنيق */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: BookOpen, label: "الدروس المقروءة", value: toIndianNumbers(totalSessions) },
          { icon: Zap, label: "متوسط السرعة (ك/د)", value: toIndianNumbers(avgSpeed) },
          { icon: Percent, label: "متوسط درجة الفهم", value: toIndianNumbers(avgScore) + "%" },
          { icon: Clock, label: "إجمالي وقت القراءة", value: toIndianNumbers(Math.round(totalReadingTime / 60)) + " د" }
        ].map((s, i) => (
          <div key={i} className="bg-[var(--card-bg)] rounded-xl p-2 border border-[var(--border)] shadow-2xs flex items-center gap-2 hover:shadow-xs transition-all">
            <div className="w-6 h-6 bg-primary/10 text-[var(--primary)] rounded-lg flex items-center justify-center shrink-0">
              <s.icon size={12} />
            </div>
            <div className="overflow-hidden min-w-0">
              <div className="text-sm font-black text-[var(--primary-dark)] tabular-nums leading-tight truncate">
                {s.value}
              </div>
              <div className="text-[9px] text-[var(--text-light)] font-bold truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. مربعات الرسوم البيانية المصغرة */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {/* مربع سرعة القراءة المصغر */}
        <div className="bg-[var(--card-bg)] rounded-xl p-2.5 sm:p-3 border border-[var(--border)] shadow-2xs space-y-1.5">
          <h3 className="text-xs font-black text-[var(--primary)] flex items-center gap-1.5">
            <ChartLine size={14} />
            <span>تطور سرعة القراءة</span>
          </h3>
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={speedChartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="name" hide />
                <YAxis stroke="var(--text-light)" fontSize={10} />
                <Tooltip contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "10px", padding: "4px 8px" }} />
                <Line type="monotone" dataKey="speed" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--primary)" }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* مربع توزيع درجات الفهم المصغر */}
        <div className="bg-[var(--card-bg)] rounded-xl p-2.5 sm:p-3 border border-[var(--border)] shadow-2xs space-y-1.5">
          <h3 className="text-xs font-black text-[var(--primary)] flex items-center gap-1.5">
            <Percent size={14} />
            <span>توزيع درجات الفهم القرائي</span>
          </h3>
          <div className="h-[105px] w-full flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={24} outerRadius={42} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "6px", padding: "4px 6px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-[10px] text-[var(--text-light)] font-bold">لا توجد نتائج اختبارات بعد</div>
            )}
          </div>
          <div className="flex justify-center gap-2 flex-wrap pt-0.5">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-1 text-[9px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.color }}></span>
                <span className="text-gray-600">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. مربع جدول جلسات القراءة المصغر */}
      <div className="bg-[var(--card-bg)] rounded-xl p-2.5 sm:p-3 border border-[var(--border)] shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-[var(--primary)] flex items-center gap-1.5">
            <History size={14} />
            <span>سجل جلسات القراءة والاختبارات</span>
          </h3>
          <span className="text-[10px] text-gray-400 font-bold">
            إجمالي: {toIndianNumbers(sessions.length)} جلسة
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs">
            <thead>
              <tr className="bg-[var(--bg)] text-[var(--text-light)] border-b border-[var(--border)]">
                <th className="py-1 px-1.5 font-black text-[10px]">التاريخ</th>
                <th className="py-1 px-1.5 font-black text-[10px]">النص</th>
                <th className="py-1 px-1.5 font-black text-[10px]">السرعة</th>
                <th className="py-1 px-1.5 font-black text-[10px]">الأخطاء</th>
                <th className="py-1 px-1.5 font-black text-[10px]">التقييم</th>
                <th className="py-1 px-1.5 font-black text-[10px]">المدة</th>
                <th className="py-1 px-1.5 font-black text-[10px]">الحالة</th>
                <th className="py-1 px-1.5 font-black text-[10px]">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const quiz = quizzes.find(q => q.lessonId === s.lessonId && new Date(q.date) >= new Date(s.date));
                return (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-primary/5 transition-all">
                    <td className="py-1 px-1.5 text-[10px] text-gray-500">{new Date(s.date).toLocaleDateString("ar-SA")}</td>
                    <td className="py-1 px-1.5 text-[11px] font-black text-gray-900">{s.lessonTitle}</td>
                    <td className="py-1 px-1.5 text-[11px] tabular-nums font-bold">{toIndianNumbers(s.speed)}</td>
                    <td className="py-1 px-1.5 text-[11px] text-[var(--accent)] tabular-nums font-bold">{toIndianNumbers(s.errors)}</td>
                    <td className="py-1 px-1.5 font-black text-[var(--primary)] text-[11px]">
                      {quiz ? (
                        <div className="flex flex-col items-center">
                          <span className={cn(
                            "tabular-nums px-1.5 py-0.2 rounded font-black text-[10px]",
                            quiz.score >= 85 ? "bg-emerald-50 text-emerald-700" :
                            quiz.score >= 70 ? "bg-blue-50 text-blue-700" :
                            quiz.score >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                          )}>
                            {toIndianNumbers(quiz.score)}%
                          </span>
                          {quiz.teacherSignature && (
                            <img src={quiz.teacherSignature} className="h-3 grayscale contrast-150 mt-0.5" alt="توقيع" />
                          )}
                          {!quiz.teacherSignature && profile?.role === "teacher" && (
                            <button onClick={() => setSelectedQuizForSigning(quiz)} className="text-[8px] text-blue-600 hover:underline font-bold mt-0.5">توقيع</button>
                          )}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1 px-1.5 text-[10px] tabular-nums text-gray-600">{toIndianNumbers(s.duration)} ث</td>
                    <td className="py-1 px-1.5">
                      <span className={cn("px-1.5 py-0.2 rounded-md text-[8px] font-black text-white", s.completed ? "bg-[var(--success)]" : "bg-[var(--warning)]")}>
                        {s.completed ? "مكتمل" : "جزئي"}
                      </span>
                    </td>
                    <td className="py-1 px-1.5">
                      <button onClick={() => setSelectedSession(s)} className="text-[var(--primary)] hover:scale-110 transition-all p-0.5" title="معاينة الأخطاء">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sessions.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-xs text-gray-400 font-bold">لا توجد جلسات قراءة مسجلة بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal المصغر */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200] p-3">
          <div className="bg-[var(--panel)] rounded-xl p-4 max-w-sm w-full text-center border border-[var(--border)] shadow-2xl space-y-3 animate-in zoom-in duration-200">
            <h2 className="text-sm font-black flex items-center justify-center gap-1.5">
              <AlertCircle className="text-[var(--accent)]" size={16} />
              <span>تفاصيل أخطاء القراءة</span>
            </h2>
            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2.5 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              {selectedSession.errorWords.length > 0 ? selectedSession.errorWords.map((w, i) => (
                <span key={i} className="bg-[var(--accent)] text-white px-2 py-0.5 rounded-md text-[10px] font-bold">{w}</span>
              )) : <div className="w-full text-center text-xs text-gray-400">لا توجد أخطاء مسجلة في هذا النص ✓</div>}
            </div>
            <button onClick={() => setSelectedSession(null)} className="w-full py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-black hover:shadow-md transition-all cursor-pointer">
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Quiz Signing Modal المصغر */}
      {selectedQuizForSigning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200] p-3">
           <div className="bg-[var(--card-bg)] rounded-xl p-4 max-w-xs w-full border border-[var(--border)] shadow-2xl space-y-3 animate-in zoom-in duration-200">
              <h3 className="text-sm font-black text-center text-gray-900">توقيع المعلم على الاختبار</h3>
              <p className="text-[11px] text-center text-gray-500 font-bold">
                {selectedQuizForSigning.lessonTitle} - الدرجة: {toIndianNumbers(selectedQuizForSigning.score)}%
              </p>
              
              <SignaturePad 
                onSave={async (sig) => {
                  try {
                    await updateDoc(doc(db, "quiz_results", selectedQuizForSigning.id!), {
                      teacherSignature: sig
                    });
                    setQuizzes(prev => prev.map(q => q.id === selectedQuizForSigning.id ? { ...q, teacherSignature: sig } : q));
                    setSelectedQuizForSigning(null);
                    alert("تم حفظ التوقيع على الاختبار بنجاح");
                  } catch (err) {
                    alert("فشل حفظ التوقيع: " + err);
                  }
                }}
              />
              
              <button onClick={() => setSelectedQuizForSigning(null)} className="w-full py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200 transition-all cursor-pointer">
                إلغاء
              </button>
           </div>
        </div>
      )}
    </div>
  );
}

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
    <div className="space-y-8 mt-8">
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-6 border border-[var(--border)] shadow-md flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 text-[var(--primary)] font-bold">
          <ChartLine size={28} />
          <h2 className="text-2xl font-bold">{targetUsername ? `تقارير الطالب: ${targetUsername}` : "تقاريري"}</h2>
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate("/")} className="bg-[var(--bg)] text-[var(--text)] px-6 py-2 rounded-full font-bold border border-[var(--border)] hover:bg-gray-100 transition-all">الرئيسية</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: BookOpen, label: "عدد الدروس المقروءة", value: toIndianNumbers(totalSessions) },
          { icon: Zap, label: "متوسط السرعة (ك/د)", value: toIndianNumbers(avgSpeed) },
          { icon: Percent, label: "متوسط درجة الفهم", value: toIndianNumbers(avgScore) + "%" },
          { icon: Clock, label: "إجمالي وقت القراءة", value: toIndianNumbers(Math.round(totalReadingTime / 60)) + " د" }
        ].map((s, i) => (
          <div key={i} className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-4 border border-[var(--border)] shadow-sm text-center space-y-2 hover:-translate-y-1 transition-all">
            <div className="w-8 h-8 bg-primary/10 text-[var(--primary)] rounded-full flex items-center justify-center mx-auto"><s.icon size={16} /></div>
            <div className="text-xl font-black text-[var(--primary-dark)] tabular-nums">{s.value}</div>
            <div className="text-[10px] text-[var(--text-light)] font-bold">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-8 border border-[var(--border)] shadow-md space-y-6">
          <h3 className="text-lg font-bold text-[var(--primary)] flex items-center gap-2"><ChartLine size={20} /> تطور سرعة القراءة</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={speedChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" hide />
                <YAxis stroke="var(--text-light)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "12px" }} />
                <Line type="monotone" dataKey="speed" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--primary)" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-8 border border-[var(--border)] shadow-md space-y-6">
          <h3 className="text-lg font-bold text-[var(--primary)] flex items-center gap-2"><Percent size={20} /> توزيع درجات الفهم</h3>
          <div className="h-[300px] w-full flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-[var(--text-light)]">لا توجد نتائج اختبارات بعد</div>
            )}
          </div>
          <div className="flex justify-center gap-4 flex-wrap">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-bold">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></span>
                <span>{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-8 border border-[var(--border)] shadow-md space-y-6">
        <h3 className="text-lg font-bold text-[var(--primary)] flex items-center gap-2"><History size={20} /> آخر جلسات القراءة</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm">
            <thead>
              <tr className="bg-[var(--bg)] text-[var(--text)] border-b-2 border-[var(--border)]">
                <th className="p-2 font-bold text-xs">التاريخ</th>
                <th className="p-2 font-bold text-xs">النص</th>
                <th className="p-2 font-bold text-xs">السرعة</th>
                <th className="p-2 font-bold text-xs">الأخطاء</th>
                <th className="p-2 font-bold text-xs">الدرجة</th>
                <th className="p-2 font-bold text-xs">المدة</th>
                <th className="p-2 font-bold text-xs">الحالة</th>
                <th className="p-2 font-bold text-xs">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const quiz = quizzes.find(q => q.lessonId === s.lessonId && new Date(q.date) >= new Date(s.date));
                return (
                  <tr key={s.id} className="border-b border-[var(--border)] hover:bg-primary/5 transition-all">
                    <td className="p-2 text-xs">{new Date(s.date).toLocaleDateString("ar-EG")}</td>
                    <td className="p-2 text-xs font-bold">{s.lessonTitle}</td>
                    <td className="p-2 text-xs tabular-nums">{toIndianNumbers(s.speed)}</td>
                    <td className="p-2 text-xs text-[var(--accent)] tabular-nums">{toIndianNumbers(s.errors)}</td>
                    <td className="p-2 font-bold text-[var(--primary)] text-xs">
                      {quiz ? (
                        <div className="flex flex-col items-center">
                          <span className="tabular-nums">{toIndianNumbers(quiz.score)}%</span>
                          {quiz.teacherSignature && (
                            <img src={quiz.teacherSignature} className="h-4 grayscale contrast-150 mt-1" alt="توقيع" />
                          )}
                          {!quiz.teacherSignature && profile?.role === "teacher" && (
                            <button onClick={() => setSelectedQuizForSigning(quiz)} className="text-[7px] text-blue-500 hover:underline">توقيع</button>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="p-2 text-xs tabular-nums">{toIndianNumbers(s.duration)} ث</td>
                    <td className="p-2">
                      <span className={cn("px-2 py-0.5 rounded-full text-[8px] font-bold text-white", s.completed ? "bg-[var(--success)]" : "bg-[var(--warning)]")}>
                        {s.completed ? "نعم" : "لا"}
                      </span>
                    </td>
                    <td className="p-2">
                      <button onClick={() => setSelectedSession(s)} className="text-[var(--primary)] hover:scale-110 transition-all"><Eye size={16} /></button>
                    </td>
                  </tr>
                );
              })}
              {sessions.length === 0 && (
                <tr><td colSpan={8} className="p-12 text-[var(--text-light)]">لا توجد جلسات قراءة بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[var(--panel)] rounded-[var(--radius-lg)] p-10 max-w-xl w-full text-center border-2 border-[var(--primary)] shadow-2xl space-y-8 animate-in zoom-in duration-300">
            <h2 className="text-2xl font-bold flex items-center justify-center gap-3">
              <AlertCircle className="text-[var(--accent)]" />
              <span>تفاصيل الأخطاء</span>
            </h2>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-6 bg-[var(--bg)] rounded-3xl border border-[var(--border)]">
              {selectedSession.errorWords.length > 0 ? selectedSession.errorWords.map((w, i) => (
                <span key={i} className="bg-[var(--accent)] text-white px-4 py-1 rounded-full text-sm font-bold">{w}</span>
              )) : <div className="w-full text-center text-[var(--text-light)]">لا توجد أخطاء مسجلة</div>}
            </div>
            <button onClick={() => setSelectedSession(null)} className="w-full py-4 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all">إغلاق</button>
          </div>
        </div>
      )}

      {/* Quiz Signing Modal */}
      {selectedQuizForSigning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
           <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 max-w-md w-full border border-[var(--border)] shadow-2xl space-y-6 animate-in zoom-in duration-200">
              <h3 className="text-xl font-bold text-center">توقيع المعلم على الاختبار</h3>
              <p className="text-xs text-center text-[var(--text-light)]">اختبار: {selectedQuizForSigning.lessonTitle} - الدرجة: {toIndianNumbers(selectedQuizForSigning.score)}%</p>
              
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
              
              <button onClick={() => setSelectedQuizForSigning(null)} className="w-full py-3 bg-[var(--bg)] text-[var(--text)] rounded-full font-bold border border-[var(--border)]">إلغاء</button>
           </div>
        </div>
      )}
    </div>
  );
}

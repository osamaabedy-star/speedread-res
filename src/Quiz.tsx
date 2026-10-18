import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { QuizQuestion, QuizResult, ReadingSession } from "./types";
import { cn, toIndianNumbers, formatTime } from "./utils";
import { HelpCircle, ArrowRight, ArrowLeft, CheckCircle, XCircle, Trophy, ThumbsUp, Target, Clock, AlertTriangle, Home, BookOpen, Loader2, RotateCcw, X } from "lucide-react";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { updateUserStats } from "./stats";

export default function Quiz() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(number | string[])[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showError, setShowError] = useState(false);
  const [showPracticeModal, setShowPracticeModal] = useState(false);
  const [practiceWordIdx, setPracticeWordIdx] = useState(0);

  useEffect(() => {
    const savedSession = sessionStorage.getItem("currentReadingSession");
    if (!savedSession) {
      navigate("/");
      return;
    }
    const parsedSession = JSON.parse(savedSession);
    setSession(parsedSession);
    
    const initQuestions = async () => {
      let qList: QuizQuestion[] = parsedSession.questions || [];

      // If for any reason session questions were empty, load the exact lesson's questions
      if (qList.length === 0 && parsedSession.lessonId) {
        try {
          const files = [
            "primary_first.json", "primary_second.json", "upper_first.json", "upper_second.json",
            "lessons_1_2_part1.json",
            "lessons_part1.json", "lessons_part2.json", "lessons_part3.json", "lessons_part4.json", "lessons_part5.json"
          ];
          for (const file of files) {
            const res = await fetch(`/${file}`);
            if (res.ok) {
              const data = await res.json();
              const found = data.find((l: any) => l.id === parsedSession.lessonId);
              if (found && found.questions && found.questions.length > 0) {
                qList = found.questions;
                break;
              }
            }
          }

          // If not in static files, fetch from Firestore custom lessons
          if (qList.length === 0) {
            const docSnap = await getDoc(doc(db, "lessons", parsedSession.lessonId));
            if (docSnap.exists()) {
              const lessonData = docSnap.data();
              if (lessonData?.questions && Array.isArray(lessonData.questions) && lessonData.questions.length > 0) {
                qList = lessonData.questions;
              }
            }
          }
        } catch (e) {
          console.error("Failed to load lesson questions:", e);
        }
      }

      // تصنيف الأسئلة عشوائياً ومتدرجة من السهل إلى الصعب
      const getDifficultyTier = (q: QuizQuestion): { tier: number; label: string } => {
        if (q.difficulty === "easy" || q.difficulty === 1) return { tier: 1, label: "مستوى مباشر (سهل)" };
        if (q.difficulty === "medium" || q.difficulty === 2) return { tier: 2, label: "مستوى فهم واستنتاج (متوسط)" };
        if (q.difficulty === "hard" || q.difficulty === 3) return { tier: 3, label: "مستوى تفكير وتحليل (متقدم)" };

        const text = q.text || "";
        // أسئلة مباشرة: استرجاع حقائق وأسماء
        if (/^(من|أين|متى|ما اسم|كم|هل|اذكر)\b/.test(text.trim())) {
          return { tier: 1, label: "مستوى مباشر (سهل)" };
        }
        // أسئلة عميقة: الفكرة، العبرة، استنتاج
        if (/(الفكرة الرئيس|العبرة|الهدف|استنتج|رأيك|الدرس المستفاد|مغزى|دلالة)/.test(text)) {
          return { tier: 3, label: "مستوى تفكير وتحليل (متقدم)" };
        }
        // أسئلة فهم وتفسير وترتيب
        return { tier: 2, label: "مستوى فهم واستنتاج (متوسط)" };
      };

      // خلط عشوائي للعناصر
      const shuffle = <T,>(arr: T[]): T[] => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };

      const easyList = shuffle(qList.filter(q => getDifficultyTier(q).tier === 1).map(q => ({ ...q, difficultyLabel: getDifficultyTier(q).label })));
      const mediumList = shuffle(qList.filter(q => getDifficultyTier(q).tier === 2).map(q => ({ ...q, difficultyLabel: getDifficultyTier(q).label })));
      const hardList = shuffle(qList.filter(q => getDifficultyTier(q).tier === 3).map(q => ({ ...q, difficultyLabel: getDifficultyTier(q).label })));

      const finalGraduatedList = [...easyList, ...mediumList, ...hardList];

      setQuestions(finalGraduatedList);
      setUserAnswers(new Array(finalGraduatedList.length).fill(null));
      setLoading(false);
    };

    initQuestions();
  }, [navigate]);

  const handleAnswer = (answer: number | string[]) => {
    if (submitted) return;
    const newAnswers = [...userAnswers];
    newAnswers[currentIndex] = answer;
    setUserAnswers(newAnswers);
  };

  const handleSubmit = async () => {
    if (submitted) return;

    let correct = 0;
    questions.forEach((q, i) => {
      const ans = userAnswers[i];
      if (q.type === "multiple") {
        if (ans === q.correct) correct++;
      } else if (q.type === "order") {
        const correctOrder = q.correctOrder?.map(idx => q.items?.[idx]) || [];
        if (JSON.stringify(ans) === JSON.stringify(correctOrder)) correct++;
      }
    });

    const finalScore = Math.round((correct / questions.length) * 100);
    setScore(finalScore);
    setCorrectCount(correct);
    setSubmitted(true);

    if (user && session) {
      const result: QuizResult = {
        userId: session.userId,
        username: session.username,
        lessonId: session.lessonId,
        lessonTitle: session.lessonTitle,
        date: new Date().toISOString(),
        score: finalScore,
        correctAnswers: correct,
        totalQuestions: questions.length
      };
      try {
        await addDoc(collection(db, "quiz_results"), result);
        await updateUserStats(session.userId, "quiz", correct);
        
        // Only refresh own profile if saving for self
        if (session.userId === user.uid) {
          await refreshProfile();
        }
      } catch (error) {
        console.error("Failed to save quiz result:", error);
      }
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]"><Loader2 className="animate-spin text-[var(--primary)]" size={48} /></div>;

  const currentQuestion = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const allAnswered = userAnswers.every(a => a !== null);

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4 pb-20">
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-5 border border-[var(--border)] shadow-md flex items-center justify-between mb-8 flex-wrap gap-3">
        <div className="flex items-center gap-3 text-[var(--primary)] font-bold">
          <HelpCircle size={24} className="text-amber-500" />
          <div>
            <h2 className="text-base sm:text-lg font-black text-gray-900">أسئلة الفهم القرائي</h2>
            <p className="text-xs text-gray-500 font-bold">نص: {session?.lessonTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session?.username && (
            <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-black border border-blue-200">
              المتدرب: {session?.username}
            </div>
          )}
          <button 
            onClick={() => navigate(profile?.role === "teacher" ? "/teacher" : "/")} 
            className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <Home size={15} />
            <span>{profile?.role === "teacher" ? "لوحة المعلم" : "الرئيسية"}</span>
          </button>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-12 border border-[var(--border)] shadow-md text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <HelpCircle size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-800">لا توجد أسئلة مخصصة لهذا الدرس حالياً</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
            لضمان دقة قياس الفهم والاستيعاب القرائي، لا يتم عرض أسئلة عامة أو بديلة غير مطابقة لنص الدرس. يمكنك اختيار نص آخر يحتوي على أسئلة فهم مضافة.
          </p>
          <div className="pt-4 flex justify-center gap-3">
            <button 
              onClick={() => navigate(profile?.role === "teacher" ? "/teacher" : "/")}
              className="px-6 py-3 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all"
            >
              {profile?.role === "teacher" ? "العودة للوحة المعلم" : "العودة واختيار نص آخر"}
            </button>
          </div>
        </div>
      ) : !submitted ? (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-3">
              <BookOpen size={24} className="text-[var(--primary)]" />
              <span>أجب عن الأسئلة</span>
            </h3>
            <span className="bg-[var(--primary)] text-white px-4 py-1 rounded-full text-xs font-bold">
              {toIndianNumbers(currentIndex + 1)} / {toIndianNumbers(questions.length)}
            </span>
          </div>

          <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--primary)] transition-all duration-300" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}></div>
          </div>

          <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-6 border border-[var(--border)] shadow-lg space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-base sm:text-lg font-black leading-relaxed text-gray-900">
                {currentIndex + 1}. {currentQuestion.text}
              </div>
              {currentQuestion.difficultyLabel && (
                <span className={cn(
                  "text-[10px] font-black px-2.5 py-1 rounded-full border shrink-0",
                  currentQuestion.difficultyLabel.includes("سهل") || currentQuestion.difficultyLabel.includes("مباشر")
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  currentQuestion.difficultyLabel.includes("متوسط") || currentQuestion.difficultyLabel.includes("فهم")
                    ? "bg-blue-50 text-blue-700 border-blue-200" :
                    "bg-purple-50 text-purple-700 border-purple-200"
                )}>
                  {currentQuestion.difficultyLabel}
                </span>
              )}
            </div>

            {currentQuestion.type === "multiple" ? (
              <div className="grid grid-cols-1 gap-3">
                {currentQuestion.options?.map((opt, i) => (
                  <button key={i} onClick={() => handleAnswer(i)} className={cn("p-4 rounded-[var(--radius-sm)] border-2 text-right font-bold transition-all hover:scale-[1.02]", userAnswers[currentIndex] === i ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:border-[var(--primary)] hover:bg-primary/5")}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[var(--text-light)] italic">قم بترتيب الأحداث (هذا الوضع يتطلب السحب والإفلات في النسخة الكاملة، هنا نستخدم النقر للاختيار بالترتيب)</p>
                {/* Simplified order logic for React demo */}
                <div className="flex flex-wrap gap-3">
                  {currentQuestion.items?.map((item, i) => {
                    const orderIdx = (userAnswers[currentIndex] as string[] || []).indexOf(item);
                    return (
                      <button key={i} onClick={() => {
                        const currentOrder = (userAnswers[currentIndex] as string[] || []);
                        if (orderIdx === -1) {
                          handleAnswer([...currentOrder, item]);
                        } else {
                          handleAnswer(currentOrder.filter(it => it !== item));
                        }
                      }} className={cn("px-6 py-3 rounded-full border-2 font-bold transition-all flex items-center gap-3", orderIdx !== -1 ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)]")}>
                        {orderIdx !== -1 && <span className="w-6 h-6 bg-white text-[var(--primary)] rounded-full flex items-center justify-center text-xs">{toIndianNumbers(orderIdx + 1)}</span>}
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-4 relative">
            {showError && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap animate-in fade-in slide-in-from-bottom-2">
                يجب الإجابة على جميع الأسئلة لتتمكن من تسليم النتيجة
              </div>
            )}
            <button onClick={() => setCurrentIndex(prev => prev - 1)} disabled={currentIndex === 0} className="flex-1 px-4 py-3 bg-[var(--bg)] text-[var(--text)] rounded-full font-bold border border-[var(--border)] hover:bg-gray-100 transition-all disabled:opacity-30 disabled:invisible flex items-center justify-center gap-2">
              <ArrowRight size={20} />
              <span>السابق</span>
            </button>
            {isLast ? (
              <button 
                onClick={() => {
                  if (!allAnswered) {
                    setShowError(true);
                    setTimeout(() => setShowError(false), 3000);
                    return;
                  }
                  handleSubmit();
                }} 
                className={cn("flex-1 px-4 py-3 rounded-full font-bold flex items-center justify-center gap-2 transition-all", allAnswered ? "bg-[var(--success)] text-white hover:shadow-lg hover:-translate-y-1" : "bg-gray-300 text-gray-500 cursor-not-allowed")}
              >
                <span>سلم الإجابات</span>
                <CheckCircle size={20} />
              </button>
            ) : (
              <button onClick={() => setCurrentIndex(prev => prev + 1)} className="flex-1 px-4 py-3 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2">
                <span>التالي</span>
                <ArrowLeft size={20} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-12 border-2 border-[var(--primary)] shadow-2xl text-center space-y-8 animate-in zoom-in duration-300">
          <h2 className="text-3xl font-bold">📊 تقرير الأداء</h2>
          
          <div className="flex justify-around bg-[var(--bg)] p-6 rounded-[var(--radius-md)] border border-[var(--border)] flex-wrap gap-4">
            <div className="flex items-center gap-2 font-bold"><Target size={20} className="text-[var(--primary)]" /> السرعة: {toIndianNumbers(session?.speed || 0)} ك/د</div>
            <div className="flex items-center gap-2 font-bold"><AlertTriangle size={20} className="text-[var(--accent)]" /> الأخطاء: {toIndianNumbers(session?.errors || 0)}</div>
            <div className="flex items-center gap-2 font-bold"><Clock size={20} className="text-[var(--primary)]" /> الزمن: {toIndianNumbers(session?.duration || 0)} ث</div>
          </div>

          <div className="space-y-2">
            <div className="text-6xl">{score >= 85 ? "🏆" : score >= 65 ? "👍" : "💪"}</div>
            <div className="text-5xl font-black text-[var(--primary)]">{toIndianNumbers(score)}%</div>
            <div className="text-[var(--text-light)] font-bold">أجبت صحيحاً على {toIndianNumbers(correctCount)} من {toIndianNumbers(questions.length)}</div>
          </div>

          <div className="flex justify-center gap-4">
            <div className="flex items-center gap-2 text-sm font-bold"><span className="w-4 h-4 rounded-full bg-[var(--success)]"></span> {toIndianNumbers(correctCount)} صحيح</div>
            <div className="flex items-center gap-2 text-sm font-bold"><span className="w-4 h-4 rounded-full bg-[var(--border)]"></span> {toIndianNumbers(questions.length - correctCount)} خطأ</div>
          </div>

          {/* الكلمات التي أخطأ فيها الطالب لإعادة قراءتها وتثبيتها */}
          {session?.errorWords && session.errorWords.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 sm:p-5 text-right space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-amber-900 font-black text-sm">
                  <AlertTriangle size={18} className="text-amber-600" />
                  <span>كلمات تعثر فيها الطالب ({toIndianNumbers(session.errorWords.length)} كلمات)</span>
                </div>
                <button
                  onClick={() => {
                    setPracticeWordIdx(0);
                    setShowPracticeModal(true);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <RotateCcw size={14} />
                  <span>بدء إعادة القراءة والتدريب</span>
                </button>
              </div>
              <p className="text-xs text-gray-600 font-bold">
                اضغط على أي كلمة لإعادة قراءتها في بطاقة تدريبية مكبرة حتى يتقنها الطالب:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {session.errorWords.map((word, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPracticeWordIdx(i);
                      setShowPracticeModal(true);
                    }}
                    className="bg-white hover:bg-red-50 text-red-700 border border-red-200 hover:border-red-300 px-3 py-1 rounded-xl text-xs font-black shadow-2xs transition-all cursor-pointer"
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 pt-8 border-t border-[var(--border)]">
            {session && (session.userId !== user?.uid || profile?.role === "teacher") && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
                <CheckCircle size={20} className="text-emerald-600" />
                <span>تم رصد درجات الفهم والاستيعاب بنجاح للطالب: <strong className="font-black underline">{session.username}</strong></span>
              </div>
            )}
            <button onClick={() => navigate("/")} className="w-full py-4 bg-[var(--primary)] text-white rounded-full font-black text-lg hover:shadow-lg transition-all flex items-center justify-center gap-2">
              <BookOpen size={22} />
              <span>{profile?.role === "teacher" ? "العودة للوحة المعلم لاختيار الطالب التالي" : "نص آخر"}</span>
            </button>
            <button 
              onClick={() => navigate("/reports", { state: { userId: session?.userId, username: session?.username } })} 
              className="w-full py-4 bg-[var(--bg)] text-[var(--text)] rounded-full font-bold border border-[var(--border)] hover:bg-gray-100 transition-all"
            >
              {profile?.role === "teacher" ? `عرض سجل وتقارير الطالب (${session?.username})` : "عرض تقاريري"}
            </button>
          </div>
        </div>
      )}

      {/* نافذة إعادة قراءة الكلمات المتعثرة */}
      {showPracticeModal && session?.errorWords && session.errorWords.length > 0 && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-gray-100 space-y-5 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span className="text-xs font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                تدريب الكلمة {toIndianNumbers(practiceWordIdx + 1)} من {toIndianNumbers(session.errorWords.length)}
              </span>
              <button 
                onClick={() => setShowPracticeModal(false)} 
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-8 bg-amber-50/50 rounded-2xl border border-amber-100">
              <div className="text-4xl sm:text-5xl font-black text-gray-900 select-none tracking-wide font-naskh">
                {session.errorWords[practiceWordIdx]}
              </div>
            </div>

            <p className="text-xs text-gray-500 font-bold">
              اقرأ الكلمة بصوت واضح مع مراعاة الحركات ومخارج الحروف
            </p>

            <div className="flex gap-2">
              <button
                disabled={practiceWordIdx === 0}
                onClick={() => setPracticeWordIdx(p => Math.max(0, p - 1))}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all disabled:opacity-40 cursor-pointer"
              >
                السابق
              </button>
              <button
                onClick={() => {
                  if (practiceWordIdx < session.errorWords.length - 1) {
                    setPracticeWordIdx(p => p + 1);
                  } else {
                    setShowPracticeModal(false);
                    alert("أحسنت! تم تدريب وإعادة قراءة جميع الكلمات المتعثرة بنجاح 🌟");
                  }
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle size={15} />
                <span>{practiceWordIdx < session.errorWords.length - 1 ? "أتقنتها، التالي" : "أتقنت جميع الكلمات ✓"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

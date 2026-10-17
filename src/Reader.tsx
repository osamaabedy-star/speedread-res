import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Lesson, ReaderConfig, ReadingSession } from "./types";
import { cn, toIndianNumbers, formatTime, isGradeMatch, getGradeLabel, normalizeGrade } from "./utils";
import { Play, Pause, Square, Plus, Minus, ZoomIn, ZoomOut, ArrowUpDown, Maximize, AlertCircle, CheckCircle, Loader2, Home, HelpCircle, Zap, Clock, BookOpen, Menu, X, Sliders } from "lucide-react";
import { addDoc, collection, doc, getDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { updateUserStats } from "./stats";
import { motion, AnimatePresence } from "framer-motion";

export default function Reader() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  
  const [config, setConfig] = useState<ReaderConfig | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [speed, setSpeed] = useState(150);
  const [fontSize, setFontSize] = useState(32);
  const [readingMode, setReadingMode] = useState<"static" | "scroll" | "rsvp">("static");
  const [lineHeight, setLineHeight] = useState(1.8);
  const [errorWordIndices, setErrorWordIndices] = useState<number[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiFeedback, setAiFeedback] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const rsvpTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollLastTimestampRef = useRef<number>(0);
  const scrollCurrentYRef = useRef<number>(0);

  useEffect(() => {
    const savedConfig = sessionStorage.getItem("reader_config");
    if (!savedConfig) {
      navigate("/");
      return;
    }
    const parsedConfig: ReaderConfig = JSON.parse(savedConfig);
    setConfig(parsedConfig);
    setReadingMode(parsedConfig.mode || "static");
    setSpeed(parsedConfig.speed);
    setFontSize(parsedConfig.fontSize);

    const loadLesson = async () => {
      try {
        const files = [
          "primary_first.json", "primary_second.json", "upper_first.json", "upper_second.json",
          "lessons_1_2_part1.json",
          "lessons_part1.json", "lessons_part2.json", "lessons_part3.json", "lessons_part4.json", "lessons_part5.json"
        ];
        
        let found = null;
        
        // Try local files first
        for (const file of files) {
          const res = await fetch(`/${file}`);
          const contentType = res.headers.get("content-type");
          if (res.ok && contentType && contentType.includes("application/json")) {
            const data: Lesson[] = await res.json();
            found = data.find(l => l.id === parsedConfig.lessonId);
            if (found) break;
          }
        }
        
        // If not found, try Firestore
        if (!found && user) {
          const docRef = doc(db, "lessons", parsedConfig.lessonId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            found = { id: docSnap.id, ...docSnap.data() } as Lesson;
          }
        }

        if (found) {
          // Check if student belongs to this lesson's grade
          if (profile?.role === "student" && profile?.grade) {
            if (!isGradeMatch(profile.grade, found.grade)) {
              alert(`غير مصرح لك بفتح دروس صف دراسي آخر. صفك المسجل هو: ${getGradeLabel(normalizeGrade(profile.grade) || 1)}`);
              navigate("/");
              return;
            }
          }

          setLesson(found);
          setWords(found.content.trim().split(/\s+/));
        } else {
          console.error("Lesson not found:", parsedConfig.lessonId);
          navigate("/");
        }
      } catch (error) {
        console.error("Failed to load lesson:", error);
      } finally {
        setLoading(false);
      }
    };
    loadLesson();
  }, [navigate, user, profile]);

  const startCountdown = useCallback(() => {
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count--;
      if (count >= 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
        startReading();
      }
    }, 1000);
  }, []);

  const startReading = () => {
    setIsPlaying(true);
    setStartTime(Date.now());
  };

  useEffect(() => {
    if (lesson && !finished) {
      startCountdown();
    }
  }, [lesson, startCountdown]);

  // Timer Effect
  useEffect(() => {
    if (isPlaying && !finished) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, finished]);

  // RSVP Effect (كلمة كلمة)
  useEffect(() => {
    if (readingMode === "rsvp" && isPlaying && !finished) {
      const wordTimeMs = 60000 / speed;
      const currentWord = words[currentIndex] || "";
      let delay = wordTimeMs;
      if (/[.!?،؛:]$/.test(currentWord)) delay *= 1.4;

      rsvpTimerRef.current = setTimeout(() => {
        if (currentIndex < words.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          handleFinish();
        }
      }, delay);
    }
    return () => { if (rsvpTimerRef.current) clearTimeout(rsvpTimerRef.current); };
  }, [isPlaying, currentIndex, speed, words, readingMode, finished]);

  // Scroll Effect (التمرير الانسيابي من الأسفل إلى الأعلى)
  // يبدأ النص بالصعود من أسفل الشاشة، ويبدأ التوقيت فور ظهور أول سطر، وينتهي عند اختفاء آخر سطر من الأعلى
  const scrollContainerHeightRef = useRef<number>(600);
  const scrollHasStartedTimerRef = useRef<boolean>(false);

  const scrollStep = useCallback((timestamp: number) => {
    if (!isPlaying || finished) return;
    if (!scrollLastTimestampRef.current) scrollLastTimestampRef.current = timestamp;
    
    const elapsed = (timestamp - scrollLastTimestampRef.current) / 1000;
    const containerHeight = scrollContainerHeightRef.current || 600;
    const textHeight = scrollRef.current?.offsetHeight || 600;
    
    // إجمالي مسافة الحركة = ارتفاع الحاوية (البداية من أسفل الشاشة تماماً) + ارتفاع كامل النص (حتى يختفي آخر سطر من أعلى الشاشة)
    const totalDistance = containerHeight + textHeight + 60;
    
    // السرعة محسوبة بالثواني بناءً على عدد الكلمات وسرعة القراءة المحددة (كلمة/دقيقة)
    const totalSeconds = Math.max(8, (words.length / Math.max(20, speed)) * 60);
    const pixelsPerSecond = totalDistance / totalSeconds;
    
    scrollCurrentYRef.current -= pixelsPerSecond * elapsed;
    
    if (scrollRef.current) {
      scrollRef.current.style.transform = `translateY(${scrollCurrentYRef.current}px)`;
    }
    
    // التحقق من بدء ظهور أول سطر لتفعيل بدء عد الوقت بدقة
    if (!scrollHasStartedTimerRef.current && scrollCurrentYRef.current <= containerHeight) {
      scrollHasStartedTimerRef.current = true;
    }
    
    scrollLastTimestampRef.current = timestamp;
    
    // ينتهي التمرير وينتهي الوقت فور اختفاء آخر سطر من أعلى الحاوية
    if (scrollCurrentYRef.current > -(textHeight + 40)) {
      scrollRafRef.current = requestAnimationFrame(scrollStep);
    } else {
      handleFinish();
    }
  }, [isPlaying, finished, words.length, speed]);

  useEffect(() => {
    if (readingMode === "scroll" && isPlaying && !finished) {
      // قياس ارتفاع حاوية العرض
      const parentHeight = scrollRef.current?.parentElement?.clientHeight || 600;
      scrollContainerHeightRef.current = parentHeight;

      // إذا كانت هذه بداية القراءة، ضع النص أسفل الشاشة تماماً ليصعد للأعلى
      if (scrollCurrentYRef.current >= 0 || scrollCurrentYRef.current > parentHeight) {
        scrollCurrentYRef.current = parentHeight;
        if (scrollRef.current) {
          scrollRef.current.style.transform = `translateY(${parentHeight}px)`;
        }
      }
      scrollLastTimestampRef.current = 0;
      scrollRafRef.current = requestAnimationFrame(scrollStep);
    } else {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    }
    return () => { if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current); };
  }, [readingMode, isPlaying, finished, scrollStep]);

  const [sessionSaved, setSessionSaved] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const handleFinish = () => {
    setIsPlaying(false);
    setFinished(true);
    setShowStats(true);
  };

  const handleChangeMode = (newMode: "static" | "scroll" | "rsvp") => {
    setIsPlaying(false);
    setReadingMode(newMode);
    setCurrentIndex(0);
    if (scrollRef.current) {
      const parentHeight = scrollRef.current.parentElement?.clientHeight || 600;
      scrollCurrentYRef.current = parentHeight;
      scrollRef.current.style.transform = `translateY(${parentHeight}px)`;
    }
  };

  const handleSaveSession = async () => {
    if (!user || !lesson || sessionSaved) return;
    setSessionSaved(true);

    const wordsRead = readingMode === "scroll" 
      ? Math.round(words.length * Math.min(1, Math.max(0, (-(scrollCurrentYRef.current - 80)) / (scrollRef.current?.offsetHeight || 1)))) 
      : currentIndex + 1;
    const actualErrorWords = errorWordIndices.map(idx => words[idx]);
    
    // Determine which user to save for (self or target student)
    const sessionUserId = config?.teacherMode && config.targetStudentId ? config.targetStudentId : user.uid;
    const sessionUsername = config?.teacherMode && config.targetStudentName ? config.targetStudentName : (profile?.username || user.email || "Unknown");

    const session: ReadingSession = {
      userId: sessionUserId,
      username: sessionUsername,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      date: new Date().toISOString(),
      speed: Math.round(wordsRead / (Math.max(1, elapsedTime) / 60)),
      errors: errorWordIndices.length,
      duration: elapsedTime,
      wordsRead,
      totalWords: words.length,
      completed: wordsRead >= words.length,
      errorWords: actualErrorWords
    };

    try {
      await addDoc(collection(db, "reading_sessions"), session);
      await updateUserStats(sessionUserId, "session", session.speed);
      if (!config?.teacherMode) {
        await refreshProfile();
      }

      // Fetch AI Analysis
      fetch("/api/analyze-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speed: session.speed,
          errors: session.errors,
          lessonTitle: session.lessonTitle,
          textPreview: lesson.content.substring(0, 500)
        })
      }).then(res => res.json()).then(data => setAiFeedback(data.feedback)).catch(e => console.error(e));

      // Use the lesson's own questions exclusively so questions belong strictly to this lesson
      let selectedQuestions: any[] = [];
      if (lesson.questions && lesson.questions.length > 0) {
        selectedQuestions = lesson.questions;
      } else {
        try {
          const poolSnap = await getDocs(query(collection(db, "question_pool"), where("lessonId", "==", lesson.id)));
          selectedQuestions = poolSnap.docs.map(doc => doc.data() as any);
        } catch (e) {
          console.error("Pool fetch failed:", e);
        }
      }

      sessionStorage.setItem("currentReadingSession", JSON.stringify({
        ...session,
        questions: selectedQuestions
      }));
    } catch (error) {
      console.error("Failed to save session:", error);
    }
  };

  const recordError = () => {
    if (!isPlaying || sessionSaved) return;
    if (!errorWordIndices.includes(currentIndex)) {
      setErrorWordIndices(prev => [...prev, currentIndex]);
    }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1500);
  };

  const handleResetTimer = () => {
    setIsPlaying(false);
    setElapsedTime(0);
    setCurrentIndex(0);
    setFinished(false);
    setSessionSaved(false);
    setShowStats(false);
    setErrorWordIndices([]);
    if (scrollRef.current) {
      scrollCurrentYRef.current = 80;
      scrollRef.current.style.transform = `translateY(80px)`;
    }
    startCountdown();
  };

  const toggleWordError = (idx: number) => {
    if (sessionSaved) return;
    setErrorWordIndices(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1500);
  };

  const renderRSVP = () => {
    const word = words[currentIndex] || "";
    const pivotIdx = Math.floor(word.length / 2);
    const before = word.substring(0, pivotIdx);
    const pivot = word[pivotIdx];
    const after = word.substring(pivotIdx + 1);
    return (
      <div style={{ fontFamily: config?.font || "Tajawal", fontSize: `${fontSize + 16}px` }} className="text-center font-black transition-all select-none">
        <span className="text-[var(--text)]">{before}</span>
        <span className="text-amber-500 underline decoration-amber-400 decoration-4">{pivot}</span>
        <span className="text-[var(--text)]">{after}</span>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]"><Loader2 className="animate-spin text-[var(--primary)]" size={48} /></div>;

  return (
    <div className="fixed inset-0 bg-[var(--bg)] text-[var(--text)] flex flex-col overflow-hidden select-none font-tajawal rtl" dir="rtl">
      {/* 1. شريط علوي خفيف ونظيف: عنوان الدرس + مؤقت مصغر + زر فتح القائمة الجانبية */}
      <div className="bg-[var(--panel)]/90 backdrop-blur-md border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(config?.teacherMode ? "/teacher" : "/")} 
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 transition-all cursor-pointer"
            title="العودة"
          >
            <Home size={20} />
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[var(--primary)] leading-tight flex items-center gap-2">
              <span>{lesson?.title}</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-black border border-blue-200">
                {readingMode === "scroll" ? "📜 تمرير انسيابي" : readingMode === "rsvp" ? "⚡ كلمة كلمة" : "📄 نص كامل"}
              </span>
            </h2>
            {config?.targetStudentName && (
              <span className="text-[11px] text-gray-500 font-bold">
                الطالب: <strong className="text-blue-700">{config.targetStudentName}</strong>
              </span>
            )}
          </div>
          <div className={cn("bg-[var(--accent)] text-white px-3 py-1 rounded-full text-xs font-bold shadow-md transition-all duration-300 pointer-events-none flex items-center gap-1.5", showToast ? "opacity-100 scale-100" : "opacity-0 scale-90")}>
            <CheckCircle size={14} />
            <span>تم تسجيل خطأ</span>
          </div>
        </div>

        {/* أزرار سريعة مصغرة في أقصى اليسار: تشغيل/إيقاف + وقت + زر القائمة الجانبية */}
        <div className="flex items-center gap-2">
          {/* مؤشر الوقت */}
          <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--primary)] bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20">
            <Clock size={14} /> 
            <span className="tabular-nums font-mono">{formatTime(elapsedTime)}</span>
          </div>

          {/* زر تشغيل / إيقاف سريع */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={finished}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105",
              isPlaying ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
            )}
            title={isPlaying ? "إيقاف مؤقت" : "بدء القراءة"}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? "إيقاف" : "تشغيل"}</span>
          </button>

          {/* زر إنهاء القراءة */}
          <button
            onClick={handleFinish}
            disabled={finished}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all cursor-pointer"
            title="إنهاء القراءة وعرض النتائج"
          >
            <Square size={16} />
          </button>

          {/* زر فتح القائمة الجانبية لإخفاء كل عناصر التحكم الأخرى عن الشاشة */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            title="فتح لوحة الإعدادات والخيارات"
          >
            <Sliders size={16} />
            <span className="hidden sm:inline">خيارات القراءة</span>
          </button>
        </div>

        {/* شريط التقدم السفلي */}
        <div className="absolute bottom-0 left-0 w-full h-1 bg-[var(--border)]">
          <div className="h-full bg-[var(--primary)] transition-all duration-100" style={{ width: `${(currentIndex / Math.max(1, words.length)) * 100}%` }}></div>
        </div>
      </div>

      {/* Viewport: مساحة العرض التفاعلية حسب النمط المختار */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden" onClick={() => readingMode === "rsvp" && !finished && setIsPlaying(!isPlaying)}>
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center z-[100] bg-[var(--bg)]/70 backdrop-blur-xs">
            <span className="text-9xl font-black text-[var(--primary)] animate-pulse">{countdown === 0 ? "انطلق!" : toIndianNumbers(countdown)}</span>
          </div>
        )}

        {/* النمط 1: كلمة كلمة (RSVP) */}
        {readingMode === "rsvp" && (
          <div className="w-full px-8 flex flex-col items-center justify-center space-y-6">
            <div className="text-xs font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              ⚡ قراءة كلمة كلمة • الكلمة {toIndianNumbers(currentIndex + 1)} من {toIndianNumbers(words.length)}
            </div>
            {renderRSVP()}
            <p className="text-xs text-gray-400 font-bold">
              اضغط على الشاشة للإيقاف أو المتابعة • اضغط "سجل خطأ" عند تعثر الطالب
            </p>
          </div>
        )}

        {/* النمط 2: التمرير الانسيابي (Teleprompter) */}
        {readingMode === "scroll" && (
          <div className="relative w-full h-full overflow-hidden flex flex-col items-center justify-start pt-16">
            <div 
              ref={scrollRef} 
              style={{ fontFamily: config?.font || "Tajawal", fontSize: `${fontSize}px`, lineHeight }} 
              className="w-full max-w-4xl px-8 text-center rtl whitespace-pre-line transition-transform will-change-transform"
            >
              {words.map((w, i) => (
                <span 
                  key={i} 
                  onClick={(e) => { e.stopPropagation(); toggleWordError(i); }} 
                  className={cn(
                    "cursor-pointer hover:bg-blue-100/50 transition-colors mx-1 inline-block rounded", 
                    errorWordIndices.includes(i) && "bg-red-100 border-b-2 border-red-500 text-red-700 font-black"
                  )}
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* النمط 3: نص كامل (Static) */}
        {readingMode === "static" && (
          <div 
            className="w-full max-w-5xl h-[78vh] overflow-y-auto bg-[var(--panel)] rounded-3xl p-8 sm:p-12 shadow-xl border border-[var(--border)] relative" 
            style={{ fontFamily: config?.font || "Tajawal", fontSize: `${fontSize - 4}px`, lineHeight }}
          >
            <div className="sticky top-0 -mt-4 mb-4 pb-2 bg-[var(--panel)]/90 backdrop-blur-xs flex items-center justify-between text-xs font-bold text-gray-500 border-b border-gray-100">
              <span>📄 قراءة كاملة للنص</span>
              <span className="text-blue-600">💡 انقر على أي كلمة يتعثر فيها الطالب لتسجيل خطأ</span>
            </div>
            <div className="text-justify rtl leading-relaxed">
              {words.map((w, i) => (
                <span 
                  key={i} 
                  onClick={() => toggleWordError(i)} 
                  className={cn(
                    "cursor-pointer hover:bg-blue-100 rounded px-0.5 transition-colors inline-block", 
                    errorWordIndices.includes(i) && "bg-red-100 border-b-2 border-red-500 text-red-700 font-black"
                  )}
                >
                  {w}{" "}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Button for RSVP Mode */}
      {readingMode === "rsvp" && !finished && (
        <button onClick={recordError} className="fixed bottom-8 left-8 bg-[var(--accent)] text-white px-8 py-4 rounded-full font-bold shadow-2xl hover:scale-105 transition-all flex items-center gap-3 z-[100] cursor-pointer">
          <AlertCircle size={24} />
          <span>سجل خطأ</span>
        </button>
      )}

      {/* 2. القائمة الجانبية لإعدادات القراءة والشكل والسرعة */}
      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-[150] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-2xs cursor-pointer"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-sm sm:max-w-md bg-white text-gray-900 h-full shadow-2xl border-r border-gray-200 flex flex-col font-tajawal z-10"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-l from-blue-50/50 to-white">
                <div className="flex items-center gap-2.5 text-blue-700">
                  <Sliders size={22} />
                  <div>
                    <h3 className="text-base font-black text-gray-900">إعدادات القراءة</h3>
                    <p className="text-[11px] text-gray-500 font-bold">شكل العرض والسرعة وحجم الخط</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
                {/* 1. شكل القراءة */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen size={14} className="text-blue-600" />
                    <span>شكل القراءة</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleChangeMode("static")}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                        readingMode === "static" ? "bg-blue-50 border-blue-500 text-blue-700 font-black shadow-xs" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <BookOpen size={18} />
                      <span className="text-xs">📄 نص كامل</span>
                    </button>
                    <button
                      onClick={() => handleChangeMode("scroll")}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                        readingMode === "scroll" ? "bg-blue-600 border-blue-600 text-white font-black shadow-md" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <ArrowUpDown size={18} />
                      <span className="text-xs">📜 انسيابي</span>
                    </button>
                    <button
                      onClick={() => handleChangeMode("rsvp")}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                        readingMode === "rsvp" ? "bg-amber-500 border-amber-500 text-white font-black shadow-md" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <Zap size={18} />
                      <span className="text-xs">⚡ كلمة كلمة</span>
                    </button>
                  </div>
                </div>

                {/* 2. سرعة القراءة */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-500" />
                      <span>سرعة القراءة</span>
                    </h4>
                    <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      {toIndianNumbers(speed)} كلمة / دقيقة
                    </span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="400"
                    step="10"
                    value={speed}
                    onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                    <span>٣٠ ك/د</span>
                    <span>١٥٠ ك/د</span>
                    <span>٤٠٠ ك/د</span>
                  </div>
                </div>

                {/* 3. حجم الخط وتباعد الأسطر */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">حجم الخط</h4>
                    <span className="text-xs font-black text-gray-700">{toIndianNumbers(fontSize)} نقطة</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFontSize(s => Math.max(16, s - 4))}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-black text-xs text-gray-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ZoomOut size={16} />
                      <span>تصغير</span>
                    </button>
                    <button
                      onClick={() => setFontSize(s => Math.min(72, s + 4))}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-black text-xs text-gray-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ZoomIn size={16} />
                      <span>تكبير</span>
                    </button>
                  </div>
                </div>

                {/* 4. إعادة ضبط الجلسة */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={handleResetTimer}
                    className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowUpDown size={15} className="rotate-180 text-gray-500" />
                    <span>إعادة ضبط العداد إلى الصفر</span>
                  </button>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle size={16} />
                  <span>تطبيق ومتابعة القراءة</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Finish Modal */}
      {finished && !showStats && (
        <button onClick={() => setShowStats(true)} className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[var(--primary)] text-white px-8 py-4 rounded-full font-bold shadow-2xl z-[150] hover:scale-105 transition-all">
          عرض التقرير وحفظ الجلسة
        </button>
      )}

      {showStats && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[var(--panel)] rounded-[var(--radius-lg)] p-10 max-w-xl w-full text-center border-2 border-[var(--primary)] shadow-2xl space-y-8 animate-in zoom-in duration-300 relative">
            <button onClick={() => setShowStats(false)} className="absolute top-4 right-4 bg-[var(--bg)] text-[var(--text-light)] w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200 transition-all font-bold">✖</button>
            <div className="w-20 h-20 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={48} />
            </div>
            <h2 className="text-3xl font-bold">تقرير القراءة</h2>
            
            <div className="grid grid-cols-3 gap-4 bg-[var(--bg)] p-6 rounded-[var(--radius-md)] border border-[var(--border)]">
              <div className="space-y-1">
                <span className="text-xs text-[var(--text-light)]">السرعة</span>
                <div className="text-xl font-bold text-[var(--primary)]">{toIndianNumbers(Math.round(words.length / (Math.max(1, elapsedTime) / 60)))}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-[var(--text-light)]">الكلمات</span>
                <div className="text-xl font-bold text-[var(--primary)]">{toIndianNumbers(words.length)}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-[var(--text-light)]">الأخطاء</span>
                <div className="text-xl font-bold text-[var(--accent)]">{toIndianNumbers(errorWordIndices.length)}</div>
              </div>
            </div>

            {errorWordIndices.length > 0 && (
              <div className="text-right space-y-2">
                <span className="font-bold text-sm">الكلمات الخاطئة:</span>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-4 bg-[var(--bg)] rounded-2xl border border-[var(--border)]">
                  {errorWordIndices.map((idx, i) => <span key={i} className="bg-[var(--accent)] text-white px-3 py-1 rounded-full text-xs">{words[idx]}</span>)}
                </div>
              </div>
            )}

            {aiFeedback && (
              <div className="bg-[var(--primary)]/5 p-4 rounded-2xl border border-[var(--primary)]/20 animate-in fade-in slide-in-from-top-2 duration-700">
                <div className="flex items-center gap-2 text-[var(--primary)] font-bold mb-1 text-sm">
                  <Zap size={16} />
                  <span>تحليل الذكاء الاصطناعي ✨</span>
                </div>
                <p className="text-right text-xs leading-relaxed italic">{aiFeedback}</p>
              </div>
            )}

            {!sessionSaved ? (
              <div className="block space-y-3">
                <p className="text-xs text-[var(--text-light)] text-center mb-2">يمكنك الآن مراجعة النص في الخلفية وتحديد الأخطاء قبل حفظ التقرير</p>
                <button onClick={handleSaveSession} className="w-full py-4 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2">
                  <span>حفظ وإظهار الأسئلة</span>
                </button>
              </div>
            ) : (
              <div className="flex gap-4 animate-in fade-in zoom-in">
                <button onClick={() => navigate("/quiz")} className="flex-1 py-4 bg-[var(--success)] text-white rounded-full font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2">
                  <HelpCircle size={20} />
                  <span>انتقل إلى الأسئلة</span>
                </button>
                <button onClick={() => navigate("/")} className="flex-1 py-4 bg-[var(--border)] text-[var(--text)] rounded-full font-bold hover:bg-gray-200 transition-all">العودة للرئيسية</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

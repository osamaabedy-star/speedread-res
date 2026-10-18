import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Lesson, ReaderConfig, ReadingSession } from "./types";
import { 
  cn, 
  toIndianNumbers, 
  formatTime, 
  isGradeMatch, 
  getGradeLabel, 
  normalizeGrade,
  ARABIC_FONTS,
  getSavedReaderPreferences,
  saveReaderPreferences,
  getFontFamilyById,
  ReaderPreferences
} from "./utils";
import { 
  Play, 
  Pause, 
  Square, 
  Plus, 
  Minus, 
  ZoomIn, 
  ZoomOut, 
  ArrowUpDown, 
  Maximize, 
  AlertCircle, 
  CheckCircle, 
  Loader2, 
  Home, 
  HelpCircle, 
  Zap, 
  Clock, 
  BookOpen, 
  Menu, 
  X, 
  Sliders,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { addDoc, collection, doc, getDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { updateUserStats } from "./stats";
import { motion, AnimatePresence } from "framer-motion";

export default function Reader() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  
  const initialPrefs = getSavedReaderPreferences();
  const [config, setConfig] = useState<ReaderConfig | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // Persistent Settings
  const [speed, setSpeed] = useState<number>(initialPrefs.speed || 150);
  const [fontSize, setFontSize] = useState<number>(initialPrefs.fontSize || 36);
  const [fontFamilyId, setFontFamilyId] = useState<"madrasa" | "naskh" | "cairo" | "amiri" | "ruqaa">(initialPrefs.fontFamilyId || "madrasa");
  const [readingMode, setReadingMode] = useState<"static" | "scroll" | "rsvp" | "disappearing">(initialPrefs.mode || "static");
  const [lineHeight, setLineHeight] = useState<number>(initialPrefs.lineHeight || 2.0);
  
  const [errorWordIndices, setErrorWordIndices] = useState<number[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiFeedback, setAiFeedback] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showPracticeModal, setShowPracticeModal] = useState(false);
  const [practiceWordIdx, setPracticeWordIdx] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const rsvpTimerRef = useRef<NodeJS.Timeout | null>(null);
  const disappearingTimerRef = useRef<NodeJS.Timeout | null>(null);
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
    if (parsedConfig.mode) {
      setReadingMode(parsedConfig.mode);
      saveReaderPreferences({ mode: parsedConfig.mode });
    }
    if (parsedConfig.speed) {
      setSpeed(parsedConfig.speed);
      saveReaderPreferences({ speed: parsedConfig.speed });
    }
    if (parsedConfig.fontSize) {
      setFontSize(parsedConfig.fontSize);
      saveReaderPreferences({ fontSize: parsedConfig.fontSize });
    }
    if (parsedConfig.fontFamilyId) {
      setFontFamilyId(parsedConfig.fontFamilyId);
      saveReaderPreferences({ fontFamilyId: parsedConfig.fontFamilyId });
    }

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

  // Timer Effect: يستمر احتساب الوقت بشكل طبيعي من لحظة انطلاق القراءة حتى إنهاء الجلسة
  // بحيث لا يتوقف التوقيت عند الإيقاف المؤقت وتكون السرعة حقيقية وواقعية
  useEffect(() => {
    if (startTime !== null && !finished) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTime, finished]);

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

  // Disappearing Effect (ظهور الكلمات بجانب بعض ثم اختفائها)
  useEffect(() => {
    if (readingMode === "disappearing" && isPlaying && !finished) {
      const wordTimeMs = 60000 / speed;
      const currentWord = words[currentIndex] || "";
      let delay = wordTimeMs;
      if (/[.!?،؛:]$/.test(currentWord)) delay *= 1.4;

      disappearingTimerRef.current = setTimeout(() => {
        if (currentIndex < words.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          handleFinish();
        }
      }, delay);
    }
    return () => { if (disappearingTimerRef.current) clearTimeout(disappearingTimerRef.current); };
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

  const handleChangeMode = (newMode: "static" | "scroll" | "rsvp" | "disappearing") => {
    setIsPlaying(false);
    setReadingMode(newMode);
    setCurrentIndex(0);
    saveReaderPreferences({ mode: newMode });
    if (scrollRef.current) {
      const parentHeight = scrollRef.current.parentElement?.clientHeight || 600;
      scrollCurrentYRef.current = parentHeight;
      scrollRef.current.style.transform = `translateY(${parentHeight}px)`;
    }
  };

  const handleUpdateFont = (id: "madrasa" | "naskh" | "cairo" | "amiri" | "ruqaa") => {
    setFontFamilyId(id);
    saveReaderPreferences({ fontFamilyId: id });
  };

  const handleUpdateFontSize = (newSize: number) => {
    setFontSize(newSize);
    saveReaderPreferences({ fontSize: newSize });
  };

  const handleUpdateLineHeight = (newLineHeight: number) => {
    setLineHeight(newLineHeight);
    saveReaderPreferences({ lineHeight: newLineHeight });
  };

  const handleUpdateSpeed = (newSpeed: number) => {
    setSpeed(newSpeed);
    saveReaderPreferences({ speed: newSpeed });
  };

  const renderRSVP = () => {
    const word = words[currentIndex] || "";
    const pivotIdx = Math.floor(word.length / 2);
    const before = word.substring(0, pivotIdx);
    const pivot = word[pivotIdx];
    const after = word.substring(pivotIdx + 1);
    return (
      <div 
        style={{ fontFamily: getFontFamilyById(fontFamilyId), fontSize: `${fontSize + 16}px` }} 
        className="text-center font-black transition-all select-none"
      >
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
                {readingMode === "scroll" ? "📜 تمرير انسيابي" : readingMode === "rsvp" ? "⚡ كلمة كلمة" : readingMode === "disappearing" ? "✨ ظهور واختفاء" : "📄 نص كامل"}
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
          {/* مؤشر الوقت المستمر لحساب السرعة الحقيقية */}
          <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--primary)] bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20" title="الوقت الفعلي المستغرق في القراءة">
            <Clock size={14} /> 
            <span className="tabular-nums font-mono">{formatTime(elapsedTime)}</span>
          </div>

          {/* زر تشغيل / إيقاف سريع */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={finished}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105",
              isPlaying ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
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

          {/* زر فتح القائمة الجانبية للإعدادات */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            title="فتح لوحة الإعدادات والخطوط الافتراضية"
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
      <div 
        className="flex-1 relative flex items-center justify-center overflow-hidden" 
        onClick={() => (readingMode === "rsvp" || readingMode === "disappearing") && !finished && setIsPlaying(!isPlaying)}
      >
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center z-[100] bg-[var(--bg)]/70 backdrop-blur-xs">
            <span className="text-9xl font-black text-[var(--primary)] animate-pulse">{countdown === 0 ? "انطلق!" : toIndianNumbers(countdown)}</span>
          </div>
        )}

        {/* النمط 1: كلمة كلمة (RSVP) */}
        {readingMode === "rsvp" && (
          <div className="w-full px-8 flex flex-col items-center justify-center space-y-6">
            <div className="text-xs font-black text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
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
              style={{ 
                fontFamily: getFontFamilyById(fontFamilyId), 
                fontSize: `${fontSize}px`, 
                lineHeight 
              }} 
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

        {/* النمط 3: نمط الظهور والاختفاء المتتابع (تظهر الكلمات بجانب بعض وتختفي) */}
        {readingMode === "disappearing" && (
          <div className="w-full max-w-4xl px-6 flex flex-col items-center justify-center space-y-6">
            <div className="text-xs font-black text-purple-700 bg-purple-50 px-3.5 py-1 rounded-full border border-purple-200 flex items-center gap-1.5 shadow-2xs">
              <Sparkles size={14} className="text-purple-600" />
              <span>نمط الظهور والاختفاء • الكلمة {toIndianNumbers(currentIndex + 1)} من {toIndianNumbers(words.length)}</span>
            </div>

            {/* بطاقة الكلمات المتتابعة */}
            <div 
              style={{ 
                fontFamily: getFontFamilyById(fontFamilyId), 
                fontSize: `${fontSize + 6}px`, 
                lineHeight 
              }} 
              className="text-center rtl font-black select-none min-h-[140px] flex items-center justify-center flex-wrap gap-x-4 gap-y-3 p-8 bg-white/90 rounded-3xl border border-purple-100 shadow-md max-w-3xl w-full"
            >
              {words.map((w, i) => {
                // تظهر الكلمات بنافذة متحركة: الكلمة الحالية وقبلها بكلمتين، وتختفي الكلمات الأقدم
                const isVisible = i <= currentIndex && i >= Math.max(0, currentIndex - 2);
                if (!isVisible) return null;

                const isCurrent = i === currentIndex;
                const isError = errorWordIndices.includes(i);

                return (
                  <span
                    key={i}
                    onClick={(e) => { e.stopPropagation(); toggleWordError(i); }}
                    className={cn(
                      "cursor-pointer px-3.5 py-1.5 rounded-2xl transition-all inline-block shadow-2xs",
                      isError
                        ? "bg-red-100 text-red-700 border-2 border-red-500 scale-105"
                        : isCurrent
                          ? "bg-purple-600 text-white shadow-md scale-105 ring-2 ring-purple-400"
                          : "bg-purple-50 text-purple-900 border border-purple-200 opacity-75"
                    )}
                  >
                    {w}
                  </span>
                );
              })}
            </div>

            <p className="text-xs text-gray-400 font-bold">
              تظهر الكلمات بجانب بعضها وتختفي لتدريب سرعة الانتقال البصري دون تراجع
            </p>
          </div>
        )}

        {/* النمط 4: نص كامل (Static) */}
        {readingMode === "static" && (
          <div 
            className="w-full max-w-5xl h-[78vh] overflow-y-auto bg-[var(--panel)] rounded-3xl p-8 sm:p-12 shadow-xl border border-[var(--border)] relative" 
            style={{ 
              fontFamily: getFontFamilyById(fontFamilyId), 
              fontSize: `${fontSize - 4}px`, 
              lineHeight 
            }}
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

      {/* زر تسجيل الخطأ السريع لنمط الكلمة كلمة ونمط الظهور والاختفاء */}
      {(readingMode === "rsvp" || readingMode === "disappearing") && !finished && (
        <button 
          onClick={recordError} 
          className="fixed bottom-20 left-8 bg-[var(--accent)] text-white px-6 py-3 rounded-full font-bold shadow-2xl hover:scale-105 transition-all flex items-center gap-2 z-[100] cursor-pointer"
        >
          <AlertCircle size={20} />
          <span>سجل خطأ</span>
        </button>
      )}

      {/* 2. شريط التحكم السريع العائم أثناء القراءة (تسريع، تبطيء، إيقاف، إنهاء) */}
      {!finished && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 backdrop-blur-md border border-gray-200/90 shadow-2xl rounded-2xl px-3.5 py-2 flex items-center gap-2 max-w-[96vw] animate-in slide-in-from-bottom-4 duration-300">
          {/* مؤقت الوقت المستمر لحساب السرعة الحقيقية */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold" title="الوقت مستمر بالعد لضمان دقة السرعة الحقيقية">
            <Clock size={14} className="text-blue-600 animate-spin-slow" />
            <span className="font-mono tabular-nums font-black">{formatTime(elapsedTime)}</span>
            <span className="text-[10px] text-blue-600 font-normal">(مستمر)</span>
          </div>

          {/* تبطيء */}
          <button
            onClick={() => handleUpdateSpeed(Math.max(30, speed - 15))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs"
            title="تبطيء السرعة (-15 ك/د)"
          >
            <Minus size={15} className="text-gray-600" />
            <span>تبطيء</span>
          </button>

          {/* شارة السرعة الحالية */}
          <div className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs font-black tabular-nums shadow-2xs shrink-0 flex items-center gap-1">
            <Zap size={13} className="text-amber-500" />
            <span>{toIndianNumbers(speed)} ك/د</span>
          </div>

          {/* تسريع */}
          <button
            onClick={() => handleUpdateSpeed(Math.min(450, speed + 15))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs"
            title="تسريع القراءة (+15 ك/د)"
          >
            <Plus size={15} className="text-gray-600" />
            <span>تسريع</span>
          </button>

          <div className="h-6 w-px bg-gray-200 mx-1" />

          {/* إيقاف مؤقت / استئناف مع احتساب الوقت بدون توقف بحيث تكون السرعة حقيقية */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black text-white transition-all cursor-pointer shadow-xs active:scale-95",
              isPlaying ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
            )}
            title="عند الإيقاف المؤقت، يتوقف تحرك الكلمات بينما يستمر العداد في الحساب لحساب السرعة الحقيقية"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? "إيقاف مؤقت" : "استئناف"}</span>
          </button>

          {/* إنهاء القراءة */}
          <button
            onClick={handleFinish}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
            title="إنهاء القراءة وعرض النتائج"
          >
            <CheckCircle size={15} />
            <span>إنهاء القراءة</span>
          </button>
        </div>
      )}

      {/* 3. القائمة الجانبية لإعدادات القراءة الافتراضية والشكل والخطوط */}
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
                    <h3 className="text-base font-black text-gray-900">إعدادات القراءة الافتراضية</h3>
                    <p className="text-[11px] text-gray-500 font-bold">تُحفظ تلقائياً ولا تتغير إلا عند تعديلها</p>
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
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleChangeMode("static")}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer",
                        readingMode === "static" ? "bg-blue-50 border-blue-500 text-blue-700 font-black shadow-xs ring-2 ring-blue-400/20" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <BookOpen size={17} />
                      <span className="text-xs font-black">📄 نص كامل</span>
                      <span className="text-[9px] text-gray-400">قراءة شاشة كاملة</span>
                    </button>
                    <button
                      onClick={() => handleChangeMode("scroll")}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer",
                        readingMode === "scroll" ? "bg-blue-600 border-blue-600 text-white font-black shadow-md ring-2 ring-blue-500/20" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <ArrowUpDown size={17} />
                      <span className="text-xs font-black">📜 انسيابي</span>
                      <span className={cn("text-[9px]", readingMode === "scroll" ? "text-blue-100" : "text-gray-400")}>يصعد للأعلى</span>
                    </button>
                    <button
                      onClick={() => handleChangeMode("rsvp")}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer",
                        readingMode === "rsvp" ? "bg-amber-500 border-amber-500 text-white font-black shadow-md ring-2 ring-amber-400/20" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <Zap size={17} />
                      <span className="text-xs font-black">⚡ كلمة كلمة</span>
                      <span className={cn("text-[9px]", readingMode === "rsvp" ? "text-amber-100" : "text-gray-400")}>وميض في المنتصف</span>
                    </button>
                    <button
                      onClick={() => handleChangeMode("disappearing")}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer",
                        readingMode === "disappearing" ? "bg-purple-600 border-purple-600 text-white font-black shadow-md ring-2 ring-purple-400/20" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <Sparkles size={17} />
                      <span className="text-xs font-black">✨ ظهور واختفاء</span>
                      <span className={cn("text-[9px]", readingMode === "disappearing" ? "text-purple-100" : "text-gray-400")}>تظهر الكلمات وتختفي</span>
                    </button>
                  </div>
                </div>

                {/* 2. نوع الخط (نسخ، مدرسي، قاهري، أميري، رقعة) */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">نوع الخط العربي الافتراضي</h4>
                    <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      {ARABIC_FONTS.find(f => f.id === fontFamilyId)?.label || "مدرسي"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ARABIC_FONTS.map(font => {
                      const isSelected = fontFamilyId === font.id;
                      return (
                        <button
                          key={font.id}
                          onClick={() => handleUpdateFont(font.id as any)}
                          className={cn(
                            "p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1",
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-500/20 font-black"
                              : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200 font-bold"
                          )}
                        >
                          <span className="text-xs">{font.label}</span>
                          <span 
                            style={{ fontFamily: font.family }} 
                            className={cn("text-[11px] truncate max-w-full", isSelected ? "text-white" : "text-gray-400")}
                          >
                            رياض الإبداع
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. سرعة القراءة */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-500" />
                      <span>سرعة القراءة الافتراضية</span>
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
                    onChange={(e) => handleUpdateSpeed(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                    <span>٣٠ ك/د</span>
                    <span>١٥٠ ك/د</span>
                    <span>٤٠٠ ك/د</span>
                  </div>
                </div>

                {/* 4. حجم الخط وتباعد الأسطر */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">حجم الخط الافتراضي</h4>
                    <span className="text-xs font-black text-gray-700">{toIndianNumbers(fontSize)} نقطة</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateFontSize(Math.max(16, fontSize - 4))}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-black text-xs text-gray-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ZoomOut size={16} />
                      <span>تصغير (-4)</span>
                    </button>
                    <button
                      onClick={() => handleUpdateFontSize(Math.min(72, fontSize + 4))}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-black text-xs text-gray-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ZoomIn size={16} />
                      <span>تكبير (+4)</span>
                    </button>
                  </div>
                </div>

                {/* 5. تباعد الأسطر */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">تباعد الأسطر</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "عادي", val: 1.8 },
                      { label: "مريح", val: 2.2 },
                      { label: "واسع", val: 2.6 }
                    ].map(lh => (
                      <button
                        key={lh.val}
                        onClick={() => handleUpdateLineHeight(lh.val)}
                        className={cn(
                          "py-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer",
                          lineHeight === lh.val
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs font-black"
                            : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                        )}
                      >
                        {lh.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. إعادة ضبط الجلسة */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={handleResetTimer}
                    className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw size={15} className="text-gray-500" />
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
                  <span>تطبيق وحفظ الإعدادات الافتراضية</span>
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
          <div className="bg-[var(--panel)] rounded-[var(--radius-lg)] p-8 max-w-xl w-full text-center border-2 border-[var(--primary)] shadow-2xl space-y-6 animate-in zoom-in duration-300 relative">
            <button onClick={() => setShowStats(false)} className="absolute top-4 right-4 bg-[var(--bg)] text-[var(--text-light)] w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200 transition-all font-bold">✖</button>
            <div className="w-16 h-16 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={38} />
            </div>
            <h2 className="text-2xl font-black">تقرير القراءة والسرعة</h2>
            
            <div className="grid grid-cols-3 gap-3 bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)]">
              <div className="space-y-1">
                <span className="text-[11px] text-[var(--text-light)] font-bold">السرعة الحقيقية</span>
                <div className="text-lg font-black text-[var(--primary)]">{toIndianNumbers(Math.round(words.length / (Math.max(1, elapsedTime) / 60)))} ك/د</div>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-[var(--text-light)] font-bold">الكلمات</span>
                <div className="text-lg font-black text-[var(--primary)]">{toIndianNumbers(words.length)}</div>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-[var(--text-light)] font-bold">الأخطاء</span>
                <div className="text-lg font-black text-[var(--accent)]">{toIndianNumbers(errorWordIndices.length)}</div>
              </div>
            </div>

            {/* عرض الكلمات المتعثرة وزر إعادة قراءتها */}
            {errorWordIndices.length > 0 && (
              <div className="text-right space-y-2 bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-amber-900">
                    الكلمات التي تعثر فيها الطالب ({toIndianNumbers(errorWordIndices.length)} كلمات):
                  </span>
                  <button
                    onClick={() => {
                      setPracticeWordIdx(0);
                      setShowPracticeModal(true);
                    }}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <RotateCcw size={13} />
                    <span>إعادة قراءة الكلمات</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded-xl border border-amber-100">
                  {errorWordIndices.map((idx, i) => (
                    <span 
                      key={i} 
                      onClick={() => {
                        setPracticeWordIdx(i);
                        setShowPracticeModal(true);
                      }}
                      className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-2.5 py-0.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
                    >
                      {words[idx]}
                    </span>
                  ))}
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
                <p className="text-xs text-[var(--text-light)] text-center mb-1">يمكنك الآن مراجعة النص في الخلفية وتحديد الأخطاء قبل حفظ التقرير</p>
                <button onClick={handleSaveSession} className="w-full py-3.5 bg-[var(--primary)] text-white rounded-2xl font-black text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <span>حفظ وإظهار الأسئلة</span>
                </button>
              </div>
            ) : (
              <div className="flex gap-3 animate-in fade-in zoom-in">
                <button onClick={() => navigate("/quiz")} className="flex-1 py-3.5 bg-[var(--success)] text-white rounded-2xl font-black text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <HelpCircle size={18} />
                  <span>انتقل إلى الأسئلة</span>
                </button>
                <button onClick={() => navigate("/")} className="flex-1 py-3.5 bg-[var(--border)] text-[var(--text)] rounded-2xl font-bold hover:bg-gray-200 transition-all cursor-pointer">العودة للرئيسية</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* نافذة إعادة قراءة الكلمات المتعثرة */}
      {showPracticeModal && errorWordIndices.length > 0 && (
        <div className="fixed inset-0 z-[220] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-gray-100 space-y-5 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span className="text-xs font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                تدريب الكلمة {toIndianNumbers(practiceWordIdx + 1)} من {toIndianNumbers(errorWordIndices.length)}
              </span>
              <button 
                onClick={() => setShowPracticeModal(false)} 
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-8 bg-amber-50/50 rounded-2xl border border-amber-100">
              <div 
                style={{ fontFamily: getFontFamilyById(fontFamilyId) }}
                className="text-4xl sm:text-5xl font-black text-gray-900 select-none tracking-wide"
              >
                {words[errorWordIndices[practiceWordIdx]]}
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
                  if (practiceWordIdx < errorWordIndices.length - 1) {
                    setPracticeWordIdx(p => p + 1);
                  } else {
                    setShowPracticeModal(false);
                    alert("أحسنت! تم تدريب وإعادة قراءة جميع الكلمات المتعثرة بنجاح 🌟");
                  }
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle size={15} />
                <span>{practiceWordIdx < errorWordIndices.length - 1 ? "أتقنتها، التالي" : "أتقنت جميع الكلمات ✓"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Lesson } from "./types";
import { cn, toIndianNumbers } from "./utils";
import { 
  Play, 
  Pause, 
  Plus, 
  Minus, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  ArrowLeft, 
  Layout, 
  Type,
  MousePointer2,
  Eye,
  Settings,
  BookOpen,
  X,
  Search,
  Zap,
  ArrowUpDown,
  Sliders,
  Check,
  FileText,
  Menu,
  PanelRightOpen,
  PanelRightClose,
  RotateCcw
} from "lucide-react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { motion, AnimatePresence } from "framer-motion";

export default function Whiteboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(64);
  const [lineHeight, setLineHeight] = useState(2);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [highlightedIndices, setHighlightedIndices] = useState<number[]>([]);
  const [laserPointer, setLaserPointer] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [speed, setSpeed] = useState(120);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLessonPicker, setShowLessonPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Sidebar state for clean uncluttered presentation
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSpeedDialog, setShowSpeedDialog] = useState(false);
  const [whiteboardMode, setWhiteboardMode] = useState<"standard" | "scroll">("standard");
  const [showCustomTextModal, setShowCustomTextModal] = useState(false);
  const [customTextDraft, setCustomTextDraft] = useState("");
  const [customTitleDraft, setCustomTitleDraft] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Smooth scroll refs for Whiteboard
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollLastTimestampRef = useRef<number>(0);
  const scrollCurrentYRef = useRef<number>(0);
  const scrollContainerHeightRef = useRef<number>(600);

  // Load all lessons once for picker and fallback
  useEffect(() => {
    const fetchAllLessons = async () => {
      try {
        const files = [
          "primary_first.json", "primary_second.json", "upper_first.json", "upper_second.json",
          "lessons_1_2_part1.json",
          "lessons_part1.json", "lessons_part2.json", "lessons_part3.json", "lessons_part4.json", "lessons_part5.json"
        ];
        let loaded: Lesson[] = [];
        for (const file of files) {
          try {
            const res = await fetch(`/${file}`);
            if (res.ok) {
              const data: Lesson[] = await res.json();
              loaded = [...loaded, ...data];
            }
          } catch (e) {
            // ignore individual file load failure
          }
        }

        // Firestore lessons
        try {
          const snap = await getDocs(collection(db, "lessons"));
          const custom = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson));
          loaded = [...custom, ...loaded];
        } catch (e) {
          // ignore firestore fetch error
        }

        // Deduplicate
        const unique = Array.from(new Map(loaded.map(l => [l.id, l])).values());
        setAllLessons(unique);

        const currentLessonId = sessionStorage.getItem("whiteboard_lesson_id");
        if (currentLessonId) {
          const found = unique.find(l => l.id === currentLessonId);
          if (found) {
            setLesson(found);
            setWords(found.content.trim().split(/\s+/));
          } else if (unique.length > 0) {
            setLesson(unique[0]);
            setWords(unique[0].content.trim().split(/\s+/));
          } else {
            setShowLessonPicker(true);
          }
        } else if (unique.length > 0) {
          setLesson(unique[0]);
          setWords(unique[0].content.trim().split(/\s+/));
        } else {
          setShowLessonPicker(true);
        }
      } catch (error) {
        console.error("Failed to load lessons for whiteboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllLessons();
  }, []);

  const selectLesson = (l: Lesson) => {
    setLesson(l);
    setWords(l.content.trim().split(/\s+/));
    sessionStorage.setItem("whiteboard_lesson_id", l.id);
    setShowLessonPicker(false);
    setCurrentIndex(0);
    setIsPlaying(false);
    setHighlightedIndices([]);
  };

  const handleApplyCustomText = () => {
    if (!customTextDraft.trim()) return;
    const customLesson: Lesson = {
      id: "custom_" + Date.now(),
      title: customTitleDraft.trim() || "نص مختار للسبورة",
      content: customTextDraft.trim(),
      grade: "محدد من المعلم",
      semester: "نص تفاعلي حر",
      questions: []
    };
    selectLesson(customLesson);
    setShowCustomTextModal(false);
    setCustomTextDraft("");
    setCustomTitleDraft("");
  };

  // Word-by-word timer when in standard mode
  useEffect(() => {
    if (isPlaying && whiteboardMode === "standard") {
      const delay = (60000 / speed);
      timerRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev < words.length - 1) return prev + 1;
          setIsPlaying(false);
          return prev;
        });
      }, delay);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, speed, words.length, whiteboardMode]);

  // Smooth scroll step for Whiteboard when in scroll mode
  const scrollStep = useCallback((timestamp: number) => {
    if (!isPlaying || whiteboardMode !== "scroll") return;
    if (!scrollLastTimestampRef.current) scrollLastTimestampRef.current = timestamp;

    const elapsed = (timestamp - scrollLastTimestampRef.current) / 1000;
    const containerHeight = scrollContainerHeightRef.current || 600;
    const textHeight = scrollRef.current?.offsetHeight || 600;

    const totalDistance = containerHeight + textHeight + 60;
    const totalSeconds = Math.max(8, (words.length / Math.max(20, speed)) * 60);
    const pixelsPerSecond = totalDistance / totalSeconds;

    scrollCurrentYRef.current -= pixelsPerSecond * elapsed;

    if (scrollRef.current) {
      scrollRef.current.style.transform = `translateY(${scrollCurrentYRef.current}px)`;
    }

    scrollLastTimestampRef.current = timestamp;

    if (scrollCurrentYRef.current > -(textHeight + 40)) {
      scrollRafRef.current = requestAnimationFrame(scrollStep);
    } else {
      setIsPlaying(false);
    }
  }, [isPlaying, whiteboardMode, words.length, speed]);

  useEffect(() => {
    if (whiteboardMode === "scroll" && isPlaying) {
      const parentHeight = scrollRef.current?.parentElement?.clientHeight || 600;
      scrollContainerHeightRef.current = parentHeight;

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
  }, [whiteboardMode, isPlaying, scrollStep]);

  // Request speed confirmation before starting if not already playing
  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setShowSpeedDialog(true);
    }
  };

  const handleConfirmStartWithSpeed = (confirmedSpeed: number) => {
    setSpeed(confirmedSpeed);
    setShowSpeedDialog(false);
    setIsPlaying(true);
  };

  const toggleHighlight = (idx: number) => {
    if (laserPointer) {
      setHighlightedIndices(prev => 
        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      );
    }
  };

  const filteredPickerLessons = allLessons.filter(l => 
    !pickerSearch || l.title.toLowerCase().includes(pickerSearch.toLowerCase()) || l.grade.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white font-amiri rtl" dir="rtl">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-500 font-bold">جاري تجهيز السبورة الذكية...</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-white text-black flex flex-col overflow-hidden select-none font-amiri rtl" dir="rtl">
      {/* 1. زر فتح القائمة الجانبية المدمج والأنيق في أعلى الشاشة (يظهر دوماً ولا يحجب النص) */}
      <div className="fixed top-4 right-4 z-[100] flex items-center gap-2">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="bg-white/90 hover:bg-white text-gray-800 backdrop-blur-md p-2.5 rounded-2xl shadow-lg border border-gray-200 transition-all flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
          title="فتح لوحة التحكم واختيار النصوص"
        >
          <Menu size={20} className="text-blue-600" />
          <span className="text-xs font-black hidden sm:inline">خيارات العرض والنصوص</span>
        </button>

        {/* زر تشغيل / إيقاف سريع عائم بجانب القائمة */}
        <button
          onClick={handleTogglePlay}
          className={cn(
            "p-2.5 rounded-2xl text-white shadow-lg transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95",
            isPlaying ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
          )}
          title={isPlaying ? "إيقاف مؤقت" : "بدء القراءة"}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          <span className="text-xs font-black">{isPlaying ? "إيقاف" : "تشغيل"}</span>
        </button>

        {/* مؤشر السرعة الصغير */}
        <button
          onClick={() => setShowSpeedDialog(true)}
          className="bg-white/90 hover:bg-white text-amber-800 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg border border-amber-200 text-xs font-black flex items-center gap-1 cursor-pointer transition-all"
          title="تغيير السرعة"
        >
          <Zap size={14} className="text-amber-500" />
          <span>{toIndianNumbers(speed)} ك/د</span>
        </button>
      </div>

      {/* زر العودة للرئيسية في أعلى اليسار */}
      <div className="fixed top-4 left-4 z-[100]">
        <button
          onClick={() => navigate("/")}
          className="bg-white/90 hover:bg-white text-gray-700 backdrop-blur-md p-2.5 rounded-2xl shadow-lg border border-gray-200 transition-all cursor-pointer hover:scale-105"
          title="العودة للصفحة الرئيسية"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* عنوان الدرس المختار (يظهر بشكل خافت ورقيق في الأعلى دون حجب مساحة القراءة) */}
      {lesson && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-center opacity-70 hover:opacity-100 transition-opacity">
          <span className="bg-white/70 backdrop-blur-xs px-4 py-1 rounded-full text-xs font-black text-gray-600 border border-gray-200 shadow-2xs">
            {lesson.title} {lesson.grade ? `(${lesson.grade})` : ""}
          </span>
        </div>
      )}

      {/* 2. مساحة العرض الرئيسية الاحترافية: شاشة كاملة فارغة بدون أي زحمة أزرار */}
      <div 
        ref={containerRef}
        className={cn(
          "flex-1 relative overflow-hidden transition-all duration-500 flex flex-col items-center justify-center cursor-default",
          focusMode ? "bg-gray-950" : "bg-white"
        )}
      >
        {/* نمط 1: التمرير الانسيابي (يصعد النص من الأسفل إلى الأعلى بالسرعة المحددة) */}
        {whiteboardMode === "scroll" ? (
          <div className="relative w-full h-full overflow-hidden flex flex-col items-center justify-start pt-16">
            <div 
              ref={scrollRef} 
              style={{ 
                fontSize: `${fontSize}px`, 
                lineHeight: lineHeight,
                fontFamily: "'Amiri', serif"
              }} 
              className={cn(
                "w-full max-w-5xl px-8 text-center rtl whitespace-pre-line will-change-transform select-none leading-relaxed",
                focusMode ? "text-white" : "text-black"
              )}
            >
              {words.map((word, i) => (
                <span 
                  key={i} 
                  onClick={(e) => { e.stopPropagation(); toggleHighlight(i); }} 
                  className={cn(
                    "inline-block px-1.5 mx-0.5 rounded-xl transition-all cursor-pointer",
                    highlightedIndices.includes(i) && "bg-yellow-300 text-black shadow-lg scale-110",
                    i === currentIndex && isPlaying && "bg-blue-100 text-blue-900 font-black"
                  )}
                >
                  {word}{" "}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* نمط 2: العرض العادي للنص على كامل الشاشة دون اقتطاع */
          <div className="w-full h-full overflow-y-auto p-8 sm:p-16">
            <div 
              className={cn(
                "max-w-6xl mx-auto text-center transition-all duration-700 py-8",
                focusMode ? "text-white/20" : "text-black"
              )}
              style={{ 
                fontSize: `${fontSize}px`, 
                lineHeight: lineHeight,
                fontFamily: "'Amiri', serif"
              }}
            >
              {words.map((word, i) => (
                <span 
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHighlight(i);
                  }}
                  className={cn(
                    "inline-block px-2 rounded-xl transition-all duration-300 cursor-pointer",
                    highlightedIndices.includes(i) && "bg-yellow-300 text-black shadow-lg scale-110",
                    focusMode && i === currentIndex && "text-white scale-110 opacity-100 font-black",
                    focusMode && i !== currentIndex && "opacity-20",
                    !focusMode && i === currentIndex && isPlaying && "bg-blue-100 text-blue-800 font-bold"
                  )}
                >
                  {word}{" "}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. القائمة الجانبية الشاملة (Sidebar): تحتوي على جميع الأزرار والخيارات دون تشويش على النص */}
      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-[150] flex justify-end">
            {/* خلفية شبه شفافة عند فتح القائمة الجانبية */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-2xs cursor-pointer"
            />

            {/* محتوى القائمة الجانبية المنبثقة من اليمين */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-sm sm:max-w-md bg-white h-full shadow-2xl border-r border-gray-200 flex flex-col font-tajawal z-10"
            >
              {/* ترويسة القائمة الجانبية */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-l from-blue-50/50 to-white">
                <div className="flex items-center gap-2.5 text-blue-700">
                  <Sliders size={22} />
                  <div>
                    <h3 className="text-base font-black text-gray-900">لوحة تحكم السبورة</h3>
                    <p className="text-[11px] text-gray-500 font-bold">خيارات النصوص والخط والعرض</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                  title="إغلاق القائمة"
                >
                  <X size={20} />
                </button>
              </div>

              {/* عناصر القائمة الجانبية المنظمة */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
                
                {/* القسم الأول: اختيار النصوص */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen size={14} className="text-blue-600" />
                    <span>النصوص والدروس</span>
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setShowLessonPicker(true); setIsSidebarOpen(false); }}
                      className="p-3 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-2xl border border-blue-200 font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                    >
                      <BookOpen size={20} className="text-blue-600" />
                      <span>اختيار درس من المنهج</span>
                    </button>

                    <button
                      onClick={() => { setShowCustomTextModal(true); setIsSidebarOpen(false); }}
                      className="p-3 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-2xl border border-purple-200 font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                    >
                      <FileText size={20} className="text-purple-600" />
                      <span>كتابة أو لصق نص حر</span>
                    </button>
                  </div>

                  {lesson && (
                    <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs">
                      <span className="text-gray-500 font-bold">النص الحالي: </span>
                      <strong className="text-gray-900 font-black">{lesson.title}</strong>
                      <div className="text-[10px] text-gray-400 mt-0.5">{words.length} كلمة</div>
                    </div>
                  )}
                </div>

                {/* القسم الثاني: طريقة وشكل العرض */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layout size={14} className="text-emerald-600" />
                    <span>شكل العرض والانسياب</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setWhiteboardMode("standard"); setIsPlaying(false); }}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                        whiteboardMode === "standard"
                          ? "bg-blue-600 text-white border-blue-600 shadow-md font-black"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <Type size={18} />
                      <span className="text-xs">عرض ثابت عادي</span>
                    </button>

                    <button
                      onClick={() => { setWhiteboardMode("scroll"); setIsPlaying(false); }}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                        whiteboardMode === "scroll"
                          ? "bg-blue-600 text-white border-blue-600 shadow-md font-black"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 font-bold"
                      )}
                    >
                      <ArrowUpDown size={18} />
                      <span className="text-xs">تمرير انسيابي متصاعد</span>
                    </button>
                  </div>
                </div>

                {/* القسم الثالث: ضبط السرعة والتشغيل */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-500" />
                      <span>سرعة القراءة</span>
                    </h4>
                    <span className="text-xs font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      {toIndianNumbers(speed)} ك/د
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

                {/* القسم الرابع: حجم الخط ومظهر النص */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Type size={14} className="text-indigo-600" />
                      <span>حجم الخط</span>
                    </h4>
                    <span className="text-xs font-black text-gray-700">
                      {toIndianNumbers(fontSize)} نقطة
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFontSize(s => Math.max(24, s - 6))}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-black text-xs text-gray-700 transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <ZoomOut size={16} />
                      <span>تصغير</span>
                    </button>

                    <button
                      onClick={() => setFontSize(s => Math.min(160, s + 6))}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-black text-xs text-gray-700 transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <ZoomIn size={16} />
                      <span>تكبير</span>
                    </button>
                  </div>
                </div>

                {/* القسم الخامس: أدوات الشرح والتفاعل */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <MousePointer2 size={14} className="text-rose-500" />
                    <span>أدوات الشرح للمعلم</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFocusMode(!focusMode)}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        focusMode ? "bg-yellow-400 text-black border-yellow-500 shadow-xs" : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      )}
                    >
                      <Eye size={16} />
                      <span>وضع التركيز الداكن</span>
                    </button>

                    <button
                      onClick={() => setLaserPointer(!laserPointer)}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        laserPointer ? "bg-rose-500 text-white border-rose-500 shadow-xs" : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      )}
                    >
                      <MousePointer2 size={16} />
                      <span>تأشير الكلمات</span>
                    </button>
                  </div>

                  {highlightedIndices.length > 0 && (
                    <button
                      onClick={() => setHighlightedIndices([])}
                      className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      <span>مسح جميع الكلمات المظللة</span>
                    </button>
                  )}
                </div>

              </div>

              {/* أسفل القائمة: زر البدء والإغلاق */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check size={16} />
                  <span>تطبيق وإغلاق القائمة</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة اختيار وتأكيد السرعة قبل البدء */}
      <AnimatePresence>
        {showSpeedDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[220] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 text-center font-tajawal"
            >
              <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Zap size={28} />
              </div>

              <div>
                <h3 className="text-xl font-black text-gray-900">اختيار سرعة القراءة قبل البدء</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">
                  حدد السرعة المناسبة للطلاب (كلمة في الدقيقة) قبل تشغيل السبورة
                </p>
              </div>

              {/* مؤشر السرعة الحالي بالأرقام الهندية */}
              <div className="bg-amber-50 border border-amber-200 py-3 rounded-2xl">
                <span className="text-3xl font-black text-amber-800">{toIndianNumbers(speed)}</span>
                <span className="text-xs font-bold text-amber-600 mr-2">كلمة / دقيقة</span>
              </div>

              {/* أزرار سرعات سريعة جاهزة */}
              <div className="grid grid-cols-4 gap-2">
                {[60, 90, 120, 150, 180, 200, 250, 300].map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      "py-2 rounded-xl text-xs font-black transition-all border cursor-pointer",
                      speed === s 
                        ? "bg-amber-500 text-white border-amber-500 shadow-xs" 
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    {toIndianNumbers(s)}
                  </button>
                ))}
              </div>

              {/* شريط السحب لضبط أدق */}
              <div className="space-y-1.5 px-2">
                <input 
                  type="range" 
                  min="30" 
                  max="400" 
                  step="5" 
                  value={speed} 
                  onChange={(e) => setSpeed(parseInt(e.target.value, 10))} 
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                  <span>بطيء (٣٠)</span>
                  <span>متوسط (١٥٠)</span>
                  <span>سريع (٤٠٠)</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowSpeedDialog(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => handleConfirmStartWithSpeed(speed)}
                  className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Play size={16} />
                  <span>تأكيد والبدء الآن</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة إدخال / لصق نص مخصص للسبورة */}
      <AnimatePresence>
        {showCustomTextModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[220] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4 font-tajawal text-right"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 text-purple-700">
                  <FileText size={20} />
                  <h3 className="text-base font-black text-gray-900">عرض نص مخصص على السبورة</h3>
                </div>
                <button 
                  onClick={() => setShowCustomTextModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">عنوان النص (اختياري):</label>
                  <input
                    type="text"
                    value={customTitleDraft}
                    onChange={(e) => setCustomTitleDraft(e.target.value)}
                    placeholder="مثال: قصة الأسبوع، نص تدريبي..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold outline-none focus:border-purple-500 bg-gray-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">ألصق أو اكتب النص هنا:</label>
                  <textarea
                    rows={6}
                    value={customTextDraft}
                    onChange={(e) => setCustomTextDraft(e.target.value)}
                    placeholder="اكتب أو الصق نص القراءة الذي ترغب في عرضه أمام الطلاب على السبورة..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-normal outline-none focus:border-purple-500 bg-gray-50 focus:bg-white leading-relaxed resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => setShowCustomTextModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleApplyCustomText}
                  disabled={!customTextDraft.trim()}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check size={14} />
                  <span>عرض النص على السبورة</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lesson Selector Modal */}
      <AnimatePresence>
        {showLessonPicker && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100 font-tajawal"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900">اختيار درس للعرض على السبورة</h3>
                  <p className="text-xs text-gray-400 font-bold mt-1">اختر النص الذي ترغب بعرضه أمام الطلاب في الفصل</p>
                </div>
                <button 
                  onClick={() => setShowLessonPicker(false)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="relative">
                  <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="ابحث عن عنوان الدرس أو الصف..."
                    className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-blue-500 font-bold"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredPickerLessons.length === 0 ? (
                  <p className="text-center py-12 text-gray-400 font-bold text-sm">لا توجد دروس مطابقة للبحث</p>
                ) : (
                  filteredPickerLessons.map(l => (
                    <button
                      key={l.id}
                      onClick={() => selectLesson(l)}
                      className={cn(
                        "w-full p-4 rounded-2xl border transition-all text-right flex items-center justify-between cursor-pointer",
                        lesson?.id === l.id ? "bg-blue-50 border-blue-500 shadow-sm" : "bg-white border-gray-100 hover:border-blue-200 hover:bg-gray-50/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                          lesson?.id === l.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
                        )}>
                          <BookOpen size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-sm">{l.title}</div>
                          <div className="text-[11px] text-gray-400 font-bold mt-0.5">{l.grade} • {l.semester}</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                        عرض الدرس ←
                      </span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

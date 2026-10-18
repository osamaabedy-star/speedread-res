import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Lesson, ReaderConfig, UserProfile } from "./types";
import { cn, toIndianNumbers, isGradeMatch, getGradeLabel, normalizeGrade, getSavedReaderPreferences, saveReaderPreferences, ARABIC_FONTS, getFontFamilyById } from "./utils";
import { motion, AnimatePresence } from "motion/react";
import { Sliders, Book, Search, Play, Zap, Scroll, BookOpen, Calendar, CalendarCheck, ChevronRight, FileText, Lock, ChartLine, User, Camera, Loader2, Save, X, Trophy, Star, TrendingUp, Flame, Crown, Award, Sparkles } from "lucide-react";
import { collection, doc, updateDoc, getDocs, orderBy, query, onSnapshot, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updatePassword } from "firebase/auth";
import { db, storage, auth } from "./firebase";
import { BADGES, Badge } from "./stats";

const getBadgeIcon = (iconName: string, isUnlocked: boolean) => {
  const props = {
    className: cn("w-6 h-6", isUnlocked ? "text-orange-600" : "text-gray-400"),
    size: 24
  };
  switch (iconName) {
    case "BookOpen": return <BookOpen {...props} />;
    case "Star": return <Star {...props} />;
    case "Trophy": return <Trophy {...props} />;
    case "CalendarCheck": return <CalendarCheck {...props} />;
    case "Flame": return <Flame {...props} />;
    case "Zap": return <Zap {...props} />;
    case "Crown": return <Crown {...props} />;
    default: return <Award {...props} />;
  }
};

export default function Dashboard() {
  const { profile, refreshProfile, user } = useAuth();
  const navigate = useNavigate();
  
  const savedPrefs = getSavedReaderPreferences();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [fontFamilyId, setFontFamilyId] = useState<"madrasa" | "naskh" | "cairo" | "amiri" | "ruqaa">(savedPrefs.fontFamilyId || "madrasa");
  const [font, setFont] = useState(getFontFamilyById(savedPrefs.fontFamilyId));
  const [mode, setMode] = useState<"rsvp" | "scroll" | "static" | "disappearing">(savedPrefs.mode || "static");
  const [speed, setSpeed] = useState(savedPrefs.speed || 150);
  const [grade, setGrade] = useState<string | null>(profile?.grade || "1");
  const [semester, setSemester] = useState<string>("الفصل الدراسي الأول");
  const [fontSize, setFontSize] = useState(savedPrefs.fontSize || 36);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [studentAssignment, setStudentAssignment] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Profile Edit State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGrade, setEditGrade] = useState(profile?.grade || "");
  const [editSemester, setEditSemester] = useState(profile?.semester || "");
  const [editSection, setEditSection] = useState(profile?.section || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isFirstLogin = profile?.needsPasswordChange || !profile?.fullName;
  const isElevated = profile?.role === "teacher" || profile?.role === "supervisor" || profile?.role === "general_supervisor";

  useEffect(() => {
    if (profile && isFirstLogin && !showProfileModal) {
      setShowProfileModal(true);
    }
    if (profile) {
      const names = profile.fullName?.split(" ") || ["", ""];
      setEditFirstName(names[0] || "");
      setEditLastName(names.slice(1).join(" ") || "");
      setEditGrade(profile.grade || "");
      setEditSemester(profile.semester || "");
      setEditSection(profile.section || "");
    }
  }, [profile]);

  useEffect(() => {
    const loadLessons = async () => {
      const files = [
        "primary_first.json", "primary_second.json", "upper_first.json", "upper_second.json",
        "lessons_part1.json", "lessons_part2.json", "lessons_part3.json", "lessons_part4.json", "lessons_part5.json"
      ];
      let allLessons: Lesson[] = [];
      try {
        // Load default lessons from JSON
        for (const file of files) {
          const res = await fetch(`/${file}`);
          const contentType = res.headers.get("content-type");
          if (res.ok && contentType && contentType.includes("application/json")) {
            const data = await res.json();
            allLessons = [...allLessons, ...data];
          }
        }

        // Load custom lessons from Firestore only if user is logged in
        if (user) {
          const customLessonsSnap = await getDocs(query(collection(db, "lessons"), orderBy("createdAt", "desc")));
          const customLessons = customLessonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson));
          allLessons = [...customLessons, ...allLessons];
        }
        
        setLessons(allLessons);
        if (profile?.semester) {
          setSemester(profile.semester);
        }
      } catch (error) {
        console.error("Failed to load lessons:", error);
      } finally {
        setLoading(false);
      }
    };
    loadLessons();
  }, [profile, user]);

  useEffect(() => {
    if (!profile || profile.role !== "student") return;
    
    const classKey = `${profile.grade}-${profile.section}`;
    const checkSession = async () => {
      try {
        const sessionSnap = await getDocs(query(collection(db, "class_sessions")));
        const session = sessionSnap.docs.find(doc => doc.id === classKey);
        if (session) {
          setActiveSession({ id: session.id, ...session.data() });
        } else {
          setActiveSession(null);
        }
      } catch (error) {
        console.error("Failed to check session:", error);
      }
    };
    
    checkSession();
    const interval = setInterval(checkSession, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== "student" || !user) return;
    
    const unsub = onSnapshot(doc(db, "student_assignments", user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setStudentAssignment({ id: snapshot.id, ...snapshot.data() });
      } else {
        setStudentAssignment(null);
      }
    });
    
    return () => unsub();
  }, [profile, user]);

  const filteredLessons = lessons.filter(l => {
    // If student, strictly match student's registered grade
    const effectiveGrade = (profile?.role === "student" && profile?.grade)
      ? profile.grade
      : grade;

    const gradeMatch = !effectiveGrade || isGradeMatch(effectiveGrade, l.grade);
    
    // Semester matching: If lesson has no semester field, show it in Semester 1 by default
    const semesterMatch = !l.semester || l.semester === semester || (semester === "الفصل الدراسي الأول" && !l.semester);
    
    const searchMatch = !searchTerm || l.title.toLowerCase().includes(searchTerm.toLowerCase());
    
    return gradeMatch && semesterMatch && searchMatch;
  });

  const handleLaunch = () => {
    if (!selectedLessonId) return;
    const selectedLesson = lessons.find(l => l.id === selectedLessonId);
    
    // Check grade authorization for students
    if (profile?.role === "student" && profile?.grade && selectedLesson) {
      if (!isGradeMatch(profile.grade, selectedLesson.grade)) {
        alert(`غير مسموح بفتح دروس صف دراسي آخر. صفك المسجل هو: ${getGradeLabel(normalizeGrade(profile.grade) || 1)}`);
        return;
      }
    }

    saveReaderPreferences({
      speed,
      mode,
      fontFamilyId,
      fontSize
    });

    const config: ReaderConfig = {
      lessonId: selectedLessonId,
      speed,
      mode,
      font: getFontFamilyById(fontFamilyId),
      fontFamilyId,
      theme: localStorage.getItem("theme") || "light",
      fontSize
    };
    sessionStorage.setItem("reader_config", JSON.stringify(config));
    navigate("/read");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `profiles/${profile.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "users", profile.uid), { photoURL: url });
      await refreshProfile();
      alert("تم تحديث الصورة بنجاح");
    } catch (error) {
      console.error("Upload failed:", error);
      alert("فشل رفع الصورة");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user) return;
    
    if (newPassword && newPassword !== confirmPassword) {
      alert("كلمات المرور غير متطابقة");
      return;
    }

    setSaving(true);
    try {
      // Update Password if provided
      if (newPassword) {
        await updatePassword(user, newPassword);
      }

      // Update Profile in Firestore (students cannot modify their own grade/section)
      const updatePayload: any = {
        fullName: `${editFirstName} ${editLastName}`.trim(),
        needsPasswordChange: false // Mark as completed
      };

      if (profile.role !== "student") {
        updatePayload.grade = editGrade;
        updatePayload.semester = editSemester;
        updatePayload.section = editSection;
      }

      await updateDoc(doc(db, "users", profile.uid), updatePayload);

      await refreshProfile();
      setShowProfileModal(false);
      alert("تم تحديث البيانات بنجاح");
    } catch (error: any) {
      console.error("Update failed:", error);
      if (error.code === "auth/requires-recent-login") {
        alert("يرجى تسجيل الخروج ثم الدخول مرة أخرى لتغيير كلمة المرور لدواعي أمنية");
      } else {
        alert("فشل تحديث البيانات: " + error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 mt-6">
      {/* Live Session Alert */}
      {activeSession && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-r from-green-500 to-green-600 rounded-[var(--radius-lg)] p-6 text-white shadow-xl flex items-center justify-between border-4 border-white/20"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
              <Zap size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black">حصة مباشرة الآن!</h3>
              <p className="opacity-90 font-bold">المعلم {activeSession.teacherName} بدأ حصة {lessons.find(l => l.id === activeSession.activeLessonId)?.title}</p>
            </div>
          </div>
          <button 
            onClick={() => {
              const sessionLesson = lessons.find(l => l.id === activeSession.activeLessonId);
              if (profile?.role === "student" && profile?.grade && sessionLesson) {
                if (!isGradeMatch(profile.grade, sessionLesson.grade)) {
                  alert(`عذراً، هذه الحصة مخصصة لصف آخر (${sessionLesson.grade}) ولا يمكنك الانضمام إليها. صفك المسجل هو: ${getGradeLabel(normalizeGrade(profile.grade) || 1)}`);
                  return;
                }
              }
              setSelectedLessonId(activeSession.activeLessonId);
              if (sessionLesson) {
                const config: ReaderConfig = {
                  lessonId: sessionLesson.id,
                  speed,
                  mode,
                  font,
                  theme: localStorage.getItem("theme") || "light",
                  fontSize
                };
                sessionStorage.setItem("reader_config", JSON.stringify(config));
                navigate("/read");
              }
            }}
            className="bg-white text-green-600 px-8 py-3 rounded-full font-black text-lg hover:shadow-lg hover:scale-105 transition-all shadow-md"
          >
            انضم الآن
          </button>
        </motion.div>
      )}

      {/* Individual Assignment Alert */}
      {studentAssignment && (
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[var(--radius-lg)] p-6 text-white shadow-xl flex items-center justify-between border-4 border-white/20"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <BookOpen size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black">درس موجه لك!</h3>
              <p className="opacity-90 font-bold">المعلم {studentAssignment.teacherName} اختار لك درس {lessons.find(l => l.id === studentAssignment.lessonId)?.title}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={async () => {
                const sessionLesson = lessons.find(l => l.id === studentAssignment.lessonId);
                if (profile?.role === "student" && profile?.grade && sessionLesson) {
                  if (!isGradeMatch(profile.grade, sessionLesson.grade)) {
                    alert(`عذراً، هذا التكليف مخصص لصف آخر (${sessionLesson.grade}). صفك المسجل هو: ${getGradeLabel(normalizeGrade(profile.grade) || 1)}`);
                    return;
                  }
                }
                if (sessionLesson) {
                  const config: ReaderConfig = {
                    lessonId: sessionLesson.id,
                    speed,
                    mode,
                    font,
                    theme: localStorage.getItem("theme") || "light",
                    fontSize
                  };
                  sessionStorage.setItem("reader_config", JSON.stringify(config));
                  navigate("/read");
                }
              }}
              className="bg-white text-blue-600 px-8 py-3 rounded-full font-black text-lg hover:shadow-lg transition-all"
            >
              ابدأ الآن
            </button>
            <button 
              onClick={async () => {
                if (user) await deleteDoc(doc(db, "student_assignments", user.uid));
              }}
              className="bg-white/10 text-white px-4 py-3 rounded-full font-bold hover:bg-white/20 transition-all"
            >
              إغلاق
            </button>
          </div>
        </motion.div>
      )}

      {/* Simplified Stats Summary Row */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {[
      { label: "المستوى", value: profile?.level || 1, color: "var(--primary)", icon: Trophy },
      { label: "النقاط", value: profile?.xp || 0, color: "#f59e0b", icon: Star },
      { label: "السلسلة", value: profile?.streak || 0, color: "#ea580c", icon: TrendingUp },
      { label: "السرعة", value: profile?.bestSpeed || 0, color: "#2563eb", icon: Zap }
    ].map((stat, i) => (
      <div key={i} className="bg-[var(--card-bg)] rounded-2xl p-2.5 border border-[var(--border)] shadow-sm flex items-center gap-2 overflow-hidden relative group">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
          <stat.icon size={14} />
        </div>
        <div className="min-w-0">
          <p className="text-[8px] font-bold text-[var(--text-light)] truncate leading-none mb-1">{stat.label}</p>
          <h4 className="text-sm font-black leading-none tabular-nums truncate" style={{ color: stat.color }}>{toIndianNumbers(stat.value)}</h4>
        </div>
      </div>
    ))}
  </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-8">
        {/* Left Column Stack */}
        <div className="space-y-6 lg:sticky lg:top-8 h-fit">
          {/* Settings Card */}
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-6 border border-[var(--border)] shadow-md space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b-2 border-[var(--border)] pb-2">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center justify-between group flex-1"
              >
                <h3 className="text-lg font-bold text-[var(--primary)] flex items-center gap-2">
                  <Sliders size={18} />
                  <span>إعدادات القارئ</span>
                </h3>
                <ChevronRight size={18} className={cn("text-[var(--text-light)] transition-transform", showSettings && "rotate-90")} />
              </button>
              <button 
                onClick={() => setShowProfileModal(true)}
                className="mr-4 text-xs font-bold text-[var(--text-light)] hover:text-[var(--primary)] flex items-center gap-1 bg-[var(--bg)] px-3 py-1.5 rounded-full border border-[var(--border)] transition-all"
              >
                <User size={12} />
                <span>الملف الشخصي</span>
              </button>
            </div>

            {showSettings && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="space-y-5 overflow-hidden pt-2">
                {/* 1. نوع الخط العربي الافتراضي */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-gray-700">نوع الخط الافتراضي:</span>
                    <span className="font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      {ARABIC_FONTS.find(f => f.id === fontFamilyId)?.label || "مدرسي"}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {ARABIC_FONTS.map(f => {
                      const isSelected = fontFamilyId === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => {
                            setFontFamilyId(f.id as any);
                            setFont(f.family);
                            saveReaderPreferences({ fontFamilyId: f.id as any });
                          }}
                          className={cn(
                            "py-2 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-0.5",
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-black"
                              : "bg-[var(--card-bg)] hover:bg-gray-100 text-gray-700 border-[var(--border)] font-bold"
                          )}
                        >
                          <span className="text-[11px]">{f.label}</span>
                          <span style={{ fontFamily: f.family }} className={cn("text-[10px] truncate max-w-full", isSelected ? "text-white" : "text-gray-400")}>
                            أبجد
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. حجم الخط */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-gray-700">حجم الخط:</span>
                    <span className="font-black text-blue-700">{toIndianNumbers(fontSize)} نقطة</span>
                  </div>
                  <div className="flex items-center gap-3 bg-[var(--bg)] p-1.5 rounded-full border border-[var(--border)] w-fit">
                    <button 
                      onClick={() => {
                        const newSize = Math.max(16, fontSize - 2);
                        setFontSize(newSize);
                        saveReaderPreferences({ fontSize: newSize });
                      }} 
                      className="w-7 h-7 rounded-full bg-[var(--card-bg)] flex items-center justify-center text-sm font-bold shadow-sm cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-bold min-w-[1.5rem] text-center text-sm tabular-nums">{toIndianNumbers(fontSize)}</span>
                    <button 
                      onClick={() => {
                        const newSize = Math.min(72, fontSize + 2);
                        setFontSize(newSize);
                        saveReaderPreferences({ fontSize: newSize });
                      }} 
                      className="w-7 h-7 rounded-full bg-[var(--card-bg)] flex items-center justify-center text-sm font-bold shadow-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 3. شكل القراءة */}
                <div className="space-y-1.5">
                  <span className="text-xs font-black text-gray-700 block">شكل القراءة المفضل:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "static", icon: BookOpen, label: "📄 نص كامل", desc: "كامل الشاشة" },
                      { id: "scroll", icon: Scroll, label: "📜 انسيابي", desc: "صعود للأعلى" },
                      { id: "rsvp", icon: Zap, label: "⚡ كلمة بكلمة", desc: "وميض" },
                      { id: "disappearing", icon: Sparkles, label: "✨ ظهور واختفاء", desc: "تتابع واختفاء" }
                    ].map(m => (
                      <button 
                        key={m.id} 
                        onClick={() => {
                          setMode(m.id as any);
                          saveReaderPreferences({ mode: m.id as any });
                        }} 
                        className={cn(
                          "flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all cursor-pointer", 
                          mode === m.id 
                            ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-xs font-black" 
                            : "bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--card-bg)] border-[var(--border)] font-bold"
                        )}
                      >
                        <m.icon size={18} />
                        <span className="text-[11px]">{m.label}</span>
                        <span className="text-[9px] opacity-75">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. السرعة */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2 text-xs font-bold text-gray-700"><Zap size={14} className="text-amber-500" /> سرعة القراءة الافتراضية</span>
                    <span className="text-sm font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 tabular-nums">{toIndianNumbers(speed)} ك/د</span>
                  </div>
                  <input 
                    type="range" 
                    min="30" 
                    max="400" 
                    step="10" 
                    value={speed} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setSpeed(val);
                      saveReaderPreferences({ speed: val });
                    }} 
                    className="w-full h-1.5 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-amber-500" 
                  />
                  <p className="text-[10px] text-gray-400 font-bold">تُحفظ الإعدادات تلقائياً ولا تتغير حتى تقوم بتعديلها</p>
                </div>

              {/* Grade Selector */}
              <div className="space-y-4">
                {profile?.role === "student" && profile?.grade ? (
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-900">صفك الدراسي المسجل:</span>
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full font-black text-xs">
                      {getGradeLabel(normalizeGrade(profile.grade) || 1)}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {["1", "2", "3", "4", "5", "6"].map(g => (
                      <motion.button 
                        key={g} 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setGrade(g)} 
                        className={cn("flex flex-col items-center justify-center p-3 rounded-2xl border border-[var(--border)] transition-all", grade === g ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--bg)] text-[var(--text)]")}
                      >
                        <span className="text-xl font-bold">{toIndianNumbers(g)}</span>
                        <span className="text-[10px]">الصف</span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
            )}
          </div>

          {/* Badges & Achievements Card */}
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-6 border border-[var(--border)] shadow-md space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between pb-4 border-b-2 border-[var(--border)]">
              <h3 className="text-lg font-bold text-[var(--primary)] flex items-center gap-2">
                <Award size={20} className="text-orange-500" />
                <span>أوسمتي وإنجازاتي</span>
              </h3>
              <span className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                {toIndianNumbers(BADGES.filter(badge => 
                  profile?.badges?.includes(badge.id) || badge.condition({
                    xp: profile?.xp || 0,
                    streak: profile?.streak || 0,
                    bestSpeed: profile?.bestSpeed || 0
                  })
                ).length)} من {toIndianNumbers(BADGES.length)}
              </span>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 pl-1 scrollbar-thin">
              {BADGES.map((badge) => {
                const isUnlocked = profile?.badges?.includes(badge.id) || badge.condition({
                  xp: profile?.xp || 0,
                  streak: profile?.streak || 0,
                  bestSpeed: profile?.bestSpeed || 0
                });
                return (
                  <motion.div 
                    key={badge.id}
                    whileHover={{ scale: isUnlocked ? 1.02 : 1 }}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-xl border transition-all duration-300",
                      isUnlocked 
                        ? "bg-gradient-to-r from-orange-50/40 to-yellow-50/20 border-orange-200/80 shadow-sm" 
                        : "bg-gray-50/50 border-dashed border-gray-200 opacity-60"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0",
                      isUnlocked 
                        ? "bg-gradient-to-br from-orange-100 to-yellow-100 text-orange-600 scale-105 shadow-inner" 
                        : "bg-gray-100 text-gray-400"
                    )}>
                      {getBadgeIcon(badge.icon, isUnlocked)}
                    </div>
                    <div className="flex-1 text-right min-w-0">
                      <div className="flex items-center gap-2 justify-start">
                        <span className={cn("font-bold text-sm truncate", isUnlocked ? "text-gray-900" : "text-gray-500")}>
                          {badge.name}
                        </span>
                        {isUnlocked && (
                          <span className="bg-orange-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                            مفتوح
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-light)] mt-0.5 leading-relaxed">
                        {isUnlocked ? badge.description : badge.criteriaText}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

      {/* Lessons List */}
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-8 h-fit">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
            <Book size={24} />
            <span>النصوص المتاحة</span>
          </h3>
          
          <div className="flex bg-[var(--bg)] p-1 rounded-full border border-[var(--border)]">
            {["الفصل الدراسي الأول", "الفصل الدراسي الثاني"].map(s => (
              <button 
                key={s} 
                onClick={() => setSemester(s)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                  semester === s ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text-light)] hover:text-[var(--primary)]"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 bg-[var(--bg)] px-4 py-2 rounded-full border border-[var(--border)] w-full sm:w-auto">
            <Search size={18} className="text-[var(--text-light)]" />
            <input type="text" placeholder="بحث..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full" />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-[var(--primary)]">
            <Zap className="animate-spin" size={48} />
            <span className="font-bold">جاري تحميل الدروس...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto p-2 scrollbar-hide">
            {filteredLessons.map(l => (
              <motion.button 
                key={l.id} 
                layout
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedLessonId(l.id)} 
                className={cn("relative flex flex-col items-center gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--border)] transition-all", selectedLessonId === l.id ? "bg-primary/10 border-[var(--primary)] ring-2 ring-[var(--primary)] ring-offset-2" : "bg-[var(--bg)] text-[var(--text)]")}
              >
                <span className="absolute top-2 left-2 bg-[var(--primary)] text-white text-[10px] px-2 py-0.5 rounded-full">
                  {toIndianNumbers(l.content.split(/\s+/).length)}
                </span>
                <FileText size={32} className="text-[var(--primary)]" />
                <span className="text-xs font-bold line-clamp-2 text-center">{l.title}</span>
              </motion.button>
            ))}
            {filteredLessons.length === 0 && (
              <div className="col-span-full text-center py-20 text-[var(--text-light)]">
                لا توجد نصوص تطابق اختياراتك
              </div>
            )}
          </div>
        )}

        <div className="pt-8 border-t border-[var(--border)] space-y-4">
            <button onClick={handleLaunch} disabled={!selectedLessonId} className="w-full py-5 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-dark)] text-white rounded-full font-bold text-xl flex items-center justify-center gap-3 hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-50 disabled:translate-y-0">
              <Play size={24} />
              <span>ابدأ القراءة</span>
            </button>
            
            <div className="flex justify-center gap-8 text-sm">
              <button onClick={() => navigate("/reports")} className="text-[var(--text-light)] hover:text-[var(--primary)] flex items-center gap-2">
                <ChartLine size={16} />
                <span>تقاريري</span>
              </button>
              <button onClick={() => navigate("/leaderboard")} className="text-[var(--text-light)] hover:text-[var(--primary)] flex items-center gap-2">
                <Trophy size={16} />
                <span>لوحة الصدارة</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 max-w-md w-full shadow-2xl border border-[var(--border)] relative animate-in fade-in zoom-in duration-200">
            {!isFirstLogin && (
              <button onClick={() => setShowProfileModal(false)} className="absolute top-4 left-4 text-[var(--text-light)] hover:text-[var(--accent)]"><X size={24} /></button>
            )}
            <h3 className="text-2xl font-bold text-[var(--primary)] mb-6 flex items-center gap-2">
              <User /> 
              {isFirstLogin ? "إكمال الملف الشخصي" : "تعديل الملف الشخصي"}
            </h3>
            
            <div className="flex flex-col items-center mb-8">
              <div className="relative group">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-[var(--primary)] shadow-lg" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[var(--bg)] flex items-center justify-center text-[var(--primary)] text-3xl font-bold border-4 border-[var(--primary)]">
                    {profile?.username?.[0].toUpperCase()}
                  </div>
                )}
                <label className="absolute bottom-0 right-0 bg-[var(--primary)] text-white p-2 rounded-full cursor-pointer shadow-md hover:scale-110 transition-all">
                  <Camera size={16} />
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
                {uploading && (
                  <div className="absolute inset-0 bg-black/20 rounded-full flex items-center justify-center">
                    <Loader2 className="animate-spin text-white" />
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-bold text-[var(--text-light)]">@{profile?.username}</p>
              {isFirstLogin && <p className="text-[10px] text-[var(--accent)] font-bold mt-1">يرجى إكمال بياناتك وتغيير كلمة المرور للمتابعة</p>}
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-light)] px-2">الاسم الأول</label>
                  <input type="text" placeholder="الاسم الأول" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} required className="w-full px-4 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-light)] px-2">الاسم الأخير</label>
                  <input type="text" placeholder="الاسم الأخير" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} required className="w-full px-4 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" />
                </div>
              </div>

              {profile?.role === "student" ? (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">الصف الدراسي:</span>
                    <span className="font-black bg-white px-3 py-1 rounded-full border border-blue-200 text-blue-800 shadow-2xs">
                      {getGradeLabel(normalizeGrade(profile.grade) || 1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">الشعبة / الفصل:</span>
                    <span className="font-black bg-white px-3 py-1 rounded-full border border-blue-200 text-blue-800 shadow-2xs">
                      الشعبة ({profile.section || "أ"})
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 pt-1.5 border-t border-blue-100 leading-normal">
                    * الصف والشعبة مسجلان من قبل إدارة المدرسة والمعلم، ولا يمكن تغييرهما من قبل الطالب.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text-light)] px-2">الصف</label>
                    <select value={editGrade} onChange={(e) => setEditGrade(e.target.value)} required className="w-full px-4 py-3 rounded-full border bg-[var(--bg)]">
                      <option value="">الصف</option>
                      {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{toIndianNumbers(g)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text-light)] px-2">الفصل</label>
                    <select value={editSection} onChange={(e) => setEditSection(e.target.value)} required className="w-full px-4 py-3 rounded-full border bg-[var(--bg)]">
                      <option value="">الفصل</option>
                      {["أ", "ب", "ج", "د"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                <p className="text-xs font-bold text-[var(--primary)] px-2">تغيير كلمة المرور {isFirstLogin && "(إلزامي)"}</p>
                <input type="password" placeholder="كلمة المرور الجديدة" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required={isFirstLogin} className="w-full px-6 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" />
                <input type="password" placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required={isFirstLogin} className="w-full px-6 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" />
              </div>

              <button type="submit" disabled={saving} className="w-full py-4 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                <span>{isFirstLogin ? "حفظ وإكمال الدخول" : "حفظ التغييرات"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

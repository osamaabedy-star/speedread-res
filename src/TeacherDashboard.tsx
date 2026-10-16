import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { UserProfile, Lesson, ReaderConfig, ReadingSession } from "./types";
import { cn, toIndianNumbers, normalizeGrade, getGradeLabel, normalizeSemester } from "./utils";
import { 
  Users, 
  BookOpen, 
  GraduationCap, 
  PlayCircle,
  Presentation,
  FileText,
  Search,
  Sparkles,
  Layers,
  Clock,
  HelpCircle,
  BookMarked,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  ArrowUpDown,
  Zap,
  X
} from "lucide-react";
import { collection, onSnapshot, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { motion, AnimatePresence } from "framer-motion";

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  // Grade definitions (1 through 6)
  const gradesList = [
    { label: "الصف الأول", num: 1 },
    { label: "الصف الثاني", num: 2 },
    { label: "الصف الثالث", num: 3 },
    { label: "الصف الرابع", num: 4 },
    { label: "الصف الخامس", num: 5 },
    { label: "الصف السادس", num: 6 }
  ];

  // Selected Grade state (default: teacher's assigned grade or Grade 6)
  const [selectedGradeNum, setSelectedGradeNum] = useState<number>(() => {
    if (profile?.grade) {
      const g = normalizeGrade(profile.grade);
      if (g) return g;
    }
    const savedLocal = localStorage.getItem("teacher_assigned_grade_num");
    if (savedLocal) return parseInt(savedLocal, 10);
    const saved = sessionStorage.getItem("teacher_selected_grade_num");
    return saved ? parseInt(saved, 10) : 6;
  });

  const [selectedSection, setSelectedSection] = useState<string>(() => {
    return sessionStorage.getItem("teacher_selected_section") || "الكل";
  });

  // Selected student for training
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(() => {
    const saved = sessionStorage.getItem("teacher_selected_student");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  // Tabs for lessons: "curriculum_1" | "curriculum_2" | "curriculum_3" | "external" | "all"
  const [lessonTab, setLessonTab] = useState<"curriculum_1" | "curriculum_2" | "curriculum_3" | "external" | "all">("curriculum_1");
  
  // Reading mode preferred by teacher: "static" | "scroll" | "rsvp"
  const [teacherReadingMode, setTeacherReadingMode] = useState<"static" | "scroll" | "rsvp">(() => {
    return (sessionStorage.getItem("teacher_reading_mode") as any) || "static";
  });

  // Modal to choose reading mode and speed before launching Reader
  const [lessonForReadingModal, setLessonForReadingModal] = useState<Lesson | null>(null);
  const [readingModeDraft, setReadingModeDraft] = useState<"static" | "scroll" | "rsvp">("static");
  const [readingSpeedDraft, setReadingSpeedDraft] = useState<number>(150);
  
  // Searches
  const [studentSearch, setStudentSearch] = useState("");
  const [lessonSearch, setLessonSearch] = useState("");

  // Data states
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [todayCompletedStudentIds, setTodayCompletedStudentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Save selected grade/section in session storage
  useEffect(() => {
    sessionStorage.setItem("teacher_selected_grade_num", selectedGradeNum.toString());
    sessionStorage.setItem("teacher_selected_grade", getGradeLabel(selectedGradeNum));
  }, [selectedGradeNum]);

  useEffect(() => {
    sessionStorage.setItem("teacher_selected_section", selectedSection);
  }, [selectedSection]);

  useEffect(() => {
    if (selectedStudent) {
      sessionStorage.setItem("teacher_selected_student", JSON.stringify(selectedStudent));
    }
  }, [selectedStudent]);

  // Real-time listener for Students from BOTH students_roster AND users
  useEffect(() => {
    let unsubscribeRoster: (() => void) | undefined;
    let unsubscribeUsers: (() => void) | undefined;
    let unsubscribeLessons: (() => void) | undefined;

    let rosterMap = new Map<string, UserProfile>();
    let usersMap = new Map<string, UserProfile>();

    const updateCombinedStudents = () => {
      const mergedMap = new Map<string, UserProfile>();
      
      // 1. Add roster students
      rosterMap.forEach((student, key) => {
        mergedMap.set(key, student);
      });

      // 2. Add or merge registered users
      usersMap.forEach((user, key) => {
        if (mergedMap.has(key)) {
          mergedMap.set(key, { ...mergedMap.get(key), ...user });
        } else {
          // Check by nationalId if key was UID
          let foundByNat = false;
          if (user.nationalId) {
            for (const [rKey, rStudent] of mergedMap.entries()) {
              if (rStudent.nationalId === user.nationalId) {
                mergedMap.set(rKey, { ...rStudent, ...user });
                foundByNat = true;
                break;
              }
            }
          }
          if (!foundByNat) {
            mergedMap.set(key, user);
          }
        }
      });

      const list = Array.from(mergedMap.values());
      // Sort students by name
      list.sort((a, b) => (a.fullName || a.username || "").localeCompare(b.fullName || b.username || "", "ar"));
      setAllStudents(list);
    };

    // Listen to students_roster (the school database imported in Admin)
    try {
      unsubscribeRoster = onSnapshot(collection(db, "students_roster"), (snapshot) => {
        const nextMap = new Map<string, UserProfile>();
        snapshot.docs.forEach(docSnap => {
          const d = docSnap.data();
          const natId = docSnap.id;
          const fullName = d.fullName || d.name || `طالب (${natId})`;
          nextMap.set(natId, {
            uid: natId,
            nationalId: natId,
            fullName: fullName,
            username: fullName.split(" ")[0] || natId,
            grade: d.grade || "",
            section: d.section || "",
            role: "student",
            approved: true,
            createdAt: d.createdAt
          } as UserProfile);
        });
        rosterMap = nextMap;
        updateCombinedStudents();
      }, (err) => {
        console.error("students_roster snapshot error:", err);
      });
    } catch (e) {
      console.error("Failed to attach roster listener:", e);
    }

    // Listen to users collection (students registered or added)
    try {
      unsubscribeUsers = onSnapshot(query(collection(db, "users"), where("role", "==", "student")), (snapshot) => {
        const nextMap = new Map<string, UserProfile>();
        snapshot.docs.forEach(docSnap => {
          const d = docSnap.data();
          nextMap.set(docSnap.id, {
            uid: docSnap.id,
            ...d
          } as UserProfile);
        });
        usersMap = nextMap;
        updateCombinedStudents();
      }, (err) => {
        console.error("users snapshot error:", err);
      });
    } catch (e) {
      console.error("Failed to attach users listener:", e);
    }

    // Load Static Lessons + Real-Time Custom Lessons from Firestore
    const loadAllLessons = async () => {
      const files = [
        "upper_first.json", "upper_second.json",
        "primary_first.json", "primary_second.json",
        "lessons_part1.json", "lessons_part2.json", "lessons_part3.json", "lessons_part4.json", "lessons_part5.json",
        "lessons_1_2_part1.json"
      ];
      
      let staticLoaded: Lesson[] = [];
      for (const file of files) {
        try {
          const res = await fetch(`/${file}`);
          if (res.ok) {
            const data: Lesson[] = await res.json();
            staticLoaded = [...staticLoaded, ...data];
          }
        } catch (e) {
          // continue
        }
      }

      // Real-time listener for Firestore custom lessons (added by Admin)
      try {
        unsubscribeLessons = onSnapshot(collection(db, "lessons"), (snapshot) => {
          const customLessons = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              ...data,
              isCustom: true // Mark as custom added by Admin
            } as Lesson & { isCustom?: boolean };
          });

          // Custom lessons from admin appear at the very top!
          const combined = [...customLessons, ...staticLoaded];
          const unique = Array.from(new Map(combined.map(l => [l.id, l])).values());
          setAllLessons(unique);
          setLoading(false);
        }, (err) => {
          console.error("lessons snapshot error:", err);
          // Fallback to static
          setAllLessons(staticLoaded);
          setLoading(false);
        });
      } catch (e) {
        setAllLessons(staticLoaded);
        setLoading(false);
      }
    };

    loadAllLessons();

    // Fetch today's reading sessions to highlight who read today
    const fetchTodaySessions = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const todaySnap = await getDocs(query(
          collection(db, "reading_sessions"),
          where("date", ">=", today)
        ));
        const completedIds = Array.from(new Set(todaySnap.docs.map(d => d.data().userId as string)));
        setTodayCompletedStudentIds(completedIds);
      } catch (e) {
        // ignore
      }
    };
    fetchTodaySessions();

    return () => {
      if (unsubscribeRoster) unsubscribeRoster();
      if (unsubscribeUsers) unsubscribeUsers();
      if (unsubscribeLessons) unsubscribeLessons();
    };
  }, []);

  // Filter students based on selected grade and section
  const filteredStudents = allStudents.filter(student => {
    const studentGradeNum = normalizeGrade(student.grade);
    const gradeMatch = studentGradeNum === selectedGradeNum;
    const sectionMatch = selectedSection === "الكل" || student.section === selectedSection;

    const name = (student.fullName || student.username || "").toLowerCase();
    const natId = String(student.nationalId || "").toLowerCase();
    const searchMatch = !studentSearch || name.includes(studentSearch.toLowerCase()) || natId.includes(studentSearch.toLowerCase());

    return gradeMatch && sectionMatch && searchMatch;
  });

  // Extract available sections for the currently selected grade
  const availableSections = Array.from(
    new Set(allStudents.filter(s => normalizeGrade(s.grade) === selectedGradeNum).map(s => s.section).filter(Boolean))
  ) as string[];

  // Keep selected student synced when grade changes
  useEffect(() => {
    if (filteredStudents.length > 0) {
      if (!selectedStudent || normalizeGrade(selectedStudent.grade) !== selectedGradeNum) {
        setSelectedStudent(filteredStudents[0]);
      }
    }
  }, [selectedGradeNum, filteredStudents.length]);

  // Filter lessons based on:
  // 1) Grade (matches selectedGradeNum)
  // 2) Tab (Semester 1, Semester 2, Semester 3, External, or All)
  // 3) Search query
  const filteredLessons = allLessons.filter(lesson => {
    const lessonGradeNum = normalizeGrade(lesson.grade);
    // Grade matches or lesson has no grade specified
    const gradeMatch = !lessonGradeNum || lessonGradeNum === selectedGradeNum;

    const lessonSemKey = normalizeSemester(lesson.semester);
    let tabMatch = false;

    if (lessonTab === "all") {
      tabMatch = true;
    } else if (lessonTab === "curriculum_1") {
      tabMatch = lessonSemKey === "1";
    } else if (lessonTab === "curriculum_2") {
      tabMatch = lessonSemKey === "2";
    } else if (lessonTab === "curriculum_3") {
      tabMatch = lessonSemKey === "3";
    } else if (lessonTab === "external") {
      tabMatch = lessonSemKey === "external";
    }

    const searchMatch = !lessonSearch || 
      lesson.title.toLowerCase().includes(lessonSearch.toLowerCase()) ||
      lesson.content.toLowerCase().includes(lessonSearch.toLowerCase());

    return gradeMatch && tabMatch && searchMatch;
  });

  // Action: Launch Reader for selected student - Opens pre-flight modal to select mode & speed
  const handleOpenReadingModal = (lesson: Lesson) => {
    if (!selectedStudent) {
      alert("الرجاء اختيار طالب من القائمة الجانبية أولاً لبدء التدريب معه.");
      return;
    }
    setLessonForReadingModal(lesson);
    setReadingModeDraft(teacherReadingMode);
  };

  const handleConfirmStartSession = (modeToUse: "static" | "scroll" | "rsvp", speedToUse: number) => {
    if (!selectedStudent || !lessonForReadingModal) return;

    setTeacherReadingMode(modeToUse);
    sessionStorage.setItem("teacher_reading_mode", modeToUse);

    const config: ReaderConfig = {
      lessonId: lessonForReadingModal.id,
      speed: speedToUse,
      mode: modeToUse,
      font: "Tajawal",
      theme: "light",
      fontSize: 34,
      teacherMode: true,
      targetStudentId: selectedStudent.uid || selectedStudent.nationalId,
      targetStudentName: selectedStudent.fullName || selectedStudent.username
    };

    sessionStorage.setItem("reader_config", JSON.stringify(config));
    setLessonForReadingModal(null);
    navigate("/read");
  };

  const handleStartSession = (lesson: Lesson, modeOverride?: "static" | "scroll" | "rsvp") => {
    if (!selectedStudent) {
      alert("الرجاء اختيار طالب من القائمة الجانبية أولاً لبدء التدريب معه.");
      return;
    }

    if (!modeOverride) {
      handleOpenReadingModal(lesson);
      return;
    }

    const mode = modeOverride;

    const config: ReaderConfig = {
      lessonId: lesson.id,
      speed: 150,
      mode: mode,
      font: "Tajawal",
      theme: "light",
      fontSize: 34,
      teacherMode: true,
      targetStudentId: selectedStudent.uid || selectedStudent.nationalId,
      targetStudentName: selectedStudent.fullName || selectedStudent.username
    };

    sessionStorage.setItem("reader_config", JSON.stringify(config));
    navigate("/read");
  };

  // Action: Launch Quiz directly for selected student with this lesson's exact questions
  const handleStartDirectQuiz = (lesson: Lesson) => {
    if (!selectedStudent) {
      alert("الرجاء اختيار طالب من القائمة الجانبية أولاً للإجابة على أسئلة الدرس معه.");
      return;
    }

    const questions = lesson.questions || [];
    if (questions.length === 0) {
      alert("هذا الدرس لا يحتوي على أسئلة مضافة حالياً.");
      return;
    }

    const session: ReadingSession = {
      userId: selectedStudent.uid || selectedStudent.nationalId,
      username: selectedStudent.fullName || selectedStudent.username,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      date: new Date().toISOString(),
      speed: 150,
      errors: 0,
      duration: 60,
      wordsRead: lesson.content ? lesson.content.trim().split(/\s+/).length : 0,
      totalWords: lesson.content ? lesson.content.trim().split(/\s+/).length : 0,
      completed: true,
      errorWords: []
    };

    sessionStorage.setItem("currentReadingSession", JSON.stringify({
      ...session,
      questions: questions
    }));

    navigate("/quiz");
  };

  // Action: Present on Whiteboard
  const handleOpenWhiteboard = (lesson: Lesson) => {
    sessionStorage.setItem("whiteboard_lesson_id", lesson.id);
    navigate("/whiteboard");
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 font-tajawal rtl" dir="rtl">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 font-bold">جاري تحميل بيانات الطلاب ونصوص القراءة المحدثة...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-3 pb-8 font-tajawal rtl" dir="rtl">
      
      {/* 1. الشريط العلوي المدمج في سطر واحد دون استهلاك مساحة من الصفحة */}
      <div className="bg-white rounded-2xl px-3 py-2 border border-gray-200 shadow-xs flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        
        {/* الجزء الأيمن: اختيار الصف والشعبة في سطر مدمج */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {/* الصفوف الدراسية: للمعلم يظهر صفه فقط، وللمشرف تظهر جميع الصفوف */}
          {profile?.role === "teacher" ? (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl text-xs font-black text-blue-900 shrink-0">
              <GraduationCap size={15} className="text-blue-600" />
              <span>{getGradeLabel(selectedGradeNum)}</span>
              <select
                value={selectedGradeNum}
                onChange={async (e) => {
                  const val = parseInt(e.target.value, 10);
                  setSelectedGradeNum(val);
                  setSelectedSection("الكل");
                  localStorage.setItem("teacher_assigned_grade_num", val.toString());
                  sessionStorage.setItem("teacher_selected_grade_num", val.toString());
                  if (profile?.uid) {
                    try {
                      await updateDoc(doc(db, "users", profile.uid), { grade: val.toString() });
                    } catch (err) {
                      console.error("Could not update teacher grade:", err);
                    }
                  }
                }}
                className="bg-white border border-blue-200 text-blue-700 text-[10px] font-bold rounded-md px-1.5 py-0.5 outline-none cursor-pointer hover:border-blue-400"
                title="تغيير صف التدريس المسند إليك"
              >
                {gradesList.map(g => (
                  <option key={g.num} value={g.num}>تغيير الصف: {g.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-xl shrink-0">
              {gradesList.map(grade => {
                const isSelected = selectedGradeNum === grade.num;
                return (
                  <button
                    key={grade.num}
                    onClick={() => {
                      setSelectedGradeNum(grade.num);
                      setSelectedSection("الكل");
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-black transition-all whitespace-nowrap",
                      isSelected 
                        ? "bg-blue-600 text-white shadow-xs" 
                        : "text-gray-700 hover:text-blue-600 hover:bg-white/80"
                    )}
                  >
                    {grade.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* شعب الصف (إن توفرت) */}
          {availableSections.length > 0 && (
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-xl text-xs font-bold shrink-0">
              <span className="text-[10px] text-gray-400">فصل:</span>
              <button
                onClick={() => setSelectedSection("الكل")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-black transition-all",
                  selectedSection === "الكل" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-200"
                )}
              >
                الكل
              </button>
              {availableSections.map(sec => (
                <button
                  key={sec}
                  onClick={() => setSelectedSection(sec)}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[11px] font-black transition-all",
                    selectedSection === sec ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {sec}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* الجزء الأوسط: الطالب المحدد حالياً كشارة مدمجة في نفس السطر */}
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedStudent ? (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl text-xs">
              <UserCheck size={14} className="text-blue-600 shrink-0" />
              <span className="text-blue-600 font-bold text-[11px] hidden md:inline">الطالب:</span>
              <span className="font-black text-gray-900 truncate max-w-[130px] sm:max-w-[180px]">
                {selectedStudent.fullName || selectedStudent.username}
              </span>
              {selectedStudent.section && (
                <span className="text-[10px] text-blue-700 bg-white px-1.5 py-0.2 rounded font-bold border border-blue-100">
                  {selectedStudent.section}
                </span>
              )}
              <button
                onClick={() => navigate("/reports", { 
                  state: { 
                    userId: selectedStudent.uid || selectedStudent.nationalId, 
                    targetUserId: selectedStudent.uid || selectedStudent.nationalId,
                    username: selectedStudent.fullName || selectedStudent.username 
                  } 
                })}
                className="p-1 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                title="تقرير قراءات الطالب"
              >
                <FileText size={13} />
              </button>
            </div>
          ) : (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1">
              <Users size={13} />
              <span>اختر طالباً للتدريب</span>
            </span>
          )}
        </div>

        {/* الجزء الأيسر: الأدوات السريعة في نفس السطر */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            onClick={() => navigate("/whiteboard")}
            className="flex items-center gap-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-2.5 py-1 rounded-xl font-black text-xs hover:shadow-xs transition-all active:scale-95"
            title="السبورة الذكية التفاعلية"
          >
            <Presentation size={14} />
            <span>السبورة</span>
          </button>
          
          <button 
            onClick={handleManualRefresh}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all"
            title="تحديث البيانات فوراً"
          >
            <RefreshCw size={14} className={cn(isRefreshing && "animate-spin text-blue-600")} />
          </button>
        </div>
      </div>

      {/* 2. منطقة العمل الرئيسية: عمود الطلاب + مكتبة الدروس بأقصى مساحة ممكنة */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        
        {/* ============================================================== */}
        {/* SIDE COLUMN: قائمة طلاب الصف (مدمجة وسريعة)                     */}
        {/* ============================================================== */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-3.5 border border-gray-200 shadow-xs flex flex-col h-[740px]">
          
          {/* شريط رأس قائمة الطلاب مدمج مع البحث */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
            <div className="flex items-center gap-1.5 shrink-0">
              <Users size={16} className="text-blue-600" />
              <h3 className="font-black text-xs text-gray-900">
                طلاب {getGradeLabel(selectedGradeNum)}
              </h3>
              <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-1.5 py-0.2 rounded-full border border-blue-100">
                {toIndianNumbers(filteredStudents.length)}
              </span>
            </div>

            {/* مربع البحث عن الطالب */}
            <div className="relative flex-1 max-w-[170px]">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="بحث بالاسم أو الهوية..."
                className="w-full pr-7 pl-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-[11px] focus:outline-none focus:border-blue-500 focus:bg-white font-bold transition-all"
              />
            </div>
          </div>

          {/* قائمة أسماء الطلاب المنظمة */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pt-2 pr-0.5 pl-0.5 scrollbar-thin">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-14 px-3 space-y-2 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Users size={28} className="mx-auto text-gray-300" />
                <p className="text-xs font-black text-gray-700">لا يوجد طلاب مسجلون في هذا الصف</p>
                <p className="text-[10px] text-gray-400 font-bold leading-relaxed">
                  الطلاب المضافون من الإدارة (سواء بالرفع أو الإضافة) يظهرون هنا تلقائياً فوراً.
                </p>
              </div>
            ) : (
              filteredStudents.map(student => {
                const isSelected = selectedStudent && (
                  (student.uid && selectedStudent.uid === student.uid) || 
                  (student.nationalId && selectedStudent.nationalId === student.nationalId)
                );
                const hasReadToday = todayCompletedStudentIds.includes(student.uid) || 
                  (student.nationalId && todayCompletedStudentIds.includes(student.nationalId));

                return (
                  <div
                    key={student.uid || student.nationalId}
                    onClick={() => setSelectedStudent(student)}
                    className={cn(
                      "p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between group",
                      isSelected 
                        ? "bg-blue-50 border-blue-500 shadow-xs" 
                        : "bg-white border-gray-100 hover:border-blue-200 hover:bg-gray-50/60"
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 transition-all",
                        isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-700"
                      )}>
                        {(student.fullName || student.username || "ط").charAt(0)}
                      </div>
                      <div className="truncate">
                        <div className={cn(
                          "font-black text-xs truncate leading-snug",
                          isSelected ? "text-blue-900" : "text-gray-900"
                        )}>
                          {student.fullName || student.username}
                        </div>
                        <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1.5">
                          {student.nationalId && (
                            <span>هوية: {toIndianNumbers(student.nationalId)}</span>
                          )}
                          {student.section && (
                            <>
                              <span>•</span>
                              <span>فصل {student.section}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasReadToday ? (
                        <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded-md" title="أكمل جلسة قراءة اليوم">
                          قرأ اليوم ✓
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.2 rounded-md">
                          بانتظار التدريب
                        </span>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("/reports", { 
                            state: { 
                              userId: student.uid || student.nationalId, 
                              targetUserId: student.uid || student.nationalId,
                              username: student.fullName || student.username 
                            } 
                          });
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                        title="عرض تقرير الطالب"
                      >
                        <FileText size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* MAIN BOX: مكتبة الدروس والنصوص حسب الفصول أو دروس خارجية       */}
        {/* ============================================================== */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-3.5 border border-gray-200 shadow-xs flex flex-col h-[740px]">
          
          {/* شريط رأس مكتبة الدروس: التبويبات الفصولية + البحث في سطر واحد */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100 flex-wrap sm:flex-nowrap">
            
            {/* التبويبات الفصولية في سطر مضغوط */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
              <button
                onClick={() => setLessonTab("curriculum_1")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-black text-xs transition-all whitespace-nowrap flex items-center gap-1 border",
                  lessonTab === "curriculum_1"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                )}
              >
                <BookMarked size={12} />
                <span>الفصل الأول</span>
              </button>

              <button
                onClick={() => setLessonTab("curriculum_2")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-black text-xs transition-all whitespace-nowrap flex items-center gap-1 border",
                  lessonTab === "curriculum_2"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                )}
              >
                <BookMarked size={12} />
                <span>الفصل الثاني</span>
              </button>

              <button
                onClick={() => setLessonTab("curriculum_3")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-black text-xs transition-all whitespace-nowrap flex items-center gap-1 border",
                  lessonTab === "curriculum_3"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                )}
              >
                <BookMarked size={12} />
                <span>الفصل الثالث</span>
              </button>

              <button
                onClick={() => setLessonTab("external")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-black text-xs transition-all whitespace-nowrap flex items-center gap-1 border",
                  lessonTab === "external"
                    ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                    : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                )}
              >
                <Sparkles size={12} />
                <span>دروس خارجية</span>
              </button>

              <button
                onClick={() => setLessonTab("all")}
                className={cn(
                  "px-2 py-1 rounded-lg font-black text-xs transition-all whitespace-nowrap border",
                  lessonTab === "all"
                    ? "bg-gray-800 text-white border-gray-800 shadow-xs"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                )}
              >
                <span>الكل</span>
              </button>
            </div>

            {/* مربع البحث عن نص أو درس */}
            <div className="relative min-w-[150px] max-w-[200px]">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={lessonSearch}
                onChange={(e) => setLessonSearch(e.target.value)}
                placeholder="ابحث في الدروس..."
                className="w-full pr-7 pl-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-[11px] focus:outline-none focus:border-blue-500 focus:bg-white font-bold"
              />
            </div>
          </div>

          {/* سطر معلومات سريع عن النصوص وشكل القراءة المعتمد */}
          <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50/80 p-2 rounded-2xl border border-gray-100 text-xs font-bold">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-500 text-[11px] font-black">شكل القراءة:</span>
              <div className="flex items-center bg-white p-0.5 rounded-xl border border-gray-200 shadow-2xs gap-0.5">
                <button
                  onClick={() => { setTeacherReadingMode("static"); sessionStorage.setItem("teacher_reading_mode", "static"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer",
                    teacherReadingMode === "static" ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs" : "text-gray-500 hover:text-gray-800"
                  )}
                  title="نص كامل ثابت"
                >
                  <BookOpen size={12} />
                  <span>📄 نص كامل</span>
                </button>

                <button
                  onClick={() => { setTeacherReadingMode("scroll"); sessionStorage.setItem("teacher_reading_mode", "scroll"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer",
                    teacherReadingMode === "scroll" ? "bg-blue-600 text-white shadow-2xs" : "text-gray-500 hover:text-gray-800"
                  )}
                  title="التمرير الانسيابي كالملقن"
                >
                  <ArrowUpDown size={12} />
                  <span>📜 تمرير انسيابي</span>
                </button>

                <button
                  onClick={() => { setTeacherReadingMode("rsvp"); sessionStorage.setItem("teacher_reading_mode", "rsvp"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer",
                    teacherReadingMode === "rsvp" ? "bg-amber-500 text-white shadow-2xs" : "text-gray-500 hover:text-gray-800"
                  )}
                  title="وميض كلمة كلمة"
                >
                  <Zap size={12} />
                  <span>⚡ كلمة كلمة</span>
                </button>
              </div>
            </div>

            <div className="text-[11px] text-gray-400 font-bold flex items-center gap-2">
              <span>{toIndianNumbers(filteredLessons.length)} نص متاح</span>
              {selectedStudent && (
                <span className="text-emerald-700 font-black">
                  • الطالب: {selectedStudent.fullName || selectedStudent.username}
                </span>
              )}
            </div>
          </div>

          {/* شبكة بطاقات الدروس المتاحة */}
          <div className="flex-1 overflow-y-auto pr-1 pl-1 scrollbar-thin grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {filteredLessons.length === 0 ? (
              <div className="col-span-full text-center py-16 px-4 space-y-2 bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center">
                <BookOpen size={36} className="text-gray-300" />
                <p className="text-xs font-black text-gray-700">لا توجد نصوص دراسية مضافة في هذا القسم</p>
                <p className="text-[11px] text-gray-400 font-bold max-w-md leading-relaxed">
                  يمكن للإدارة إضافة نصوص جديدة من لوحة الإدارة (رفع ملف، توليد، إضافة) وتظهر هنا فوراً.
                </p>
                <button
                  onClick={() => setLessonTab("all")}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all shadow-xs"
                >
                  عرض جميع نصوص {getGradeLabel(selectedGradeNum)}
                </button>
              </div>
            ) : (
              filteredLessons.map(lesson => {
                const wordsCount = lesson.content ? lesson.content.trim().split(/\s+/).length : 0;
                const questionsCount = lesson.questions?.length || 0;
                const isFromAdmin = (lesson as any).isCustom || (lesson as any).authorId;

                return (
                  <div
                    key={lesson.id}
                    className={cn(
                      "p-3 rounded-2xl border transition-all bg-white flex flex-col justify-between group space-y-2.5",
                      isFromAdmin 
                        ? "border-emerald-200 hover:border-emerald-400 hover:shadow-xs bg-emerald-50/15" 
                        : "border-gray-200 hover:border-blue-300 hover:shadow-xs"
                    )}
                  >
                    <div>
                      {/* شارات الدرس */}
                      <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.2 rounded-md border border-blue-100">
                            {lesson.grade || getGradeLabel(selectedGradeNum)}
                          </span>
                          <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.2 rounded-md">
                            {lesson.semester || "نص إثرائي"}
                          </span>
                        </div>

                        {/* شارة الإدارة */}
                        {isFromAdmin && (
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.2 rounded-md border border-emerald-200 flex items-center gap-1">
                            <Sparkles size={10} className="text-emerald-600" />
                            <span>مضاف من الإدارة</span>
                          </span>
                        )}
                      </div>

                      {/* عنوان الدرس */}
                      <h4 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-all leading-snug">
                        {lesson.title}
                      </h4>

                      {/* مقتطف من نص الدرس */}
                      <p className="text-xs text-gray-500 font-normal line-clamp-2 mt-1.5 leading-relaxed">
                        {lesson.content}
                      </p>

                      {/* إحصائيات النص */}
                      <div className="flex items-center gap-2.5 text-[10px] font-bold text-gray-400 mt-2 pt-1.5 border-t border-gray-100">
                        <span className="flex items-center gap-1">
                          <Clock size={11} className="text-blue-500" />
                          {toIndianNumbers(wordsCount)} كلمة
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <HelpCircle size={11} className="text-amber-500" />
                          {toIndianNumbers(questionsCount)} أسئلة فهم
                        </span>
                      </div>
                    </div>

                    {/* أزرار الإجراءات للدرس: اقرأ | الأسئلة | السبورة */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {/* زر بدء القراءة بالشكل المحدد */}
                      <button
                        onClick={() => handleStartSession(lesson)}
                        className={cn(
                          "py-2 px-1 rounded-xl font-black text-[11px] transition-all flex items-center justify-center gap-1 shadow-2xs cursor-pointer",
                          selectedStudent 
                            ? "bg-blue-600 text-white hover:bg-blue-700 active:scale-95" 
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        )}
                        title={selectedStudent ? `ابدأ القراءة مع ${selectedStudent.fullName?.split(" ")[0]} (${teacherReadingMode === "scroll" ? "تمرير انسيابي" : teacherReadingMode === "rsvp" ? "كلمة كلمة" : "نص كامل"})` : "اختر طالباً أولاً"}
                      >
                        <PlayCircle size={13} />
                        <span className="truncate">
                          اقرأ ({teacherReadingMode === "scroll" ? "انسيابي" : teacherReadingMode === "rsvp" ? "كلمة" : "كامل"})
                        </span>
                      </button>

                      {/* زر حل أسئلة الفهم للدرس نفسه */}
                      <button
                        onClick={() => handleStartDirectQuiz(lesson)}
                        className={cn(
                          "py-2 px-1 rounded-xl font-black text-[11px] transition-all flex items-center justify-center gap-1 border shadow-2xs cursor-pointer",
                          questionsCount > 0 
                            ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 active:scale-95" 
                            : "bg-gray-50 text-gray-400 border-gray-200 opacity-60 cursor-not-allowed"
                        )}
                        title={questionsCount > 0 ? `حل أسئلة هذا الدرس (${toIndianNumbers(questionsCount)} أسئلة)` : "لا توجد أسئلة"}
                        disabled={questionsCount === 0}
                      >
                        <HelpCircle size={13} className="text-amber-600" />
                        <span>الأسئلة ({toIndianNumbers(questionsCount)})</span>
                      </button>

                      {/* زر السبورة الذكية */}
                      <button
                        onClick={() => handleOpenWhiteboard(lesson)}
                        className="py-2 px-1 rounded-xl font-black text-[11px] transition-all flex items-center justify-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 active:scale-95 shadow-2xs cursor-pointer"
                        title="عرض النص على السبورة الذكية للفصل"
                      >
                        <Presentation size={13} />
                        <span>السبورة</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* نافذة اختيار شكل القراءة وسرعتها قبل الدخول للدرس */}
      <AnimatePresence>
        {lessonForReadingModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 text-right font-tajawal"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 text-blue-600">
                  <PlayCircle size={22} />
                  <div>
                    <h3 className="text-base font-black text-gray-900">اختيار شكل القراءة والسرعة</h3>
                    <p className="text-[11px] text-gray-400 font-bold">قبل الدخول إلى الدرس مع الطالب</p>
                  </div>
                </div>
                <button 
                  onClick={() => setLessonForReadingModal(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              {/* تفاصيل الدرس والطالب */}
              <div className="bg-blue-50/60 p-3 rounded-2xl border border-blue-100 text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-bold">الدرس:</span>
                  <span className="font-black text-blue-900">{lessonForReadingModal.title}</span>
                </div>
                {selectedStudent && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-bold">الطالب المحدد:</span>
                    <span className="font-black text-emerald-800">{selectedStudent.fullName || selectedStudent.username}</span>
                  </div>
                )}
              </div>

              {/* اختيار شكل القراءة */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-gray-800">اختر شكل القراءة المطلوب:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReadingModeDraft("static")}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                      readingModeDraft === "static"
                        ? "bg-blue-50 border-blue-500 text-blue-700 shadow-xs ring-2 ring-blue-500/20"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <BookOpen size={20} className={readingModeDraft === "static" ? "text-blue-600" : "text-gray-400"} />
                    <span className="text-xs font-black">📄 نص كامل</span>
                    <span className="text-[9px] text-gray-400 font-bold">قراءة تقليدية</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReadingModeDraft("scroll")}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                      readingModeDraft === "scroll"
                        ? "bg-blue-600 border-blue-600 text-white shadow-xs ring-2 ring-blue-600/20"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <ArrowUpDown size={20} className={readingModeDraft === "scroll" ? "text-white" : "text-gray-400"} />
                    <span className="text-xs font-black">📜 انسيابي</span>
                    <span className={cn("text-[9px] font-bold", readingModeDraft === "scroll" ? "text-blue-100" : "text-gray-400")}>
                      يصعد للأعلى
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReadingModeDraft("rsvp")}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer",
                      readingModeDraft === "rsvp"
                        ? "bg-amber-500 border-amber-500 text-white shadow-xs ring-2 ring-amber-500/20"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <Zap size={20} className={readingModeDraft === "rsvp" ? "text-white" : "text-gray-400"} />
                    <span className="text-xs font-black">⚡ كلمة كلمة</span>
                    <span className={cn("text-[9px] font-bold", readingModeDraft === "rsvp" ? "text-amber-100" : "text-gray-400")}>
                      وميض سريع
                    </span>
                  </button>
                </div>
              </div>

              {/* اختيار سرعة القراءة */}
              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-gray-800">سرعة القراءة:</label>
                  <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    {toIndianNumbers(readingSpeedDraft)} كلمة / دقيقة
                  </span>
                </div>
                <input 
                  type="range"
                  min="30"
                  max="350"
                  step="10"
                  value={readingSpeedDraft}
                  onChange={(e) => setReadingSpeedDraft(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                  <span>٣٠ (مبتدئ)</span>
                  <span>١٥٠ (متوسط)</span>
                  <span>٣٥٠ (سريع)</span>
                </div>
              </div>

              {/* أزرار الإجراء */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setLessonForReadingModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmStartSession(readingModeDraft, readingSpeedDraft)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <PlayCircle size={15} />
                  <span>بدء القراءة الآن</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

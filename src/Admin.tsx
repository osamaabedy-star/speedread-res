import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { UserProfile } from "./types";
import { cn, toIndianNumbers, normalizeGrade, getGradeLabel, normalizeSemester, normalizeSection } from "./utils";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck, Users, UserCheck, Trash2, ToggleLeft, ToggleRight, RefreshCw, Loader2, Home, Search, Filter, UserPlus, GraduationCap, BookOpen, X, FileDown, Upload, Cloud, FolderPlus, ChartLine, Sparkles, Plus, CheckCircle2, AlertCircle as AlertIcon, ListTodo, Database, Monitor, Edit2, Pencil, ArrowRightLeft, CheckSquare, Square, Check, AlertTriangle } from "lucide-react";
import Papa from "papaparse";
import { collection, getDocs, updateDoc, deleteDoc, doc, query, orderBy, setDoc, where, addDoc } from "firebase/firestore";
import { ReadingSession, QuizResult, Lesson } from "./types";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db, auth as firebaseAuth } from "./firebase";
import firebaseConfig from "../firebase-applet-config.json";
import { SignaturePad } from "./components/SignaturePad";
import { SupervisoryVisit, PeerVisit } from "./types";

export default function Admin() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "teacher" | "student">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Create User Form State
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"student" | "teacher" | "supervisor" | "general_supervisor">("student");
  const [newGrade, setNewGrade] = useState("");
  const [newSemester, setNewSemester] = useState("");
  const [newSection, setNewSection] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // New features state
  const [activeTab, setActiveTab] = useState<"users" | "tasks" | "lessons" | "studentsDB" | "visits" | "classroom" | "questions">("users");
  const [tasks, setTasks] = useState<{ student: UserProfile, result?: QuizResult }[]>([]);
  const [lessonsList, setLessonsList] = useState<Lesson[]>([]);
  const [questionsPool, setQuestionsPool] = useState<any[]>([]);
  const [studentsRoster, setStudentsRoster] = useState<any[]>([]);
  const [visits, setVisits] = useState<SupervisoryVisit[]>([]);
  const [peerVisits, setPeerVisits] = useState<PeerVisit[]>([]);
  
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [visitType, setVisitType] = useState<"supervisory" | "peer">("supervisory");
  const [targetTeacher, setTargetTeacher] = useState<UserProfile | null>(null);
  
  const [newNationalId, setNewNationalId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentGrade, setNewStudentGrade] = useState("6");
  const [newStudentSection, setNewStudentSection] = useState("أ");
  
  // Bulk paste states for easy Noor/Excel student import
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkGrade, setBulkGrade] = useState("6");
  const [bulkSection, setBulkSection] = useState("أ");
  const [studentRosterSearch, setStudentRosterSearch] = useState("");
  const [studentRosterGradeFilter, setStudentRosterGradeFilter] = useState("all");
  const [studentRosterSectionFilter, setStudentRosterSectionFilter] = useState("all");

  // Edit Student Modal State
  const [editingStudent, setEditingStudent] = useState<{
    originalId: string;
    nationalId: string;
    fullName: string;
    grade: string;
    section: string;
  } | null>(null);

  // Safe in-app Delete Confirmation (avoids blocked browser confirm() in iframe)
  const [studentToDelete, setStudentToDelete] = useState<{ nationalId: string; fullName: string } | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);

  // Safe in-app Delete Confirmation for Lessons and Questions
  const [lessonToDelete, setLessonToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingLesson, setIsDeletingLesson] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<{ id: string; text: string } | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);

  // Bulk Selection and Batch Action State
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [bulkMoveSection, setBulkMoveSection] = useState("ب");
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [inAppNotice, setInAppNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setInAppNotice(msg);
    setTimeout(() => {
      setInAppNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };
  
  const [aiTopic, setAiTopic] = useState("");
  const [aiGrade, setAiGrade] = useState("1");
  const [aiSemester, setAiSemester] = useState("الفصل الدراسي الأول");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLesson, setGeneratedLesson] = useState<any>(null);

  // Classroom states
  const [classSessions, setClassSessions] = useState<any[]>([]);
  const [myStudents, setMyStudents] = useState<UserProfile[]>([]);

  // New Question Form State
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [newQText, setNewQText] = useState("");
  const [newQOptions, setNewQOptions] = useState(["", "", "", ""]);
  const [newQCorrect, setNewQCorrect] = useState(0);
  const [newQLessonId, setNewQLessonId] = useState("all");

  const fetchClassroomData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Fetch active sessions
      const sessionsSnap = await getDocs(collection(db, "class_sessions"));
      setClassSessions(sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // My students (if teacher)
      if (profile.role === "teacher") {
        const students = users.filter(u => {
          const classKey = `${u.grade}-${u.section}`;
          return profile.assignedClasses?.includes(classKey) && u.role === "student";
        });
        setMyStudents(students);
      }
      
      // Also fetch lessons list for session creation
      if (lessonsList.length === 0) {
        await fetchCustomLessons();
      }
    } catch (error) {
      console.error("Failed to fetch classroom data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestionsPool = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "question_pool"));
      setQuestionsPool(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Failed to fetch questions pool:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async (classKey: string, lessonId: string) => {
    if (!profile) return;
    try {
      await setDoc(doc(db, "class_sessions", classKey), {
        activeLessonId: lessonId,
        teacherId: profile.uid,
        teacherName: profile.fullName || profile.username,
        startedAt: new Date().toISOString()
      });
      alert("تم بدء الحصة بنجاح");
      fetchClassroomData();
    } catch (error) {
      alert("فشل بدء الحصة: " + error);
    }
  };

  const handleEndSession = async (classKey: string) => {
    try {
      await deleteDoc(doc(db, "class_sessions", classKey));
      alert("تم إنهاء الحصة");
      fetchClassroomData();
    } catch (error) {
      alert("فشل إنهاء الحصة: " + error);
    }
  };
  useEffect(() => {
    if (activeTab === "tasks") {
      fetchTeacherTasks();
    } else if (activeTab === "lessons") {
      fetchCustomLessons();
    } else if (activeTab === "studentsDB") {
      fetchStudentsRoster();
    } else if (activeTab === "visits") {
      fetchVisits();
    } else if (activeTab === "classroom") {
      fetchClassroomData();
    } else if (activeTab === "questions") {
      fetchQuestionsPool();
    }
  }, [activeTab, users]);

  const handleAssignToStudent = async (studentUid: string, lessonId: string) => {
    if (!profile) return;
    try {
      await setDoc(doc(db, "student_assignments", studentUid), {
        lessonId,
        teacherId: profile.uid,
        teacherName: profile.fullName || profile.username,
        timestamp: new Date().toISOString(),
        status: "pending"
      });
      alert("تم إرسال الدرس للطالب بنجاح");
    } catch (error) {
      alert("فشل إرسال الدرس: " + error);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQText || newQOptions.some(o => !o)) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "question_pool"), {
        text: newQText,
        options: newQOptions,
        correct: newQCorrect,
        lessonId: newQLessonId || "all",
        type: "multiple",
        createdAt: new Date().toISOString()
      });
      alert("تمت إضافة السؤال بنجاح");
      setShowQuestionModal(false);
      setNewQText("");
      setNewQOptions(["", "", "", ""]);
      setNewQCorrect(0);
      fetchQuestionsPool();
    } catch (error) {
      alert("فشل الإضافة: " + error);
    } finally {
      setLoading(false);
    }
  };


  const fetchVisits = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let q1 = query(collection(db, "supervisory_visits"), orderBy("date", "desc"));
      let q2 = query(collection(db, "peer_visits"), orderBy("date", "desc"));

      if (profile.role === "teacher") {
        // Teachers see visits where they are the teacher/host or the visitor
        // Firestore doesn't support OR across collections easily, so we fetch and filter
      }

      const snap1 = await getDocs(q1);
      const snap2 = await getDocs(q2);

      let v1 = snap1.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupervisoryVisit));
      let v2 = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() } as PeerVisit));

      if (profile.role === "teacher") {
        v1 = v1.filter(v => v.teacherId === profile.uid);
        v2 = v2.filter(v => v.visitorId === profile.uid || v.hostId === profile.uid);
      } else if (profile.role === "supervisor") {
        v1 = v1.filter(v => v.supervisorId === profile.uid);
      }

      setVisits(v1);
      setPeerVisits(v2);
    } catch (error) {
      console.error("Failed to fetch visits:", error);
    } finally {
      setLoading(false);
    }
  };


  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const usersData = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      
      usersData.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      setUsers(usersData);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeacherTasks = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Find students in teacher's classes
      const teacherStudents = users.filter(u => {
        const classKey = `${u.grade}-${u.section}`;
        return profile.assignedClasses?.includes(classKey) && u.role === "student";
      });

      const allTasks: { student: UserProfile, result?: QuizResult }[] = [];

      for (const student of teacherStudents) {
        const resultsSnap = await getDocs(query(
          collection(db, "quiz_results"),
          where("userId", "==", student.uid),
          orderBy("date", "desc")
        ));
        
        const results = resultsSnap.docs.map(doc => doc.data() as QuizResult);
        const lowScoreResult = results.find(r => r.score < 60);
        
        if (lowScoreResult) {
          allTasks.push({ student, result: lowScoreResult });
        } else if (results.length === 0) {
          allTasks.push({ student }); // Student hasn't taken any tests yet
        }
      }
      setTasks(allTasks);
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomLessons = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "lessons"), orderBy("createdAt", "desc")));
      setLessonsList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson)));
    } catch (error) {
      console.error("Failed to fetch lessons:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentsRoster = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "students_roster"), orderBy("createdAt", "desc")));
      setStudentsRoster(snap.docs.map(doc => ({ nationalId: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Failed to fetch students roster:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudentToRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNationalId || !newStudentName || !newStudentGrade || !newStudentSection) return;
    setLoading(true);
    try {
      await setDoc(doc(db, "students_roster", newNationalId), {
        fullName: newStudentName,
        grade: newStudentGrade,
        section: newStudentSection,
        createdAt: new Date().toISOString()
      });
      alert("تم إضافة الطالب إلى قاعدة البيانات");
      setNewNationalId("");
      setNewStudentName("");
      setNewStudentGrade("");
      setNewStudentSection("");
      fetchStudentsRoster();
    } catch (error) {
      alert("فشل إضافة الطالب: " + error);
    } finally {
      setLoading(false);
    }
  };

  // Smart Bulk Paste for Students from Noor or Excel
  const handleBulkPasteStudents = async () => {
    if (!bulkPasteText.trim()) {
      showNotice("الرجاء لصق بيانات الطلاب أولاً في المربع المخصص.");
      return;
    }

    setLoading(true);
    try {
      const lines = bulkPasteText.split(/\r?\n/).filter(line => line.trim().length > 0);
      let successCount = 0;
      const sectionCounts: Record<string, number> = {};

      for (const rawLine of lines) {
        const line = rawLine.trim();
        // Skip header lines
        if (line.includes("رقم الهوية") || line.includes("اسم الطالب") || line.includes("السجل المدني")) continue;

        // Find 9 to 12 digit national ID
        const idMatch = line.match(/\b\d{9,12}\b/);
        if (!idMatch) continue;

        const natId = idMatch[0].trim();
        let remaining = line.replace(natId, "").trim();

        let fullName = "";
        let grade = bulkGrade;
        let section = bulkSection;

        // Check if tab or comma separated
        if (remaining.includes("\t") || remaining.includes(",")) {
          const parts = remaining.split(/[\t,]+/).map(p => p.trim()).filter(Boolean);
          // Filter out pure small numbers (serial numbers like 1, 2, 3)
          const nonSeqParts = parts.filter(p => !/^\d{1,3}$/.test(p));

          for (const p of nonSeqParts) {
            const detectedGrade = normalizeGrade(p);
            if (detectedGrade) {
              grade = detectedGrade.toString();
            }
            if (p.includes("فصل") || p.includes("شعبة") || ["أ", "ب", "ج", "د", "هـ"].includes(p) || p.endsWith("/ب") || p.endsWith("/أ")) {
              section = normalizeSection(p);
            }
            if (!fullName && p.length >= 4 && !detectedGrade && !p.includes("فصل") && !p.includes("شعبة") && !["أ", "ب", "ج", "د"].includes(p)) {
              fullName = p;
            }
          }

          if (!fullName) {
            const sorted = [...nonSeqParts].sort((a, b) => b.length - a.length);
            fullName = sorted[0] || remaining;
          }
        } else {
          // Space separated line
          if (remaining.includes("فصل ب") || remaining.includes("ثاني ب") || remaining.endsWith(" ب") || remaining.includes("/ب") || remaining.includes("-ب")) {
            section = "ب";
            remaining = remaining.replace(/(فصل\s*ب|ثاني\s*ب|\/ب|-ب|\s+ب$)/g, "").trim();
          } else if (remaining.includes("فصل أ") || remaining.includes("ثاني أ") || remaining.endsWith(" أ") || remaining.includes("/أ") || remaining.includes("-أ")) {
            section = "أ";
            remaining = remaining.replace(/(فصل\s*أ|ثاني\s*أ|\/أ|-أ|\s+أ$)/g, "").trim();
          } else if (remaining.includes("فصل ج") || remaining.includes("ثاني ج") || remaining.endsWith(" ج") || remaining.includes("/ج")) {
            section = "ج";
            remaining = remaining.replace(/(فصل\s*ج|ثاني\s*ج|\/ج|\s+ج$)/g, "").trim();
          } else if (remaining.includes("فصل د") || remaining.includes("ثاني د") || remaining.endsWith(" د") || remaining.includes("/د")) {
            section = "د";
            remaining = remaining.replace(/(فصل\s*د|ثاني\s*د|\/د|\s+د$)/g, "").trim();
          }

          const maybeGrade = normalizeGrade(remaining);
          if (maybeGrade) {
            grade = maybeGrade.toString();
            remaining = remaining.replace(/(الصف\s*الأول|الصف\s*الثاني|الصف\s*الثالث|الصف\s*الرابع|الصف\s*الخامس|الصف\s*السادس|أول|ثاني|ثالث|رابع|خامس|سادس)/g, "").trim();
          }

          fullName = remaining.replace(/^[\t,;:\-\s\d]+|[\t,;:\-\s]+$/g, "").trim();
        }

        fullName = fullName.replace(/^[\d\s\.\-]+/, "").trim();

        if (natId && fullName) {
          await setDoc(doc(db, "students_roster", natId), {
            fullName: fullName,
            grade: grade,
            section: section,
            createdAt: new Date().toISOString()
          });
          successCount++;
          sectionCounts[section] = (sectionCounts[section] || 0) + 1;
        }
      }

      if (successCount > 0) {
        const breakdownStr = Object.entries(sectionCounts)
          .map(([sec, count]) => `فصل (${sec}): ${toIndianNumbers(count)}`)
          .join("، ");
        showNotice(`تم استيراد ${toIndianNumbers(successCount)} طالباً بنجاح (${breakdownStr})`);
        setBulkPasteText("");
        fetchStudentsRoster();
      } else {
        showNotice("لم يتم العثور على أرقام هويات صالحة في النص المنسوخ.");
      }
    } catch (err: any) {
      alert("حدث خطأ أثناء استيراد الطلاب: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          let addedCount = 0;
          const sectionBreakdown: Record<string, number> = {};

          for (const row of rows) {
            const getVal = (patterns: string[]): string => {
              const keys = Object.keys(row);
              for (const k of keys) {
                const cleanK = k.replace(/[\ufeff\s_]/g, "").toLowerCase();
                for (const p of patterns) {
                  if (cleanK.includes(p.toLowerCase())) {
                    const val = row[k];
                    if (val !== undefined && val !== null && String(val).trim() !== "") {
                      return String(val).trim();
                    }
                  }
                }
              }
              return "";
            };

            const rawId = getVal(["هوية", "سجل", "مدني", "national", "id", "رقم_الهوية", "اقامة", "إقامة"]);
            const rawName = getVal(["اسم", "طالب", "تلميذ", "name", "رباعي", "كامل"]);
            const rawGrade = getVal(["صف", "grade", "مرحلة", "دراسي"]);
            const rawSection = getVal(["فصل", "شعبة", "section", "class", "قسم", "فرقة", "رمز"]);

            const cleanId = rawId ? rawId.replace(/\D/g, "") : "";
            const fullName = rawName.trim();
            
            let gradeNorm = normalizeGrade(rawGrade) || normalizeGrade(bulkGrade) || 2;
            let sectionNorm = rawSection ? normalizeSection(rawSection) : normalizeSection(bulkSection);
            
            if (!rawSection && rawGrade) {
              const secFromGrade = normalizeSection(rawGrade);
              if (secFromGrade && secFromGrade !== "أ") {
                sectionNorm = secFromGrade;
              }
            }

            if (cleanId && fullName) {
              await setDoc(doc(db, "students_roster", cleanId), {
                fullName: fullName,
                grade: String(gradeNorm),
                section: sectionNorm,
                createdAt: new Date().toISOString()
              });
              addedCount++;
              sectionBreakdown[sectionNorm] = (sectionBreakdown[sectionNorm] || 0) + 1;
            }
          }

          const breakdownStr = Object.entries(sectionBreakdown)
            .map(([sec, count]) => `فصل (${sec}): ${toIndianNumbers(count)}`)
            .join("، ");

          showNotice(`تم رفع واستيراد ${toIndianNumbers(addedCount)} طالباً بنجاح (${breakdownStr || `فصل ${bulkSection}`})`);
          fetchStudentsRoster();
        } catch (error: any) {
          alert("حدث خطأ أثناء معالجة الملف: " + error.message);
        } finally {
          setLoading(false);
        }
      },
      error: (error) => {
        alert("فشل قراءة الملف: " + error.message);
        setLoading(false);
      }
    });

    // Reset the file input
    e.target.value = '';
  };

  const handleLessonCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          let addedCount = 0;
          for (const row of rows) {
            const title = row["العنوان"] || row["title"] || row["عنوان الدرس"] || row["النص_عنوان"];
            const content = row["النص"] || row["content"] || row["نص الدرس"] || row["المحتوى"];
            const rawGrade = row["الصف"] || row["grade"] || row["الصف الدراسي"];
            const rawSemester = row["الفصل الدراسي"] || row["semester"] || row["الفصل"] || row["الترم"];
            
            if (title && content) {
              const numGrade = normalizeGrade(rawGrade) || 1;
              const grade = getGradeLabel(numGrade);
              const semKey = normalizeSemester(rawSemester);
              const semester = semKey === "2" ? "الفصل الدراسي الثاني" : semKey === "3" ? "الفصل الدراسي الثالث" : semKey === "external" ? "دروس خارجية عن الكتاب" : "الفصل الدراسي الأول";

              // Parse questions if they exist in CSV (up to 10)
              const questions = [];
              for (let i = 1; i <= 10; i++) {
                const qText = row[`سؤال${i}`] || row[`سؤال_${i}`] || row[`q${i}`];
                if (qText) {
                  const opts = [
                    row[`سؤال${i}_خيار1`] || row[`خيار${i}_1`] || row[`q${i}_opt1`],
                    row[`سؤال${i}_خيار2`] || row[`خيار${i}_2`] || row[`q${i}_opt2`],
                    row[`سؤال${i}_خيار3`] || row[`خيار${i}_3`] || row[`q${i}_opt3`],
                    row[`سؤال${i}_خيار4`] || row[`خيار${i}_4`] || row[`q${i}_opt4`]
                  ].filter(Boolean);
                  
                  const correctRaw = row[`سؤال${i}_صحيح`] || row[`صحيح${i}`] || row[`q${i}_correct`];
                  const correctIdx = correctRaw !== undefined ? Math.max(0, parseInt(correctRaw) - 1) : 0;
                  
                  questions.push({
                    text: qText,
                    type: "multiple",
                    options: opts.length > 0 ? opts : ["صحيح", "خطأ"],
                    correct: isNaN(correctIdx) ? 0 : correctIdx
                  });
                }
              }

              await addDoc(collection(db, "lessons"), {
                title: String(title).trim(),
                content: String(content).trim(),
                grade,
                semester,
                questions,
                authorId: profile?.uid || "admin",
                createdAt: new Date().toISOString(),
                isCustom: true
              });
              addedCount++;
            }
          }
          alert(`تم رفع ${toIndianNumbers(addedCount)} درس بنجاح ومزامنته فوراً مع لوحة المعلمين.`);
          fetchCustomLessons();
        } catch (error) {
          alert("حدث خطأ أثناء معالجة ملف الدروس: " + error);
        } finally {
          setLoading(false);
        }
      }
    });
    e.target.value = '';
  };

  const downloadLessonTemplate = () => {
    const headers = "العنوان,النص,الصف,الفصل الدراسي,سؤال1,سؤال1_خيار1,سؤال1_خيار2,سؤال1_خيار3,سؤال1_خيار4,سؤال1_صحيح\n";
    const example = "درس تجريبي,محتوى الدرس هنا,1,الفصل الدراسي الأول,ما عنوان الدرس?,الخيار الأول,الخيار الثاني,الخيار الثالث,الخيار الرابع,1";
    const blob = new Blob(["\uFEFF" + headers + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lessons_template.csv";
    link.click();
  };

  const downloadTemplate = () => {
    const csvContent = "رقم الهوية,اسم الطالب,الصف,الفصل\n1234567890,أحمد محمد,1,أ";
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "students_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // Save edited student
  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    const { originalId, nationalId, fullName, grade, section } = editingStudent;
    if (!nationalId.trim() || !fullName.trim()) {
      showNotice("يرجى إدخال اسم الطالب ورقم الهوية");
      return;
    }

    setLoading(true);
    try {
      const cleanId = nationalId.trim();
      const cleanGrade = normalizeGrade(grade)?.toString() || grade;
      const cleanSection = normalizeSection(section);

      // If ID changed, delete old doc and create new doc
      if (originalId !== cleanId) {
        await deleteDoc(doc(db, "students_roster", originalId));
        // Also update users collection if exists
        const userQ = query(collection(db, "users"), where("nationalId", "==", originalId));
        const userSnap = await getDocs(userQ);
        for (const uDoc of userSnap.docs) {
          await updateDoc(doc(db, "users", uDoc.id), {
            nationalId: cleanId,
            fullName: fullName.trim(),
            grade: cleanGrade,
            section: cleanSection
          });
        }
      } else {
        // Update users collection if exists
        const userQ = query(collection(db, "users"), where("nationalId", "==", cleanId));
        const userSnap = await getDocs(userQ);
        for (const uDoc of userSnap.docs) {
          await updateDoc(doc(db, "users", uDoc.id), {
            fullName: fullName.trim(),
            grade: cleanGrade,
            section: cleanSection
          });
        }
      }

      // Save in students_roster
      await setDoc(doc(db, "students_roster", cleanId), {
        fullName: fullName.trim(),
        grade: cleanGrade,
        section: cleanSection,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setEditingStudent(null);
      showNotice(`تم تعديل وحفظ بيانات الطالب (${fullName.trim()}) بنجاح`);
      fetchStudentsRoster();
    } catch (err: any) {
      console.error("Failed to update student:", err);
      alert("حدث خطأ أثناء حفظ التعديلات: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Safe delete single student (no browser window.confirm block!)
  const handleConfirmDeleteSingle = async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    try {
      const idToDelete = studentToDelete.nationalId;
      await deleteDoc(doc(db, "students_roster", idToDelete));
      
      const userQ = query(collection(db, "users"), where("nationalId", "==", idToDelete));
      const userSnap = await getDocs(userQ);
      for (const uDoc of userSnap.docs) {
        await deleteDoc(doc(db, "users", uDoc.id));
      }

      setSelectedStudentIds(prev => {
        const next = new Set(prev);
        next.delete(idToDelete);
        return next;
      });

      showNotice(`تم حذف الطالب (${studentToDelete.fullName}) بنجاح.`);
      setStudentToDelete(null);
      fetchStudentsRoster();
    } catch (error: any) {
      console.error("Failed to delete student:", error);
      alert("حدث خطأ أثناء حذف الطالب: " + error.message);
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // Safe delete lesson
  const handleConfirmDeleteLesson = async () => {
    if (!lessonToDelete) return;
    setIsDeletingLesson(true);
    try {
      await deleteDoc(doc(db, "lessons", lessonToDelete.id));
      showNotice(`تم حذف الدرس "${lessonToDelete.title}" بنجاح.`);
      setLessonToDelete(null);
      fetchCustomLessons();
    } catch (e: any) {
      console.error("Failed to delete lesson:", e);
      alert("فشل حذف الدرس: " + e.message);
    } finally {
      setIsDeletingLesson(false);
    }
  };

  // Safe delete question from question pool
  const handleConfirmDeleteQuestion = async () => {
    if (!questionToDelete) return;
    setIsDeletingQuestion(true);
    try {
      await deleteDoc(doc(db, "question_pool", questionToDelete.id));
      showNotice("تم حذف السؤال من بنك الأسئلة بنجاح.");
      setQuestionToDelete(null);
      fetchQuestionsPool();
    } catch (e: any) {
      console.error("Failed to delete question:", e);
      alert("فشل حذف السؤال: " + e.message);
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  // Bulk move selected students to another section
  const handleBulkMoveSection = async () => {
    if (selectedStudentIds.size === 0) return;
    setLoading(true);
    try {
      const targetSec = normalizeSection(bulkMoveSection);
      let count = 0;
      for (const natId of selectedStudentIds) {
        await updateDoc(doc(db, "students_roster", natId), {
          section: targetSec,
          updatedAt: new Date().toISOString()
        });

        const userQ = query(collection(db, "users"), where("nationalId", "==", natId));
        const userSnap = await getDocs(userQ);
        for (const uDoc of userSnap.docs) {
          await updateDoc(doc(db, "users", uDoc.id), {
            section: targetSec
          });
        }
        count++;
      }

      showNotice(`تم نقل ${toIndianNumbers(count)} طالباً إلى فصل (${targetSec}) بنجاح!`);
      setSelectedStudentIds(new Set());
      fetchStudentsRoster();
    } catch (err: any) {
      console.error("Bulk move error:", err);
      alert("حدث خطأ أثناء نقل الطلاب: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Bulk delete selected students
  const handleBulkDeleteStudents = async () => {
    if (selectedStudentIds.size === 0) return;
    setLoading(true);
    try {
      let count = 0;
      for (const natId of selectedStudentIds) {
        await deleteDoc(doc(db, "students_roster", natId));
        
        const userQ = query(collection(db, "users"), where("nationalId", "==", natId));
        const userSnap = await getDocs(userQ);
        for (const uDoc of userSnap.docs) {
          await deleteDoc(doc(db, "users", uDoc.id));
        }
        count++;
      }

      showNotice(`تم حذف ${toIndianNumbers(count)} طالباً محدداً بنجاح.`);
      setSelectedStudentIds(new Set());
      setShowBulkDeleteModal(false);
      fetchStudentsRoster();
    } catch (err: any) {
      console.error("Bulk delete error:", err);
      alert("حدث خطأ أثناء الحذف: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectStudent = (natId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(natId)) {
        next.delete(natId);
      } else {
        next.add(natId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = (visibleIds: string[]) => {
    setSelectedStudentIds(prev => {
      const allSelected = visibleIds.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      } else {
        return new Set(visibleIds);
      }
    });
  };

  const handleGenerateLesson = async () => {
    if (!aiTopic) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic, grade: aiGrade }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedLesson(data);
      } else {
        alert("فشل التوليد: " + data.error);
      }
    } catch (error) {
      alert("خطأ في الاتصال بالسيرفر");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveLesson = async () => {
    if (!generatedLesson || !profile) return;
    setLoading(true);
    try {
      const numGrade = normalizeGrade(aiGrade) || 1;
      const lessonData = {
        ...generatedLesson,
        grade: getGradeLabel(numGrade),
        semester: aiSemester || "الفصل الدراسي الأول",
        authorId: profile.uid,
        createdAt: new Date().toISOString(),
        isAI: true,
        isCustom: true
      };
      await addDoc(collection(db, "lessons"), lessonData);
      alert("تم حفظ الدرس بنجاح ومزامنته مع لوحات المعلمين فوراً");
      setGeneratedLesson(null);
      setAiTopic("");
      fetchCustomLessons();
    } catch (error) {
      alert("فشل حفظ الدرس: " + error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNationalId || !newUsername) {
      alert("يرجى إدخال رقم الهوية والاسم");
      return;
    }
    setCreateLoading(true);
    try {
      // Create a secondary app to avoid logging out the current admin
      const secondaryAppName = "SecondaryApp";
      const secondaryApp = getApps().find(app => app.name === secondaryAppName) || initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      
      const syntheticEmail = `${newNationalId.trim()}@staff.local`;
      const syntheticPassword = `staff-${newNationalId.trim()}`;
      
      const result = await createUserWithEmailAndPassword(secondaryAuth, syntheticEmail, syntheticPassword);
      const user = result.user;
      
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        nationalId: newNationalId.trim(),
        username: newUsername,
        fullName: newUsername,
        role: newRole,
        grade: newGrade,
        semester: newSemester,
        section: newSection,
        approved: true,
        xp: 0,
        level: 1,
        streak: 0,
        bestSpeed: 0,
        createdAt: new Date().toISOString(),
      });
      
      // Sign out from secondary app
      await signOut(secondaryAuth);
      
      setShowCreateModal(false);
      setNewNationalId("");
      setNewUsername("");
      fetchUsers();
      alert("تم إنشاء الحساب بنجاح");
    } catch (error: any) {
      alert("فشل إنشاء الحساب: " + error.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleApproval = async (uid: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "users", uid), { approved: !currentStatus });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, approved: !currentStatus } : u));
    } catch (error) {
      console.error("Failed to toggle approval:", error);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, "users", uid));
      setUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (error) {
      console.error("Failed to delete user:", error);
    }
  };

  const handleUpdateRole = async (uid: string, role: "student" | "teacher" | "supervisor" | "general_supervisor") => {
    try {
      await updateDoc(doc(db, "users", uid), { role });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role } : u));
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const handleToggleClass = async (uid: string, grade: string, section: string, currentClasses: string[] = []) => {
    if (profile?.role !== "general_supervisor") return; // Only general supervisors can assign classes
    const classKey = `${grade}-${section}`;
    let newClasses = [...currentClasses];
    if (newClasses.includes(classKey)) {
      newClasses = newClasses.filter(c => c !== classKey);
    } else {
      newClasses.push(classKey);
    }
    
    try {
      await updateDoc(doc(db, "users", uid), { assignedClasses: newClasses });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, assignedClasses: newClasses } : u));
    } catch (error) {
      alert("فشل تحديث الفصول: " + error);
    }
  };

  const filteredUsers = users.filter(u => {
    const searchMatch = !searchTerm || u.username.toLowerCase().includes(searchTerm.toLowerCase()) || u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || u.phone?.includes(searchTerm);
    
    // Teacher filtering - only restrict students
    if (profile?.role === "teacher" && u.role === "student") {
      const classKey = `${u.grade}-${u.section}`;
      if (!profile.assignedClasses?.includes(classKey)) return false;
    }

    const filterMatch = filter === "all" || 
                       (filter === "approved" ? u.approved : 
                        filter === "pending" ? !u.approved : 
                        filter === "teacher" ? u.role === "teacher" : 
                        filter === "student" ? u.role === "student" : 
                        u.role === "student");
    return searchMatch && filterMatch;
  });

  return (
    <div className="space-y-8 mt-8 pb-20">
      {/* Header */}
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-6 border border-[var(--border)] shadow-md flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 text-[var(--primary)] font-bold">
          <ShieldCheck size={32} />
          <div>
            <h2 className="text-2xl font-bold">لوحة التحكم</h2>
            <p className="text-xs text-[var(--text-light)]">
              {profile?.role === "general_supervisor" ? "إدارة كاملة للنظام" : "متابعة الطلاب والدروس"}
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex bg-[var(--bg)] p-1 rounded-full border border-[var(--border)] overflow-x-auto max-w-[300px] sm:max-w-none scrollbar-hide">
            {profile?.role !== "student" && (
              <>
                <button onClick={() => setActiveTab("users")} className={cn("px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap", activeTab === "users" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}>المستخدمين</button>
                <button onClick={() => setActiveTab("tasks")} className={cn("px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap", activeTab === "tasks" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}>المتابعة</button>
                <button onClick={() => setActiveTab("lessons")} className={cn("px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap", activeTab === "lessons" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}>الدروس</button>
                <button onClick={() => setActiveTab("questions")} className={cn("px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap", activeTab === "questions" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}>بنك الأسئلة</button>
                <button onClick={() => setActiveTab("classroom")} className={cn("px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap", activeTab === "classroom" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}>الفصل الذكي</button>
                <button onClick={() => setActiveTab("visits")} className={cn("px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap", activeTab === "visits" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}>الزيارات</button>
              </>
            )}
            {profile?.role === "general_supervisor" && (
              <button onClick={() => setActiveTab("studentsDB")} className={cn("px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap", activeTab === "studentsDB" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}>قاعدة الطلاب</button>
            )}
          </div>
          {activeTab === "users" && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCreateModal(true)} 
              className="bg-[var(--primary)] text-white px-6 py-2 rounded-full font-bold hover:shadow-lg transition-all flex items-center gap-2"
            >
              <UserPlus size={18} />
              <span>إنشاء حساب</span>
            </motion.button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "users" && (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-6 border border-[var(--border)] shadow-md flex items-center gap-6">
                <div className="w-14 h-14 bg-primary/10 text-[var(--primary)] rounded-full flex items-center justify-center"><Users size={28} /></div>
                <div>
                  <div className="text-3xl font-black text-[var(--primary-dark)]">{toIndianNumbers(users.length)}</div>
                  <div className="text-xs text-[var(--text-light)] font-bold">إجمالي المستخدمين</div>
                </div>
              </div>
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-6 border border-[var(--border)] shadow-md flex items-center gap-6">
                <div className="w-14 h-14 bg-green-50 text-green-500 rounded-full flex items-center justify-center"><UserCheck size={28} /></div>
                <div>
                  <div className="text-3xl font-black text-green-600">{toIndianNumbers(users.filter(u => u.approved).length)}</div>
                  <div className="text-xs text-[var(--text-light)] font-bold">مفعلين</div>
                </div>
              </div>
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-6 border border-[var(--border)] shadow-md flex items-center gap-6">
                <div className="w-14 h-14 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center"><Filter size={28} /></div>
                <div>
                  <div className="text-3xl font-black text-orange-600">{toIndianNumbers(users.filter(u => !u.approved).length)}</div>
                  <div className="text-xs text-[var(--text-light)] font-bold">بانتظار التفعيل</div>
                </div>
              </div>
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-6 border border-[var(--border)] shadow-md flex items-center gap-6">
                <div className="w-14 h-14 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center"><GraduationCap size={28} /></div>
                <div>
                  <div className="text-3xl font-black text-purple-600">{toIndianNumbers(users.filter(u => u.role === "teacher").length)}</div>
                  <div className="text-xs text-[var(--text-light)] font-bold">المعلمين</div>
                </div>
              </div>
            </div>
            {profile?.role === "general_supervisor" && (
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                  <UserPlus size={24} /> 
                  <span>إضافة مستخدم سريع</span>
                </h3>
                <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  <input type="text" placeholder="الاسم الكامل" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none" />
                  <input type="text" placeholder="رقم الهوية" value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} required className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none" />
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as any)} className="px-4 py-2 rounded-lg border bg-[var(--bg)]">
                    <option value="teacher">معلم</option>
                    <option value="supervisor">مشرف</option>
                    <option value="general_supervisor">مشرف عام</option>
                    <option value="student">طالب (تسجيل مباشر)</option>
                  </select>
                  {newRole === "student" && (
                    <>
                      <select value={newGrade} onChange={(e) => setNewGrade(e.target.value)} className="px-4 py-2 rounded-lg border bg-[var(--bg)]">
                        <option value="">الصف</option>
                        {[1,2,3,4,5,6].map(g => <option key={g} value={g.toString()}>الصف {toIndianNumbers(g)}</option>)}
                      </select>
                      <select value={newSection} onChange={(e) => setNewSection(e.target.value)} className="px-4 py-2 rounded-lg border bg-[var(--bg)]">
                        <option value="">الفصل</option>
                        {["أ", "ب", "ج", "د"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </>
                  )}
                  <button type="submit" disabled={createLoading} className="lg:col-span-4 xl:col-span-1 py-2 bg-[var(--primary)] text-white rounded-lg font-bold hover:shadow-md transition-all flex items-center justify-center gap-2">
                    {createLoading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    إضافة
                  </button>
                </form>
              </div>
            )}

            {/* Metrics Section for Teachers/Admins */}
            <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
              <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                <ChartLine size={24} /> 
                <span>تحليل الأداء للمجموعة الحالية</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[var(--bg)] p-3 rounded-2xl border border-[var(--border)] text-center">
                  <div className="text-xl font-black text-[var(--primary)] tabular-nums">
                    {toIndianNumbers(filteredUsers.filter(u => u.role === "student").length)}
                  </div>
                  <div className="text-[9px] font-bold text-[var(--text-light)] mt-0.5">عدد الطلاب المستهدفين</div>
                </div>
                <div className="bg-[var(--bg)] p-3 rounded-2xl border border-[var(--border)] text-center">
                  <div className="text-xl font-black text-[var(--success)] tabular-nums">
                    {toIndianNumbers(filteredUsers.filter(u => u.approved).length)}
                  </div>
                  <div className="text-[9px] font-bold text-[var(--text-light)] mt-0.5">الطلاب النشطين</div>
                </div>
                <div className="bg-[var(--bg)] p-3 rounded-2xl border border-[var(--border)] text-center">
                  <div className="text-xl font-black text-[var(--accent)] tabular-nums">
                    {toIndianNumbers(filteredUsers.filter(u => u.needsPasswordChange).length)}
                  </div>
                  <div className="text-[9px] font-bold text-[var(--text-light)] mt-0.5">طلاب لم يغيروا كلمة المرور</div>
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-[var(--card-bg)] rounded-[var(--radius-md)] p-8 border border-[var(--border)] shadow-md space-y-8">
              <div className="flex items-center justify-between flex-wrap gap-6">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2"><Users size={24} /> قائمة المستخدمين</h3>
                <div className="flex items-center gap-4 flex-wrap w-full sm:w-auto">
                  <div className="flex items-center gap-3 bg-[var(--bg)] px-4 py-2 rounded-full border border-[var(--border)] flex-1 sm:w-64">
                    <Search size={18} className="text-[var(--text-light)]" />
                    <input type="text" placeholder="بحث..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full" />
                  </div>
                  <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-[var(--bg)] px-4 py-2 rounded-full border border-[var(--border)] text-sm font-bold outline-none focus:border-[var(--primary)]">
                    <option value="all">الكل</option>
                    <option value="approved">مفعل</option>
                    <option value="pending">غير مفعل</option>
                    <option value="teacher">المعلمين</option>
                    <option value="student">الطلاب</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center text-sm">
                  <thead>
                    <tr className="bg-[var(--bg)] text-[var(--text)] border-b-2 border-[var(--border)]">
                      <th className="p-2 font-bold">المستخدم</th>
                      <th className="p-2 font-bold">الرتبة</th>
                      <th className="p-2 font-bold">الصف/الفصل</th>
                      <th className="p-2 font-bold">الفصول المسندة</th>
                      <th className="p-2 font-bold">الحالة</th>
                      <th className="p-2 font-bold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={6} className="p-12 text-center">لا يوجد مستخدمين</td></tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.uid} className="border-b border-[var(--border)] hover:bg-primary/5 transition-all">
                          <td className="p-2 text-xs">
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-6 h-6 rounded-full bg-[var(--bg)] flex items-center justify-center text-[var(--primary)] font-bold text-[10px]">
                                {u.username[0].toUpperCase()}
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-[10px]">{u.username}</div>
                                <div className="text-[8px] text-[var(--text-light)]">{u.fullName || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <select 
                              value={u.role} 
                              onChange={(e) => handleUpdateRole(u.uid, e.target.value as any)}
                              className="bg-transparent border-none text-[10px] font-bold text-[var(--primary)] cursor-pointer"
                              disabled={profile?.role !== "general_supervisor"}
                            >
                              <option value="student">طالب</option>
                              <option value="teacher">معلم</option>
                              <option value="supervisor">مشرف</option>
                              <option value="general_supervisor">مشرف عام</option>
                            </select>
                          </td>
                          <td className="p-2">
                            {u.role === "student" ? (
                              <div className="text-[10px]">
                                {u.grade ? `الصف ${toIndianNumbers(u.grade)}` : "—"} / {u.section ? `فصل ${u.section}` : "—"}
                              </div>
                            ) : "—"}
                          </td>
                          <td className="p-2">
                            {u.role === "teacher" ? (
                              <div className="flex flex-wrap gap-1 justify-center max-w-[150px] mx-auto">
                                {[1, 2, 3, 4, 5, 6].map(g => (
                                  ["أ", "ب", "ج", "د"].map(s => {
                                    const key = `${g}-${s}`;
                                    const active = u.assignedClasses?.includes(key);
                                    return (
                                      <button key={key} onClick={() => handleToggleClass(u.uid, g.toString(), s, u.assignedClasses)} className={cn("text-[7px] px-1 py-0.5 rounded-full border transition-all", active ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--bg)] text-[var(--text-light)] border-[var(--border)]")}>
                                        {toIndianNumbers(g)}-{s}
                                      </button>
                                    );
                                  })
                                ))}
                              </div>
                            ) : "—"}
                          </td>
                          <td className="p-2">
                            <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold text-white", u.approved ? "bg-[var(--success)]" : "bg-[var(--warning)]")}>
                              {u.approved ? "مفعل" : "غير مفعل"}
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center justify-center gap-3">
                              {u.role === "student" && (
                                <button onClick={() => navigate("/reports", { state: { userId: u.uid, username: u.username } })} className="text-xs bg-primary/10 text-[var(--primary)] px-3 py-1 rounded-full font-bold">تقارير</button>
                              )}
                              <button onClick={() => handleToggleApproval(u.uid, u.approved)} className={cn(u.approved ? "text-[var(--success)]" : "text-[var(--warning)]")}>
                                {u.approved ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                              </button>
                              {profile?.role === "general_supervisor" && (
                                <button onClick={() => handleDeleteUser(u.uid)} className="text-[var(--accent)]"><Trash2 size={20} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "tasks" && (
          <motion.div key="tasks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                  <ListTodo size={24} /> 
                  <span>مهام المتابعة التربوية</span>
                </h3>
                <div className="bg-[var(--bg)] px-4 py-1.5 rounded-full text-xs font-bold text-[var(--text-light)]">
                  وجدنا {toIndianNumbers(tasks.length)} حالة تحتاج لمتابعة
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tasks.map((task, i) => (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} key={task.student.uid} className="bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)] shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                    <div className={cn("absolute top-0 right-0 w-1 h-full", !task.result ? "bg-orange-500" : "bg-red-500")}></div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-[var(--primary)] font-black text-xl border-2 border-[var(--border)]">
                        {task.student.username[0].toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-[var(--text)]">{task.student.fullName || task.student.username}</h4>
                        <p className="text-[10px] text-[var(--text-light)]">الصف {toIndianNumbers(task.student.grade)} - فصل {task.student.section}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                      {!task.result ? (
                        <div className="bg-orange-50 text-orange-700 p-3 rounded-2xl flex items-start gap-2">
                          <AlertIcon size={16} className="mt-0.5 shrink-0" />
                          <p className="text-xs">لم يقم الطالب بأداء أي اختبارات قراءة بعد. يحتاج لتحفيز للمشاركة.</p>
                        </div>
                      ) : (
                        <div className="bg-red-50 text-red-700 p-3 rounded-2xl flex items-start gap-2">
                          <AlertIcon size={16} className="mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-bold">أداء منخفض في: {task.result.lessonTitle}</p>
                            <p className="text-[10px] opacity-80 mt-1 italic">الدرجة: {toIndianNumbers(task.result.score)}% (بتاريخ: {new Date(task.result.date).toLocaleDateString("ar-EG")})</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => navigate("/reports", { state: { userId: task.student.uid, username: task.student.username } })} className="flex-1 py-2 bg-white border border-[var(--border)] rounded-full text-xs font-bold hover:bg-gray-50">التفاصيل</button>
                      <button className="flex-1 py-2 bg-[var(--primary)] text-white rounded-full text-xs font-bold hover:shadow-md">إرسال تنبيه</button>
                    </div>
                  </motion.div>
                ))}
                {tasks.length === 0 && !loading && (
                  <div className="col-span-full py-20 text-center space-y-4">
                    <CheckCircle2 size={64} className="mx-auto text-[var(--success)] opacity-20" />
                    <p className="text-[var(--text-light)] font-bold">ممتاز! جميع طلابك في حالة جيدة حالياً.</p>
                  </div>
                )}
                {loading && <div className="col-span-full py-20 text-center"><Loader2 className="animate-spin mx-auto text-[var(--primary)]" /></div>}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "lessons" && (
          <motion.div key="lessons" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
              <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                <Upload size={24} /> 
                <span>إضافة الدروس والأسئلة دفعة واحدة</span>
              </h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-4">
                    <h4 className="font-black text-blue-800">نموذج ملف CSV للدروس:</h4>
                    <div className="bg-white p-4 rounded-2xl border border-blue-200 overflow-x-auto shadow-inner">
                      <table className="text-[10px] text-right w-full font-bold">
                        <thead className="bg-blue-50">
                          <tr className="border-b border-blue-100">
                            <th className="p-2">العنوان</th>
                            <th className="p-2">النص</th>
                            <th className="p-2">الصف</th>
                            <th className="p-2">الفصل الدراسي</th>
                            <th className="p-2">سؤال١</th>
                            <th className="p-2">خيار١</th>
                            <th className="p-2">صحيح</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-blue-50">
                            <td className="p-2 truncate max-w-[80px]">نص القراءة</td>
                            <td className="p-2 truncate max-w-[100px]">المحتوى...</td>
                            <td className="p-2">1</td>
                            <td className="p-2 text-[8px]">الفصل الأول</td>
                            <td className="p-2">ما المعنى؟</td>
                            <td className="p-2">خيار أ</td>
                            <td className="p-2">1</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-blue-600 font-bold">الأعمدة المطلوبة (العناوين في أول صف):</p>
                      <p className="text-[9px] text-blue-500 bg-white/50 p-2 rounded-lg leading-relaxed">
                        العنوان، النص، الصف، الفصل الدراسي، سؤال١، سؤال١_خيار١، سؤال١_خيار٢، سؤال١_خيار٣، سؤال١_خيار٤، سؤال١_صحيح (١-٤)
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <button onClick={downloadLessonTemplate} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                        <FileDown size={16} />
                        تحميل القالب
                      </button>
                      <label className="flex-1 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-xl font-bold text-xs hover:bg-blue-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                        <Upload size={16} />
                        رفع ملف CSV
                        <input type="file" accept=".csv" onChange={handleLessonCSVUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-purple-50 p-6 rounded-3xl border border-purple-100 space-y-4">
                    <h4 className="font-black text-purple-800 flex items-center gap-2">
                      <Sparkles size={20} />
                      توليد درس بالذكاء الاصطناعي
                    </h4>
                    <div className="space-y-3">
                      <input 
                        type="text" 
                        placeholder="أدخل موضوع الدرس (مثلاً: أهمية الصدق)" 
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-purple-200 outline-none focus:border-purple-500 bg-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select 
                          value={aiGrade} 
                          onChange={(e) => setAiGrade(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-purple-200 bg-white font-bold text-sm"
                        >
                          {[1,2,3,4,5,6].map(g => <option key={g} value={g.toString()}>الصف {toIndianNumbers(g)}</option>)}
                        </select>
                        <select 
                          value={aiSemester} 
                          onChange={(e) => setAiSemester(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-purple-200 bg-white font-bold text-sm"
                        >
                          <option value="الفصل الدراسي الأول">الفصل الدراسي الأول</option>
                          <option value="الفصل الدراسي الثاني">الفصل الدراسي الثاني</option>
                          <option value="الفصل الدراسي الثالث">الفصل الدراسي الثالث</option>
                          <option value="دروس خارجية عن الكتاب">دروس خارجية عن الكتاب</option>
                        </select>
                      </div>
                      <button 
                        onClick={handleGenerateLesson}
                        disabled={isGenerating || !aiTopic}
                        className="w-full py-4 bg-purple-600 text-white rounded-xl font-black hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                        <span>توليد الدرس والأسئلة الآن</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>


            {/* Quick Add Lesson */}
            <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
              <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                <BookOpen size={24} /> 
                <span>إضافة درس يدوي سريع</span>
              </h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const title = formData.get("title") as string;
                const content = formData.get("content") as string;
                const lessonGradeRaw = formData.get("grade") as string;
                const lessonSemester = (formData.get("semester") as string) || "الفصل الدراسي الأول";
                if (!title || !content || !lessonGradeRaw) return;
                setLoading(true);
                try {
                  const numGrade = normalizeGrade(lessonGradeRaw) || 1;
                  await addDoc(collection(db, "lessons"), {
                    title: title.trim(),
                    content: content.trim(),
                    grade: getGradeLabel(numGrade),
                    semester: lessonSemester,
                    authorId: profile?.uid || "admin",
                    createdAt: new Date().toISOString(),
                    questions: [],
                    isCustom: true
                  });
                  alert("تم حفظ الدرس بنجاح ومزامنته مع لوحات المعلمين فوراً");
                  e.currentTarget.reset();
                  fetchCustomLessons();
                } catch (err) {
                  alert("فشل الحفظ: " + err);
                } finally {
                  setLoading(false);
                }
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input name="title" type="text" placeholder="عنوان الدرس" required className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)] font-bold" />
                  <select name="grade" required className="px-4 py-2 rounded-lg border bg-[var(--bg)] outline-none focus:border-[var(--primary)] font-bold">
                    <option value="">حدد الصف...</option>
                    {[1,2,3,4,5,6].map(g => <option key={g} value={g.toString()}>الصف {toIndianNumbers(g)}</option>)}
                  </select>
                  <select name="semester" required className="px-4 py-2 rounded-lg border bg-[var(--bg)] outline-none focus:border-[var(--primary)] font-bold">
                    <option value="الفصل الدراسي الأول">الفصل الدراسي الأول</option>
                    <option value="الفصل الدراسي الثاني">الفصل الدراسي الثاني</option>
                    <option value="الفصل الدراسي الثالث">الفصل الدراسي الثالث</option>
                    <option value="دروس خارجية عن الكتاب">دروس خارجية عن الكتاب</option>
                  </select>
                </div>
                <textarea name="content" placeholder="نص القراءة للدرس..." required className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)] min-h-[140px] leading-relaxed" />
                <button type="submit" disabled={loading} className="w-full py-3 bg-[var(--primary)] text-white rounded-xl font-bold hover:shadow-md transition-all">إضافة الدرس للمكتبة ومشاركته مع المعلمين</button>
              </form>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8">
              {/* Lesson Creator */}
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                  <Sparkles size={24} className="text-orange-500" /> 
                  <span>إنشاء درس ذكي (AI)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <input type="text" placeholder="موضوع الدرس (مثلاً: الفضاء، ترشيد المياه...)" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} className="w-full px-6 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)] font-bold text-sm" />
                  </div>
                  <select value={aiGrade} onChange={(e) => setAiGrade(e.target.value)} className="px-4 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none font-bold text-sm">
                    {[1,2,3,4,5,6].map(g => <option key={g} value={g}>الصف {toIndianNumbers(g)}</option>)}
                  </select>
                  <select value={aiSemester} onChange={(e) => setAiSemester(e.target.value)} className="px-4 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none font-bold text-sm">
                    <option value="الفصل الدراسي الأول">الفصل الأول</option>
                    <option value="الفصل الدراسي الثاني">الفصل الثاني</option>
                    <option value="الفصل الدراسي الثالث">الفصل الثالث</option>
                    <option value="دروس خارجية عن الكتاب">دروس خارجية</option>
                  </select>
                </div>
                <button onClick={handleGenerateLesson} disabled={isGenerating || !aiTopic} className="w-full py-4 bg-orange-600 text-white rounded-full font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                  <span>توليد الدرس والأسئلة بواسطة الذكاء الاصطناعي</span>
                </button>

                {generatedLesson && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 border-t pt-8 space-y-6">
                    <div className="bg-[var(--bg)] p-6 rounded-3xl border-2 border-orange-100 relative group">
                      <h4 className="text-2xl font-black text-[var(--primary)] mb-4">{generatedLesson.title}</h4>
                      <div className="text-sm leading-relaxed text-[var(--text)] line-clamp-4">{generatedLesson.content}</div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] to-transparent flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => alert(generatedLesson.content)} className="bg-white px-4 py-2 rounded-full text-xs font-bold shadow-md border">قراءة النص كاملاً</button>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h5 className="font-bold text-sm">الأسئلة المقترحة ({toIndianNumbers(generatedLesson.questions?.length || 0)})</h5>
                      {generatedLesson.questions?.map((q: any, idx: number) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border text-xs flex items-center justify-between">
                          <span>{toIndianNumbers(idx + 1)}. {q.text}</span>
                          <span className="text-green-600 font-bold">({toIndianNumbers(q.options?.length)} خيارات)</span>
                        </div>
                      ))}
                    </div>

                    <button onClick={handleSaveLesson} className="w-full py-4 bg-[var(--success)] text-white rounded-full font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2">
                       <Plus size={18} />
                       <span>حفظ الدرس في المكتبة</span>
                    </button>
                  </motion.div>
                )}
              </div>

              {/* Custom Lessons List */}
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                  <BookOpen size={24} /> 
                  <span>الدروس المضافة</span>
                </h3>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
                  {lessonsList.map(l => (
                    <div key={l.id} className="bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)] flex items-center justify-between group hover:border-[var(--primary)] transition-all">
                      <div>
                        <h4 className="font-bold text-sm line-clamp-1">{l.title}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] bg-primary/10 text-[var(--primary)] px-2 py-0.5 rounded-full font-bold">الصف {toIndianNumbers(l.grade)}</span>
                          {l.isAI && <span className="text-[10px] text-orange-600 font-black flex items-center gap-0.5"><Sparkles size={8} /> AI</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => alert(`العنوان: ${l.title}\nالصف: ${l.grade}\nالفصل الدراسي: ${l.semester || "غير محدد"}\n\nالنص:\n${l.content}`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                          title="عرض النص"
                        >
                          <BookOpen size={16} />
                        </button>
                        <button 
                          onClick={() => setLessonToDelete({ id: l.id, title: l.title })}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-all cursor-pointer"
                          title="حذف الدرس"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {lessonsList.length === 0 && !loading && (
                    <div className="text-center py-20 text-[var(--text-light)]">لا توجد دروس مضافة حالياً</div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {activeTab === "studentsDB" && (profile?.role === "general_supervisor" || profile?.role === "supervisor") && (
          <motion.div key="studentsDB" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            
            {/* 1. الأداة الأسهل والأسرع: اللصق المباشر من نظام نور أو Excel */}
            <div className="bg-[var(--card-bg)] rounded-3xl p-6 sm:p-8 border border-[var(--border)] shadow-md space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                    <Sparkles size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">
                      الطريقة الأسرع: استيراد ولصق بيانات الطلاب مباشرة (نظام نور / Excel)
                    </h3>
                    <p className="text-xs text-gray-500 font-bold">
                      حدد الصف والفصل، ثم انسخ قائمة الطلاب من نظام نور أو ملف الإكسل والصقها هنا بضغطة زر واحدة
                    </p>
                  </div>
                </div>
                <span className="bg-emerald-50 text-emerald-700 text-xs font-black px-3 py-1 rounded-full border border-emerald-200">
                  الأسهل لمديري المدارس والمعلمين
                </span>
              </div>

              {/* الصف والشعبة المستهدفة */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)]">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">الصف الدراسي:</label>
                  <select 
                    value={bulkGrade} 
                    onChange={e => setBulkGrade(e.target.value)} 
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-black outline-none focus:border-blue-500"
                  >
                    {[1, 2, 3, 4, 5, 6].map(g => (
                      <option key={g} value={g.toString()}>{getGradeLabel(g)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">الفصل / الشعبة:</label>
                  <select 
                    value={bulkSection} 
                    onChange={e => setBulkSection(e.target.value)} 
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-black outline-none focus:border-blue-500"
                  >
                    {["أ", "ب", "ج", "د", "هـ"].map(s => (
                      <option key={s} value={s}>فصل {s}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <p className="text-[11px] text-gray-500 font-bold leading-relaxed">
                    💡 يمكنك نسخ عمود رقم الهوية واسم الطالب مباشرة من جدول نظام نور ولصقه أدناه.
                  </p>
                </div>
              </div>

              {/* مربع النص للصق المباشر */}
              <div className="space-y-2">
                <textarea
                  rows={6}
                  value={bulkPasteText}
                  onChange={e => setBulkPasteText(e.target.value)}
                  placeholder={`الصق بيانات الطلاب هنا مباشرة، مثال:\n1092837465  محمد أحمد العلي\n1092837466  خالد سعد القحطاني\n1092837467  عبدالله فهد العمري`}
                  className="w-full p-4 rounded-2xl border border-gray-200 bg-white text-xs font-bold font-mono outline-none focus:border-blue-500 leading-relaxed"
                />
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-gray-400 font-bold">
                    عدد الأسطر المكتوبة: {toIndianNumbers(bulkPasteText.split(/\r?\n/).filter(l => l.trim()).length)} طالب
                  </span>
                  <button
                    onClick={handleBulkPasteStudents}
                    disabled={loading || !bulkPasteText.trim()}
                    className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    <span>إضافة جميع هؤلاء الطلاب فوراً إلى قاعدة البيانات</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. الخيار الثاني: رفع ملف Excel / CSV أو إضافة طالب مفرد */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* رفع ملف CSV / Excel */}
              <div className="bg-[var(--card-bg)] rounded-3xl p-6 border border-[var(--border)] shadow-md space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Upload size={20} className="text-blue-600" />
                    <span>رفع ملف إكسل أو CSV جاهز</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-bold mt-1">
                    يتعرف النظام تلقائياً على أعمدة نظام نور (السجل المدني، اسم الطالب، الصف، الفصل)
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button onClick={downloadTemplate} className="py-2.5 px-4 bg-white border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center justify-center gap-2 shadow-2xs">
                    <FileDown size={14} /> <span>تحميل قالب Excel جاهز</span>
                  </button>
                  <label className="cursor-pointer py-2.5 px-5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-xs">
                    <Upload size={14} />
                    <span>اختر ملف CSV للرفع</span>
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={loading} />
                  </label>
                </div>
              </div>

              {/* إضافة طالب واحد يدوياً */}
              <div className="bg-[var(--card-bg)] rounded-3xl p-6 border border-[var(--border)] shadow-md space-y-3">
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <Plus size={20} className="text-purple-600" />
                  <span>إضافة طالب واحد يدوياً</span>
                </h3>
                <form onSubmit={handleAddStudentToRoster} className="grid grid-cols-2 gap-2.5">
                  <input type="text" placeholder="رقم الهوية (١٠ أرقام)" value={newNationalId} onChange={e => setNewNationalId(e.target.value)} required className="col-span-2 px-3 py-2 rounded-xl border border-gray-200 bg-[var(--bg)] text-xs font-bold outline-none" />
                  <input type="text" placeholder="اسم الطالب كاملاً" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required className="col-span-2 px-3 py-2 rounded-xl border border-gray-200 bg-[var(--bg)] text-xs font-bold outline-none" />
                  <select value={newStudentGrade} onChange={e => setNewStudentGrade(e.target.value)} required className="px-3 py-2 rounded-xl border border-gray-200 bg-[var(--bg)] text-xs font-bold outline-none">
                    <option value="">اختر الصف</option>
                    {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g.toString()}>{getGradeLabel(g)}</option>)}
                  </select>
                  <select value={newStudentSection} onChange={e => setNewStudentSection(e.target.value)} required className="px-3 py-2 rounded-xl border border-gray-200 bg-[var(--bg)] text-xs font-bold outline-none">
                    <option value="">الفصل</option>
                    {["أ", "ب", "ج", "د", "هـ"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="submit" disabled={loading} className="col-span-2 py-2 bg-purple-600 text-white rounded-xl font-black text-xs hover:bg-purple-700 transition-all shadow-xs">
                    إضافة الطالب
                  </button>
                </form>
              </div>
            </div>

            {/* 3. سجل الطلاب المعتمدين في المدرسة مع التصفية والبحث والإدارة المتقدمة */}
            <div className="bg-[var(--card-bg)] rounded-3xl p-6 sm:p-8 border border-[var(--border)] shadow-md space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Database size={22} className="text-blue-600" />
                  <h3 className="text-lg font-black text-gray-900">سجل طلاب المدرسة المضافين</h3>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-black border border-blue-100">
                    {toIndianNumbers(studentsRoster.length)} طالب مسجل
                  </span>
                </div>

                {/* تصفية وبحث في الطلاب */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* فلترة الصف */}
                  <select
                    value={studentRosterGradeFilter}
                    onChange={e => setStudentRosterGradeFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-black outline-none"
                  >
                    <option value="all">جميع الصفوف</option>
                    {[1, 2, 3, 4, 5, 6].map(g => (
                      <option key={g} value={g.toString()}>{getGradeLabel(g)}</option>
                    ))}
                  </select>

                  {/* فلترة الفصل / الشعبة */}
                  <select
                    value={studentRosterSectionFilter}
                    onChange={e => setStudentRosterSectionFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-black outline-none"
                  >
                    <option value="all">جميع الفصول</option>
                    {["أ", "ب", "ج", "د", "هـ"].map(s => (
                      <option key={s} value={s}>فصل {s}</option>
                    ))}
                  </select>

                  <div className="relative min-w-[160px]">
                    <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={studentRosterSearch}
                      onChange={e => setStudentRosterSearch(e.target.value)}
                      placeholder="بحث بالاسم أو الهوية..."
                      className="w-full pr-7 pl-2 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold outline-none focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* شريط الإجراءات الجماعية عند تحديد طلاب */}
              {selectedStudentIds.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={18} className="text-blue-700" />
                    <span className="text-xs font-black text-blue-900">
                      تم تحديد {toIndianNumbers(selectedStudentIds.size)} طالباً
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* أداة سريعة لنقل الطلاب المحددين إلى فصل آخر (حل مشكلة ثاني أ وثاني ب) */}
                    <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-blue-200 shadow-2xs">
                      <span className="text-xs font-bold text-gray-600 px-1">نقل المحددين إلى:</span>
                      <select
                        value={bulkMoveSection}
                        onChange={e => setBulkMoveSection(e.target.value)}
                        className="px-2 py-1 text-xs font-black rounded-lg border border-gray-200 outline-none bg-blue-50/50"
                      >
                        {["أ", "ب", "ج", "د", "هـ"].map(s => (
                          <option key={s} value={s}>فصل {s}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkMoveSection}
                        disabled={loading}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                      >
                        <ArrowRightLeft size={13} />
                        <span>تطبيق النقل</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setShowBulkDeleteModal(true)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                    >
                      <Trash2 size={13} />
                      <span>حذف المحددين</span>
                    </button>

                    <button
                      onClick={() => setSelectedStudentIds(new Set())}
                      className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-bold"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>
              )}

              {/* جدول الطلاب */}
              {(() => {
                const visibleStudents = studentsRoster.filter(s => {
                  const gradeMatch = studentRosterGradeFilter === "all" || normalizeGrade(s.grade)?.toString() === studentRosterGradeFilter;
                  const sectionMatch = studentRosterSectionFilter === "all" || normalizeSection(s.section) === studentRosterSectionFilter;
                  const nameMatch = !studentRosterSearch || 
                    (s.fullName || "").toLowerCase().includes(studentRosterSearch.toLowerCase()) ||
                    String(s.nationalId || "").includes(studentRosterSearch);
                  return gradeMatch && sectionMatch && nameMatch;
                });

                const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every(s => selectedStudentIds.has(s.nationalId));

                return (
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto pr-1">
                    <table className="w-full text-center text-xs">
                      <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                        <tr className="text-gray-600">
                          <th className="p-2.5 w-10">
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={() => handleSelectAllVisible(visibleStudents.map(s => s.nationalId))}
                              className="rounded text-blue-600 focus:ring-0 cursor-pointer w-4 h-4"
                              title="تحديد كل الطلاب الظاهرين"
                            />
                          </th>
                          <th className="p-2.5 font-black">رقم الهوية</th>
                          <th className="p-2.5 font-black">اسم الطالب</th>
                          <th className="p-2.5 font-black">الصف</th>
                          <th className="p-2.5 font-black">الفصل / الشعبة</th>
                          <th className="p-2.5 font-black">تاريخ الإضافة</th>
                          <th className="p-2.5 font-black">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleStudents.map(s => {
                          const isSelected = selectedStudentIds.has(s.nationalId);
                          const sec = normalizeSection(s.section);
                          const secBadgeClass = 
                            sec === "أ" ? "bg-blue-50 text-blue-700 border-blue-200" :
                            sec === "ب" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            sec === "ج" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-purple-50 text-purple-700 border-purple-200";

                          return (
                            <tr 
                              key={s.nationalId} 
                              className={cn(
                                "border-b border-gray-100 hover:bg-blue-50/40 transition-all",
                                isSelected && "bg-blue-50/60"
                              )}
                            >
                              <td className="p-2.5">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectStudent(s.nationalId)}
                                  className="rounded text-blue-600 focus:ring-0 cursor-pointer w-4 h-4"
                                />
                              </td>
                              <td className="p-2.5 font-mono font-bold text-gray-900">{toIndianNumbers(s.nationalId)}</td>
                              <td className="p-2.5 font-black text-gray-900">{s.fullName}</td>
                              <td className="p-2.5 text-blue-700 font-black">{getGradeLabel(normalizeGrade(s.grade) || 1)}</td>
                              <td className="p-2.5">
                                <span className={cn("px-2.5 py-0.5 rounded-full font-black text-xs border inline-block", secBadgeClass)}>
                                  فصل {sec}
                                </span>
                              </td>
                              <td className="p-2.5 text-[11px] text-gray-400">
                                {s.createdAt ? new Date(s.createdAt).toLocaleDateString("ar-EG") : "-"}
                              </td>
                              <td className="p-2.5">
                                <div className="flex items-center justify-center gap-1">
                                  {/* زر تعديل الطالب */}
                                  <button 
                                    onClick={() => setEditingStudent({
                                      originalId: s.nationalId,
                                      nationalId: s.nationalId,
                                      fullName: s.fullName,
                                      grade: String(normalizeGrade(s.grade) || 1),
                                      section: normalizeSection(s.section)
                                    })}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-1.5 rounded-lg transition-all"
                                    title="تعديل بيانات الطالب (الصف / الفصل / الاسم)"
                                  >
                                    <Pencil size={15} />
                                  </button>

                                  {/* زر حذف الطالب بدون حظر confirm */}
                                  <button 
                                    onClick={() => setStudentToDelete({ nationalId: s.nationalId, fullName: s.fullName })} 
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                                    title="حذف الطالب"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {visibleStudents.length === 0 && !loading && (
                          <tr>
                            <td colSpan={7} className="p-10 text-center text-gray-400 font-bold">
                              لا توجد نتائج مطابقة لخيارات البحث أو التصفية الحالية.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* نافذة تعديل بيانات الطالب Modal */}
            {editingStudent && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Pencil size={20} />
                      <h3 className="text-base font-black text-gray-900">تعديل بيانات الطالب</h3>
                    </div>
                    <button 
                      onClick={() => setEditingStudent(null)} 
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <form onSubmit={handleSaveEditStudent} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">اسم الطالب كاملاً:</label>
                      <input
                        type="text"
                        required
                        value={editingStudent.fullName}
                        onChange={e => setEditingStudent({ ...editingStudent, fullName: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold outline-none focus:border-blue-500 bg-gray-50 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">رقم الهوية الوطنية / السجل المدني:</label>
                      <input
                        type="text"
                        required
                        value={editingStudent.nationalId}
                        onChange={e => setEditingStudent({ ...editingStudent, nationalId: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-mono font-bold outline-none focus:border-blue-500 bg-gray-50 focus:bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">الصف الدراسي:</label>
                        <select
                          value={editingStudent.grade}
                          onChange={e => setEditingStudent({ ...editingStudent, grade: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold outline-none focus:border-blue-500 bg-gray-50 focus:bg-white"
                        >
                          {[1, 2, 3, 4, 5, 6].map(g => (
                            <option key={g} value={g.toString()}>{getGradeLabel(g)}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">الفصل / الشعبة:</label>
                        <select
                          value={editingStudent.section}
                          onChange={e => setEditingStudent({ ...editingStudent, section: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold outline-none focus:border-blue-500 bg-gray-50 focus:bg-white"
                        >
                          {["أ", "ب", "ج", "د", "هـ"].map(s => (
                            <option key={s} value={s}>فصل {s}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setEditingStudent(null)}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        <span>حفظ التعديلات</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* نافذة تأكيد حذف طالب واحد Modal (آمنة وبدون حظر نافذة المتصفح) */}
            {studentToDelete && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 text-center">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                    <Trash2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">تأكيد حذف الطالب</h3>
                    <p className="text-xs text-gray-600 font-bold mt-1">
                      هل أنت متأكد من حذف الطالب <span className="text-red-600 font-black">"{studentToDelete.fullName}"</span> (الهوية: {studentToDelete.nationalId})؟
                    </p>
                    <p className="text-[11px] text-gray-400 font-bold mt-1">
                      سيتم حذف سجل الطالب من قاعدة البيانات وقوائم الفصول نهائياً.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setStudentToDelete(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={handleConfirmDeleteSingle}
                      disabled={isDeletingStudent}
                      className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isDeletingStudent ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      <span>تأكيد الحذف</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* نافذة تأكيد الحذف الجماعي للطلاب المحددين */}
            {showBulkDeleteModal && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 text-center">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">تأكيد الحذف الجماعي</h3>
                    <p className="text-xs text-gray-600 font-bold mt-1">
                      هل أنت متأكد من حذف <span className="text-red-600 font-black">{toIndianNumbers(selectedStudentIds.size)}</span> طالباً محدداً من قاعدة البيانات؟
                    </p>
                    <p className="text-[11px] text-gray-400 font-bold mt-1">
                      لا يمكن التراجع عن هذا الإجراء بعد تنفيذه.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setShowBulkDeleteModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={handleBulkDeleteStudents}
                      disabled={loading}
                      className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      <span>حذف الطلاب المحددين</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* إشعار عائم في أسفل الشاشة للعمليات الناجحة */}
            {inAppNotice && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold border border-gray-700 animate-in fade-in slide-in-from-bottom-5">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>{inAppNotice}</span>
              </div>
            )}
          </motion.div>
        )}
        {activeTab === "classroom" && (
          <motion.div key="classroom" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-8">
              {/* Teacher's Classes */}
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                  <BookOpen size={24} /> 
                  <span>فصولي</span>
                </h3>
                <div className="space-y-4">
                  {profile?.role === "teacher" ? (
                    profile.assignedClasses?.map(classKey => {
                      const session = classSessions.find(s => s.id === classKey);
                      return (
                        <div key={classKey} className="bg-[var(--bg)] p-6 rounded-3xl border border-[var(--border)] space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="font-black text-xl text-[var(--primary)]">الصف {toIndianNumbers(classKey.split('-')[0])} - فصل {classKey.split('-')[1]}</div>
                            {session && <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">مباشر الآن</span>}
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--text-light)]">اختر درساً للعرض على السبورة:</label>
                            <select 
                              onChange={(e) => {
                                if (e.target.value) handleStartSession(classKey, e.target.value);
                              }}
                              value={session?.activeLessonId || ""}
                              className="w-full px-4 py-2 rounded-xl border bg-white outline-none text-sm"
                            >
                              <option value="">-- اختر الدرس --</option>
                              {lessonsList.map(l => (
                                <option key={l.id} value={l.id}>{l.title}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex gap-2">
                            {session && (
                              <>
                                <button 
                                  onClick={() => {
                                    sessionStorage.setItem("whiteboard_lesson_id", session.activeLessonId);
                                    window.open("/whiteboard", "_blank");
                                  }}
                                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                                >
                                  <Monitor size={14} />
                                  <span>العرض على السبورة</span>
                                </button>
                                <button onClick={() => handleEndSession(classKey)} className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-all">إنهاء</button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-10 text-[var(--text-light)] italic text-sm">هذا القسم مخصص للمعلمين فقط لإدارة حصصهم المباشرة.</div>
                  )}
                </div>
              </div>

              {/* Students List */}
              <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                    <Users size={24} /> 
                    <span>إدارة طلابي (Remote Control)</span>
                  </h3>
                  <div className="bg-[var(--bg)] px-3 py-1 rounded-full text-xs font-bold text-[var(--text-light)]">
                    {toIndianNumbers(myStudents.length)} طالب متصل
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[700px] overflow-y-auto pr-2 scrollbar-hide">
                  {myStudents.map(student => (
                    <div key={student.uid} className="bg-[var(--bg)] p-6 rounded-3xl border border-[var(--border)] space-y-4 hover:shadow-md transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-white border-2 border-[var(--primary)] flex items-center justify-center text-[var(--primary)] font-black text-xl">
                          {student.username[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-lg">{student.fullName || student.username}</div>
                          <div className="text-xs text-[var(--text-light)]">الصف {toIndianNumbers(student.grade || "")} - فصل {student.section}</div>
                        </div>
                        <div className="text-left">
                           <div className="text-xs font-black text-[var(--primary)]">{toIndianNumbers(student.xp || 0)} XP</div>
                           <button onClick={() => navigate("/reports", { state: { userId: student.uid, username: student.username } })} className="text-[10px] text-blue-600 font-bold hover:underline">عرض التقارير</button>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-dashed space-y-3">
                        <label className="text-[10px] font-bold text-[var(--text-light)] uppercase tracking-wider">توجيه درس مباشر للطالب:</label>
                        <div className="flex gap-2">
                          <select 
                            id={`assign-${student.uid}`}
                            className="flex-1 text-xs bg-white border border-[var(--border)] rounded-xl px-3 py-2 outline-none focus:border-[var(--primary)]"
                          >
                            <option value="">-- اختر الدرس --</option>
                            {lessonsList.map(l => (
                              <option key={l.id} value={l.id}>{l.title}</option>
                            ))}
                          </select>
                          <button 
                            onClick={() => {
                              const sel = document.getElementById(`assign-${student.uid}`) as HTMLSelectElement;
                              if (sel.value) handleAssignToStudent(student.uid, sel.value);
                            }}
                            className="bg-[var(--primary)] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:scale-105 transition-all"
                          >
                            إرسال
                          </button>
                          <button 
                            onClick={async () => {
                              try {
                                await deleteDoc(doc(db, "student_assignments", student.uid));
                                alert("تم إيقاف الدرس للطالب");
                              } catch (e) {
                                alert("فشل الإيقاف: " + e);
                              }
                            }}
                            className="bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-red-100 transition-all"
                          >
                            إيقاف
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {myStudents.length === 0 && (
                    <div className="col-span-full py-20 text-center text-[var(--text-light)] bg-white rounded-3xl border border-dashed border-[var(--border)]">
                      <Users size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-bold">لا يوجد طلاب مسندين إليك حالياً.</p>
                      <p className="text-xs">يرجى التواصل مع المشرف العام لإسناد الفصول لك.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "questions" && (
          <motion.div key="questions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            {/* Quick Add Question */}
            <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
              <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                <Plus size={24} /> 
                <span>إضافة سؤال سريع للبنك</span>
              </h3>
              <form onSubmit={handleAddQuestion} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <input type="text" placeholder="نص السؤال" value={newQText} onChange={e => setNewQText(e.target.value)} required className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" />
                  </div>
                  {newQOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="radio" name="quick_correct" checked={newQCorrect === idx} onChange={() => setNewQCorrect(idx)} className="accent-[var(--primary)]" />
                      <input type="text" placeholder={`الخيار ${toIndianNumbers(idx+1)}`} value={opt} onChange={e => {
                        const n = [...newQOptions];
                        n[idx] = e.target.value;
                        setNewQOptions(n);
                      }} required className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none text-xs" />
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <select value={newQLessonId} onChange={e => setNewQLessonId(e.target.value)} className="w-full px-4 py-2 rounded-lg border bg-[var(--bg)] outline-none text-xs">
                      <option value="all">متاح لجميع الدروس (عام)</option>
                      {lessonsList.map(l => <option key={l.id} value={l.id}>{l.title} (الصف {toIndianNumbers(l.grade)})</option>)}
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full py-2 bg-[var(--primary)] text-white rounded-lg font-bold hover:shadow-md transition-all">إضافة السؤال للبنك</button>
              </form>
            </div>

            <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                  <Database size={24} /> 
                  <span>بنك الأسئلة المركزي</span>
                </h3>
                <button 
                  onClick={() => setShowQuestionModal(true)}
                  className="bg-[var(--primary)] text-white px-4 py-2 rounded-full text-xs font-bold shadow-md hover:scale-105 transition-all"
                >
                  إضافة سؤال جديد
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b-2 border-[var(--border)]">
                      <th className="p-3">السؤال</th>
                      <th className="p-3">الخيارات</th>
                      <th className="p-3">الدرس</th>
                      <th className="p-3">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionsPool.map(q => (
                      <tr key={q.id} className="border-b border-[var(--border)] hover:bg-primary/5">
                        <td className="p-3 font-bold">{q.text}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {q.options?.map((opt: string, i: number) => (
                              <span key={i} className={cn("text-[10px] px-2 py-0.5 rounded-full", i === q.correct ? "bg-green-100 text-green-700 font-bold" : "bg-gray-100 text-gray-500")}>
                                {opt}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{q.lessonId === "all" ? "عام" : q.lessonId}</span>
                        </td>
                        <td className="p-3">
                          <button 
                            onClick={() => setQuestionToDelete({ id: q.id, text: q.text })} 
                            className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-all cursor-pointer"
                            title="حذف السؤال"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {questionsPool.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-10 text-center text-[var(--text-light)]">لا توجد أسئلة في البنك حالياً.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "visits" && (
          <motion.div key="visits" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 border border-[var(--border)] shadow-md space-y-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h3 className="text-xl font-bold text-[var(--primary)] flex items-center gap-2">
                  <UserCheck size={24} />
                  <span>الزيارات الميدانية والتبادلية</span>
                </h3>
                <div className="flex gap-4">
                  {(profile?.role === "supervisor" || profile?.role === "general_supervisor") && (
                    <button onClick={() => { setVisitType("supervisory"); setTargetTeacher(null); setShowVisitModal(true); }} className="bg-[var(--primary)] text-white px-4 py-2 rounded-full text-xs font-bold shadow-md">زيارة إشرافية جديدة</button>
                  )}
                  {profile?.role === "teacher" && (
                    <button onClick={() => { setVisitType("peer"); setTargetTeacher(null); setShowVisitModal(true); }} className="bg-[var(--accent)] text-white px-4 py-2 rounded-full text-xs font-bold shadow-md">زيارة تبادلية جديدة</button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Supervisory Visits */}
                <div className="space-y-4">
                  <h4 className="font-bold text-[var(--primary)] border-b pb-2 flex items-center gap-2">
                    <ShieldCheck size={18} /> الزيارات الإشرافية
                  </h4>
                  {visits.length === 0 ? (
                    <p className="text-xs text-[var(--text-light)] py-4">لا توجد زيارات مسجلة</p>
                  ) : (
                    visits.map(v => (
                      <div key={v.id} className="bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--primary)] transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-sm">المعلم: {v.teacherName}</span>
                          <span className="text-[10px] text-[var(--text-light)]">{new Date(v.date).toLocaleDateString("ar-EG")}</span>
                        </div>
                        <div className="text-[10px] font-bold text-gray-500 mb-2">المشرف: {v.supervisorName}</div>
                        <p className="text-xs text-[var(--text-light)] line-clamp-2 mb-3">{v.notes}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map(star => (
                              <div key={star} className={cn("w-2 h-2 rounded-full", star <= v.rating ? "bg-yellow-400" : "bg-gray-200")}></div>
                            ))}
                          </div>
                          <div className="flex gap-4">
                            {v.teacherSignature && <div className="text-[8px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold">توقيع المعلم ✓</div>}
                            {v.supervisorSignature && <div className="text-[8px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">توقيع المشرف ✓</div>}
                          </div>
                        </div>
                        {(profile?.role === "general_supervisor" || (profile?.role === "teacher" && v.teacherId === profile.uid)) && (
                          <div className="mt-3 flex gap-4 overflow-x-auto pt-2 border-t border-dashed items-center justify-center">
                             {v.teacherSignature && (
                               <div className="text-center">
                                 <div className="bg-white p-1 border rounded"><img src={v.teacherSignature} className="h-10 grayscale contrast-150" alt="توقيع المعلم" /></div>
                                 <div className="text-[8px] mt-1">توقيع المعلم</div>
                               </div>
                             )}
                             {v.supervisorSignature && (
                               <div className="text-center">
                                 <div className="bg-white p-1 border rounded"><img src={v.supervisorSignature} className="h-10 grayscale contrast-150" alt="توقيع المشرف" /></div>
                                 <div className="text-[8px] mt-1">توقيع المشرف</div>
                               </div>
                             )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Peer Visits */}
                <div className="space-y-4">
                  <h4 className="font-bold text-[var(--accent)] border-b pb-2 flex items-center gap-2">
                    <Users size={18} /> الزيارات التبادلية
                  </h4>
                  {peerVisits.length === 0 ? (
                    <p className="text-xs text-[var(--text-light)] py-4">لا توجد زيارات مسجلة</p>
                  ) : (
                    peerVisits.map(v => (
                      <div key={v.id} className="bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--accent)] transition-all">
                         <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-sm">الزائر: {v.visitorName}</span>
                          <span className="text-[10px] text-[var(--text-light)]">{new Date(v.date).toLocaleDateString("ar-EG")}</span>
                        </div>
                        <div className="text-xs font-bold text-[var(--text-light)] mb-1">المستضيف: {v.hostName}</div>
                        <p className="text-xs text-[var(--text-light)] line-clamp-2 mb-3">{v.notes}</p>
                        <div className="flex gap-4 items-center justify-center pt-2 border-t border-dashed mt-2">
                          {v.visitorSignature && (
                            <div className="text-center">
                              <div className="bg-white p-1 border rounded"><img src={v.visitorSignature} className="h-8 grayscale contrast-150" /></div>
                              <div className="text-[8px] mt-1 font-bold">الزائر</div>
                            </div>
                          )}
                          {v.hostSignature && (
                            <div className="text-center">
                              <div className="bg-white p-1 border rounded"><img src={v.hostSignature} className="h-8 grayscale contrast-150" /></div>
                              <div className="text-[8px] mt-1 font-bold">المستضيف</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 max-w-md w-full shadow-2xl border border-[var(--border)] relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 left-4 text-[var(--text-light)] hover:text-[var(--accent)]"><X size={24} /></button>
            <h3 className="text-2xl font-bold text-[var(--primary)] mb-6 flex items-center gap-2"><UserPlus /> إنشاء حساب جديد</h3>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <input type="text" placeholder="اسم المستخدم" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required className="w-full px-6 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" />
              <input type="text" placeholder="رقم الهوية" value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} required className="w-full px-6 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" />
              
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewRole("student")} className={cn("py-2 rounded-full border font-bold text-xs", newRole === "student" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)]")}>طالب</button>
                <button type="button" onClick={() => setNewRole("teacher")} className={cn("py-2 rounded-full border font-bold text-xs", newRole === "teacher" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)]")}>معلم</button>
                <button type="button" onClick={() => setNewRole("supervisor")} className={cn("py-2 rounded-full border font-bold text-xs", newRole === "supervisor" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)]")}>مشرف</button>
                <button type="button" onClick={() => setNewRole("general_supervisor")} className={cn("py-2 rounded-full border font-bold text-xs", newRole === "general_supervisor" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)]")}>مشرف عام</button>
              </div>

              {newRole === "student" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <select value={newGrade} onChange={(e) => setNewGrade(e.target.value)} className="px-4 py-2 rounded-full border bg-[var(--bg)]">
                      <option value="">الصف</option>
                      {[1,2,3,4,5,6].map(g => <option key={g} value={g.toString()}>{toIndianNumbers(g)}</option>)}
                    </select>
                    <select value={newSemester} onChange={(e) => setNewSemester(e.target.value)} className="px-4 py-2 rounded-full border bg-[var(--bg)]">
                      <option value="">الفصل الدراسي</option>
                      {["الفصل الدراسي الأول", "الفصل الدراسي الثاني"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1">
                    <select value={newSection} onChange={(e) => setNewSection(e.target.value)} className="px-4 py-2 rounded-full border bg-[var(--bg)] w-full">
                      <option value="">الفصل (الشعبة)</option>
                      {["أ", "ب", "ج", "د"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <button type="submit" disabled={createLoading} className="w-full py-4 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all disabled:opacity-50">
                {createLoading ? <Loader2 className="animate-spin mx-auto" /> : "إنشاء الحساب"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Visit Creation Modal */}
      {showVisitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 max-w-lg w-full shadow-2xl border border-[var(--border)] relative animate-in fade-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
            <button onClick={() => setShowVisitModal(false)} className="absolute top-4 left-4 text-[var(--text-light)] hover:text-[var(--accent)]"><X size={24} /></button>
            <h3 className="text-2xl font-bold text-[var(--primary)] mb-6 flex items-center gap-2">
              <Sparkles className="text-yellow-500" />
              {visitType === "supervisory" ? "تسجيل زيارة إشرافية" : "تسجيل زيارة تبادلية"}
            </h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const data = Object.fromEntries(formData.entries());
              
              setLoading(true);
              try {
                if (visitType === "supervisory") {
                  if (!targetTeacher) throw new Error("يجب اختيار المعلم");
                  await addDoc(collection(db, "supervisory_visits"), {
                    supervisorId: profile!.uid,
                    supervisorName: profile!.fullName || profile!.username,
                    teacherId: targetTeacher.uid,
                    teacherName: targetTeacher.fullName || targetTeacher.username,
                    date: new Date().toISOString(),
                    notes: data.notes,
                    rating: Number(data.rating),
                    supervisorSignature: data.signature,
                  });
                } else {
                  if (!targetTeacher) throw new Error("يجب اختيار المعلم المستضيف");
                  await addDoc(collection(db, "peer_visits"), {
                    visitorId: profile!.uid,
                    visitorName: profile!.fullName || profile!.username,
                    hostId: targetTeacher.uid,
                    hostName: targetTeacher.fullName || targetTeacher.username,
                    date: new Date().toISOString(),
                    notes: data.notes,
                    visitorSignature: data.signature,
                  });
                }
                alert("تم تسجيل الزيارة بنجاح");
                setShowVisitModal(false);
                fetchVisits();
              } catch (err: any) {
                alert(err.message);
              } finally {
                setLoading(false);
              }
            }} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-bold">{visitType === "supervisory" ? "اختيار المعلم" : "المعلم المستضيف"}</label>
                <select 
                  onChange={(e) => setTargetTeacher(users.find(u => u.uid === e.target.value) || null)}
                  required 
                  className="w-full px-4 py-2 rounded-lg border bg-[var(--bg)]"
                >
                  <option value="">اختر...</option>
                  {users.filter(u => u.role === "teacher" && u.uid !== profile?.uid).map(t => (
                    <option key={t.uid} value={t.uid}>{t.fullName || t.username}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold">ملاحظات الزيارة</label>
                <textarea name="notes" rows={4} required className="w-full px-4 py-2 rounded-lg border bg-[var(--bg)]" placeholder="اكتب ملاحظاتك هنا..."></textarea>
              </div>

              {visitType === "supervisory" && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold">التقييم العام (1-5)</label>
                  <div className="flex gap-4">
                    {[1,2,3,4,5].map(r => (
                      <label key={r} className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="rating" value={r} required /> {toIndianNumbers(r)}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                 <label className="block text-sm font-bold">توقيعك</label>
                 <SignaturePad onSave={(sig) => {
                   const input = document.getElementById("visit_signature") as HTMLInputElement;
                   if (input) input.value = sig;
                 }} />
                 <input type="hidden" name="signature" id="visit_signature" required />
              </div>

              <button type="submit" disabled={loading} className="w-full py-4 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin mx-auto" /> : "حفظ الزيارة"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 max-w-md w-full shadow-2xl border border-[var(--border)] relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowQuestionModal(false)} className="absolute top-4 left-4 text-[var(--text-light)] hover:text-[var(--accent)]"><X size={24} /></button>
            <h3 className="text-2xl font-bold text-[var(--primary)] mb-6 flex items-center gap-2"><Plus /> إضافة سؤال لبنك الأسئلة</h3>
            
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--text-light)] px-2">نص السؤال</label>
                <textarea 
                  placeholder="أدخل نص السؤال هنا..." 
                  value={newQText} 
                  onChange={(e) => setNewQText(e.target.value)} 
                  required 
                  className="w-full px-6 py-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)] min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-light)] px-2">الخيارات (حدد الخيار الصحيح)</label>
                {newQOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="correct" 
                      checked={newQCorrect === idx} 
                      onChange={() => setNewQCorrect(idx)} 
                      className="accent-[var(--primary)] w-5 h-5"
                    />
                    <input 
                      type="text" 
                      placeholder={`الخيار ${toIndianNumbers(idx + 1)}`} 
                      value={opt} 
                      onChange={(e) => {
                        const next = [...newQOptions];
                        next[idx] = e.target.value;
                        setNewQOptions(next);
                      }} 
                      required 
                      className="flex-1 px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--text-light)] px-2">مرتبط بدرس (ID) - اختياري</label>
                <input 
                  type="text" 
                  placeholder="ID الدرس أو اتركه 'all' للكل" 
                  value={newQLessonId} 
                  onChange={(e) => setNewQLessonId(e.target.value)} 
                  className="w-full px-6 py-3 rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-[var(--primary)]" 
                />
              </div>

              <button type="submit" disabled={loading} className="w-full py-4 bg-[var(--primary)] text-white rounded-full font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4">
                {loading ? <Loader2 className="animate-spin" /> : <Plus size={18} />}
                <span>إضافة السؤال</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف درس مضاف (آمنة وبدون حظر نافذة المتصفح) */}
      {lessonToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">تأكيد حذف الدرس</h3>
              <p className="text-xs text-gray-600 font-bold mt-1">
                هل أنت متأكد من حذف درس <span className="text-red-600 font-black">"{lessonToDelete.title}"</span>؟
              </p>
              <p className="text-[11px] text-gray-400 font-bold mt-1">
                سيتم إزالة الدرس بشكل نهائي من قائمة الدروس المتاحة للطلاب والمعلمين.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setLessonToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDeleteLesson}
                disabled={isDeletingLesson}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingLesson ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>تأكيد حذف الدرس</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف سؤال من بنك الأسئلة */}
      {questionToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">تأكيد حذف السؤال</h3>
              <p className="text-xs text-gray-600 font-bold mt-1">
                هل أنت متأكد من حذف السؤال: <span className="text-red-600 font-black">"{questionToDelete.text}"</span>؟
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setQuestionToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDeleteQuestion}
                disabled={isDeletingQuestion}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingQuestion ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>تأكيد حذف السؤال</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

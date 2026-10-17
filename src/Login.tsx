import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, query, collection, where, getDocs } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import { useAuth } from "./AuthContext";
import { cn, toIndianNumbers } from "./utils";
import { LogIn, UserPlus, Users, Info, BookOpen, GraduationCap, Loader2, ShieldCheck, X, KeyRound, Sparkles } from "lucide-react";

export default function Login() {
  const [tab, setTab] = useState<"student_login" | "staff_login">("student_login");
  const [nationalId, setNationalId] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminCustomId, setAdminCustomId] = useState("1234567890");
  
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshProfile } = useAuth();

  const from = location.state?.from?.pathname || "/admin";

  const handleAdminGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
      await refreshProfile();
      setShowAdminModal(false);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setError("فشل تسجيل دخول Google: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectAdminLogin = async (idToUse = "1234567890") => {
    setLoading(true);
    setError("");
    const cleanId = idToUse.trim();
    try {
      const syntheticEmail = `${cleanId}@staff.local`;
      const syntheticPassword = `staff-${cleanId}`;

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, syntheticEmail, syntheticPassword);
      } catch (loginErr: any) {
        if (loginErr.code === "auth/user-not-found" || loginErr.code === "auth/invalid-credential") {
          userCredential = await createUserWithEmailAndPassword(auth, syntheticEmail, syntheticPassword);
        } else {
          throw loginErr;
        }
      }

      await setDoc(doc(db, "users", userCredential.user.uid), {
        uid: userCredential.user.uid,
        username: "المشرف العام",
        fullName: "المشرف العام للمنصة",
        nationalId: cleanId,
        role: "general_supervisor",
        approved: true,
        xp: 100,
        level: 10,
        streak: 1,
        bestSpeed: 300,
        createdAt: new Date().toISOString()
      }, { merge: true });

      await refreshProfile();
      setShowAdminModal(false);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setError("فشل تسجيل دخول الإدارة: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const cleanId = nationalId.trim();

    try {
      // Find teacher in 'users' collection by nationalId
      const q = query(collection(db, "users"), where("nationalId", "==", cleanId));
      const querySnapshot = await getDocs(q);
      
      let userProfile: any = null;
      if (!querySnapshot.empty) {
        userProfile = querySnapshot.docs[0].data();
        if (userProfile.role === "student") {
          throw new Error("هذا الرقم مسجل كطالب. يرجى الدخول من بوابة الطلاب.");
        }
      } else {
        // If not found in users, check if they are a special admin
        if (cleanId === "1234567890") { // Default admin ID for setup if needed
           userProfile = { role: "general_supervisor", fullName: "المشرف العام" };
        } else {
           throw new Error("رقم الهوية غير مسجل كمعلم. يرجى التواصل مع الإدارة.");
        }
      }

      const syntheticEmail = `${cleanId}@staff.local`;
      const syntheticPassword = `staff-${cleanId}`;

      try {
        await signInWithEmailAndPassword(auth, syntheticEmail, syntheticPassword);
      } catch (loginErr: any) {
        if (loginErr.code === "auth/user-not-found" || loginErr.code === "auth/invalid-credential") {
          const result = await createUserWithEmailAndPassword(auth, syntheticEmail, syntheticPassword);
          await setDoc(doc(db, "users", result.user.uid), {
            ...userProfile,
            uid: result.user.uid,
            nationalId: cleanId,
            approved: true,
            createdAt: new Date().toISOString(),
          });
        } else {
          throw loginErr;
        }
      }

      await refreshProfile();
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    const cleanId = nationalId.toLowerCase().replace("s", "").replace(/\D/g, "");
    
    try {
      const rosterDoc = await getDoc(doc(db, "students_roster", cleanId));
      if (!rosterDoc.exists()) {
        throw new Error("رقم الهوية غير مسجل في النظام. يرجى مراجعة إدارة المدرسة.");
      }
      
      const rosterData = rosterDoc.data();
      if (rosterData.grade !== grade) {
        throw new Error("الصف المدخل لا يتطابق مع المسجل في النظام.");
      }

      const syntheticEmail = `${cleanId}@student.local`;
      const syntheticPassword = `std-${cleanId}`;

      try {
        const cred = await signInWithEmailAndPassword(auth, syntheticEmail, syntheticPassword);
        // Ensure student grade and section stay synchronized with official school roster in Firestore
        await setDoc(doc(db, "users", cred.user.uid), {
          grade: rosterData.grade,
          section: rosterData.section,
          fullName: rosterData.fullName,
          role: "student"
        }, { merge: true });
      } catch (loginErr: any) {
        if (loginErr.code === "auth/user-not-found" || loginErr.code === "auth/invalid-credential") {
          const result = await createUserWithEmailAndPassword(auth, syntheticEmail, syntheticPassword);
          await setDoc(doc(db, "users", result.user.uid), {
            username: rosterData.fullName.split(" ")[0] || cleanId,
            fullName: rosterData.fullName,
            grade: rosterData.grade,
            section: rosterData.section,
            nationalId: cleanId,
            role: "student",
            approved: true,
            xp: 0,
            level: 1,
            streak: 0,
            bestSpeed: 0,
            createdAt: new Date().toISOString(),
          });
        } else {
          throw loginErr;
        }
      }
      
      await refreshProfile();
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] p-8 max-w-md w-full shadow-lg border border-[var(--border)] relative overflow-hidden">
        {/* Admin Login Button */}
        <button 
          onClick={() => { setShowAdminModal(true); setError(""); }}
          disabled={loading}
          className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold text-gray-600 hover:text-blue-700 bg-gray-100 hover:bg-blue-50 transition-all border border-gray-200 flex items-center gap-1.5 shadow-2xs z-40 cursor-pointer"
          title="دخول المشرف وإدارة النظام"
        >
          <ShieldCheck size={15} className="text-blue-600" />
          <span>دخول الإدارة</span>
        </button>

        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-[var(--primary)] rounded-full flex items-center justify-center shadow-lg">
            <BookOpen className="text-white w-10 h-10" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-[var(--primary)] mb-2">منصة إتقان القراءة</h1>
        <p className="text-center text-[var(--text-light)] mb-8">سجل دخولك برقم الهوية فقط</p>
        
        <div className="flex bg-[var(--bg)] p-1 rounded-full border border-[var(--border)] mb-8">
          <button 
            onClick={() => { setTab("student_login"); setError(""); }} 
            className={cn("flex-1 px-4 py-2 rounded-full font-bold transition-all", tab === "student_login" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}
          >
            دخول الطالب
          </button>
          <button 
            onClick={() => { setTab("staff_login"); setError(""); }} 
            className={cn("flex-1 px-4 py-2 rounded-full font-bold transition-all", tab === "staff_login" ? "bg-[var(--primary)] text-white shadow-md" : "text-[var(--text-light)]")}
          >
            الهيئة التعليمية
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl text-sm text-center bg-red-50 text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={tab === "student_login" ? handleStudentLogin : handleStaffLogin} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <Users className="text-[var(--text-light)] w-5 h-5" />
            </div>
            <input 
              type="text" 
              placeholder="رقم الهوية" 
              value={nationalId} 
              onChange={(e) => setNationalId(e.target.value)} 
              required 
              className="w-full pr-12 pl-6 py-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--primary)] transition-all text-center text-lg tracking-widest" 
            />
          </div>

          {tab === "student_login" && (
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <GraduationCap className="text-[var(--text-light)] w-5 h-5" />
              </div>
              <select 
                value={grade} 
                onChange={(e) => setGrade(e.target.value)} 
                required 
                className="w-full pr-12 pl-6 py-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--primary)] transition-all h-14 appearance-none text-center"
              >
                <option value="">اختر الصف</option>
                {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g.toString()}>الصف {toIndianNumbers(g)}</option>)}
              </select>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-4 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-dark)] text-white rounded-2xl font-bold text-lg hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <LogIn className="w-5 h-5" />}
            {tab === "student_login" ? "دخول الطالب" : "دخول المعلم"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
          <p className="text-sm text-[var(--text-light)] flex items-center justify-center gap-2">
            <Info className="w-4 h-4" />
            في حال واجهت مشكلة، يرجى مراجعة مسؤول النظام
          </p>
        </div>
      </div>

      {/* Admin Login Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-tajawal rtl" dir="rtl">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3 border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900">بوابة إدارة النظام</h3>
                  <p className="text-[11px] text-gray-400 font-bold">تسجيل دخول المشرف العام للإدارة</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAdminModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Option 1: Direct 1-click admin login */}
              <button
                onClick={() => handleDirectAdminLogin("1234567890")}
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black text-sm hover:shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                <span>دخول مباشر لحساب المشرف العام</span>
              </button>

              {/* Option 2: Google login */}
              <button
                onClick={handleAdminGoogleLogin}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl font-bold text-xs border border-gray-200 transition-all flex items-center justify-center gap-2"
              >
                <span>الدخول بحساب Google (المشرف)</span>
              </button>

              {/* Option 3: Custom Admin ID */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <label className="text-[11px] font-bold text-gray-500">أو إدخال رقم هوية المشرف:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={adminCustomId}
                    onChange={(e) => setAdminCustomId(e.target.value)}
                    placeholder="رقم هوية المشرف"
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-center outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => handleDirectAdminLogin(adminCustomId)}
                    disabled={loading || !adminCustomId.trim()}
                    className="px-4 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-900 transition-all"
                  >
                    دخول
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

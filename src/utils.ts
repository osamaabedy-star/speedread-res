import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toIndianNumbers(num: number | string | undefined | null) {
  if (num === undefined || num === null) return "٠";
  const arabicNumbers = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return num.toString().replace(/\d/g, (d) => arabicNumbers[parseInt(d)]);
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Normalizes any grade string representation (e.g. "6", "الصف السادس", "السادس", "الصف 6", "٦")
 * into a single integer 1..6, or null if unknown.
 */
export function normalizeGrade(gradeVal: any): number | null {
  if (gradeVal === undefined || gradeVal === null) return null;
  const str = String(gradeVal).trim().toLowerCase();
  if (!str) return null;

  // Grade 6
  if (str.includes("6") || str.includes("٦") || str.includes("سادس") || str.includes("السادس")) return 6;
  // Grade 5
  if (str.includes("5") || str.includes("٥") || str.includes("خامس") || str.includes("الخامس")) return 5;
  // Grade 4
  if (str.includes("4") || str.includes("٤") || str.includes("رابع") || str.includes("الرابع")) return 4;
  // Grade 3
  if (str.includes("3") || str.includes("٣") || str.includes("ثالث") || str.includes("الثالث")) return 3;
  // Grade 2
  if (str.includes("2") || str.includes("٢") || str.includes("ثاني") || str.includes("الثاني")) return 2;
  // Grade 1
  if (str.includes("1") || str.includes("١") || str.includes("أول") || str.includes("الأول") || str.includes("اول")) return 1;

  return null;
}

export function getGradeLabel(gradeNumber: number): string {
  const labels: Record<number, string> = {
    1: "الصف الأول",
    2: "الصف الثاني",
    3: "الصف الثالث",
    4: "الصف الرابع",
    5: "الصف الخامس",
    6: "الصف السادس"
  };
  return labels[gradeNumber] || `الصف ${gradeNumber}`;
}

/**
 * Normalizes any semester string to "1" | "2" | "3" | "external"
 */
export function normalizeSemester(semVal: any): "1" | "2" | "3" | "external" {
  if (semVal === undefined || semVal === null) return "1";
  const str = String(semVal).trim().toLowerCase();
  if (!str) return "1";

  if (str.includes("خارج") || str.includes("إثرائ") || str.includes("اثرائ") || str.includes("حر") || str.includes("عام")) {
    return "external";
  }

  if (str.includes("3") || str.includes("٣") || str.includes("ثالث") || str.includes("الثالث")) {
    return "3";
  }
  if (str.includes("2") || str.includes("٢") || str.includes("ثان") || str.includes("الثاني")) {
    return "2";
  }
  if (str.includes("1") || str.includes("١") || str.includes("أول") || str.includes("الأول") || str.includes("اول") || str.includes("الاول")) {
    return "1";
  }

  return "1";
}

/**
 * Normalizes section representations (e.g., "أ", "ب", "ج", "د", "فصل أ", "ثاني ب", "2/ب", "الشعبة أ", "1", "2")
 * into a clean standard section letter: "أ" | "ب" | "ج" | "د" | "هـ"
 */
export function normalizeSection(sectionVal: any): string {
  if (sectionVal === undefined || sectionVal === null) return "أ";
  const str = String(sectionVal).trim();
  if (!str) return "أ";

  // Check specific sections
  if (str.endsWith("أ") || str.includes("/أ") || str.includes("-أ") || str.includes("(أ)") || str.includes(" أ ") || str === "أ" || str.includes("شعبة أ") || str.includes("فصل أ")) {
    return "أ";
  }
  if (str.endsWith("ب") || str.includes("/ب") || str.includes("-ب") || str.includes("(ب)") || str.includes(" ب ") || str === "ب" || str.includes("شعبة ب") || str.includes("فصل ب")) {
    return "ب";
  }
  if (str.endsWith("ج") || str.includes("/ج") || str.includes("-ج") || str.includes("(ج)") || str.includes(" ج ") || str === "ج" || str.includes("شعبة ج") || str.includes("فصل ج")) {
    return "ج";
  }
  if (str.endsWith("د") || str.includes("/د") || str.includes("-د") || str.includes("(د)") || str.includes(" د ") || str === "د" || str.includes("شعبة د") || str.includes("فصل د")) {
    return "د";
  }
  if (str.endsWith("هـ") || str.endsWith("ه") || str.includes("/هـ") || str === "هـ" || str === "ه") {
    return "هـ";
  }

  // Numbers 1 -> أ, 2 -> ب, 3 -> ج, 4 -> د
  if (str === "1" || str === "١") return "أ";
  if (str === "2" || str === "٢") return "ب";
  if (str === "3" || str === "٣") return "ج";
  if (str === "4" || str === "٤") return "د";

  const lastChar = str.slice(-1);
  if (["أ", "ا", "إ"].includes(lastChar)) return "أ";
  if (lastChar === "ب") return "ب";
  if (lastChar === "ج") return "ج";
  if (lastChar === "د") return "د";

  return str.replace(/^(فصل|شعبة|الصف|قسم)\s*/i, "").trim() || "أ";
}

export function isGradeMatch(studentGrade: any, lessonGrade: any): boolean {
  const sNum = normalizeGrade(studentGrade);
  const lNum = normalizeGrade(lessonGrade);
  if (!sNum || !lNum) return true;
  return sNum === lNum;
}

export interface ReaderPreferences {
  fontSize: number; // e.g. 36
  fontFamilyId: "madrasa" | "naskh" | "cairo" | "amiri" | "ruqaa";
  lineHeight: number; // e.g. 2.0
  speed: number; // e.g. 150
  mode: "static" | "scroll" | "rsvp" | "disappearing";
}

export const ARABIC_FONTS = [
  { id: "madrasa", label: "مدرسي", family: "'Cairo', 'Noto Naskh Arabic', sans-serif", preview: "الخط المدرسي" },
  { id: "naskh", label: "نسخ", family: "'Noto Naskh Arabic', serif", preview: "خط النسخ" },
  { id: "cairo", label: "قاهري", family: "'Cairo', sans-serif", preview: "خط قاهري" },
  { id: "amiri", label: "أميري", family: "'Amiri', serif", preview: "خط أميري" },
  { id: "ruqaa", label: "رقعة", family: "'Aref Ruqaa', cursive", preview: "خط الرقعة" }
] as const;

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontSize: 36,
  fontFamilyId: "madrasa",
  lineHeight: 2.0,
  speed: 150,
  mode: "static"
};

export function getSavedReaderPreferences(): ReaderPreferences {
  try {
    const raw = localStorage.getItem("app_reader_preferences");
    if (!raw) return DEFAULT_READER_PREFERENCES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_READER_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}

export function saveReaderPreferences(prefs: Partial<ReaderPreferences>): ReaderPreferences {
  try {
    const current = getSavedReaderPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem("app_reader_preferences", JSON.stringify(updated));
    return updated;
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}

export function getFontFamilyById(id?: string): string {
  const found = ARABIC_FONTS.find(f => f.id === id);
  return found ? found.family : "'Cairo', sans-serif";
}

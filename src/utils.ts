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

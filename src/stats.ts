import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { UserProfile } from "./types";

export const XP_PER_SESSION = 50;
export const XP_PER_QUIZ_CORRECT = 20;

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteriaText: string;
  condition: (profile: { xp: number; streak: number; bestSpeed: number }) => boolean;
}

export const BADGES: Badge[] = [
  {
    id: "beginner_reader",
    name: "قارئ مبتدئ",
    description: "تخطيت أولى خطواتك بنجاح وحصلت على 100 نقطة خبرة",
    icon: "BookOpen",
    criteriaText: "تجميع 100 نقطة خبرة (XP)",
    condition: (p) => p.xp >= 100
  },
  {
    id: "active_reader",
    name: "قارئ متميز",
    description: "مستوى رائع ومستمر في تطوير المهارات بـ 500 نقطة خبرة",
    icon: "Star",
    criteriaText: "تجميع 500 نقطة خبرة (XP)",
    condition: (p) => p.xp >= 500
  },
  {
    id: "legendary_reader",
    name: "قارئ أسطوري",
    description: "أصبحت بطلاً ملهماً في القراءة السريعة بـ 1500 نقطة خبرة",
    icon: "Trophy",
    criteriaText: "تجميع 1500 نقطة خبرة (XP)",
    condition: (p) => p.xp >= 1500
  },
  {
    id: "persistent",
    name: "مثابر",
    description: "التزام رائع بالقراءة لمدة 3 أيام متتالية",
    icon: "CalendarCheck",
    criteriaText: "سلسلة نشاط 3 أيام متتالية",
    condition: (p) => p.streak >= 3
  },
  {
    id: "active_flame",
    name: "شعلة النشاط",
    description: "حضور واجتهاد يومي لا ينقطع لمدة 7 أيام",
    icon: "Flame",
    criteriaText: "سلسلة نشاط 7 أيام متتالية",
    condition: (p) => p.streak >= 7
  },
  {
    id: "super_reader",
    name: "مسرع القراءة",
    description: "قراءة خارقة بسرعة تفوق 250 كلمة بالدقيقة",
    icon: "Zap",
    criteriaText: "سرعة قراءة 250 ك/د أو أكثر",
    condition: (p) => p.bestSpeed >= 250
  },
  {
    id: "speed_king",
    name: "ملك السرعة",
    description: "مستوى مذهل وقدرة استثنائية بسرعة تفوق 350 كلمة بالدقيقة",
    icon: "Crown",
    criteriaText: "سرعة قراءة 350 ك/د أو أكثر",
    condition: (p) => p.bestSpeed >= 350
  }
];

export async function updateUserStats(uid: string, type: "session" | "quiz", amount: number = 1) {
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return;
  
  const data = docSnap.data() as UserProfile;
  let newXp = data.xp || 0;
  let newStreak = data.streak || 0;
  let newBestSpeed = data.bestSpeed || 0;
  const now = new Date();
  const lastActive = data.lastActive ? new Date(data.lastActive) : null;

  // XP logic
  if (type === "session") {
    newXp += XP_PER_SESSION;
    if (amount > newBestSpeed) newBestSpeed = amount; // speed
  } else {
    newXp += XP_PER_QUIZ_CORRECT * amount; // correct answers
  }

  // Level logic (simplified: 500 XP per level)
  const newLevel = Math.floor(newXp / 500) + 1;

  // Streak logic
  if (lastActive) {
    const diffDays = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      newStreak += 1;
    } else if (diffDays > 1) {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  const unlockedBadges = BADGES.filter(b => b.condition({ xp: newXp, streak: newStreak, bestSpeed: newBestSpeed })).map(b => b.id);

  await updateDoc(docRef, {
    xp: newXp,
    level: newLevel,
    streak: newStreak,
    bestSpeed: newBestSpeed,
    lastActive: now.toISOString(),
    badges: unlockedBadges
  });

  return { newXp, newLevel, newStreak, unlockedBadges };
}

export interface StudentRoster {
  nationalId: string;
  fullName: string;
  grade: string;
  section: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  nationalId?: string;
  username: string;
  fullName?: string;
  phone?: string;
  grade?: string;
  semester?: string;
  section?: string; // Changed from semester to section (A, B, C, D)
  photoURL?: string;
  approved: boolean;
  role: "student" | "teacher" | "supervisor" | "general_supervisor";
  needsPasswordChange?: boolean;
  assignedClasses?: string[]; // For teachers: "grade-section" e.g. "1-A"
  xp: number;
  level: number;
  streak: number;
  lastActive?: string;
  bestSpeed: number;
  badges?: string[];
  createdAt: string;
}

export interface SupervisoryVisit {
  id?: string;
  supervisorId: string;
  supervisorName: string;
  teacherId: string;
  teacherName: string;
  date: string;
  notes: string;
  rating: number;
  teacherSignature?: string; // Base64 signature
  supervisorSignature?: string; // Base64 signature
}

export interface PeerVisit {
  id?: string;
  visitorId: string;
  visitorName: string;
  hostId: string;
  hostName: string;
  date: string;
  notes: string;
  visitorSignature?: string;
  hostSignature?: string;
}

export interface ReadingSession {
  id?: string;
  userId: string;
  username: string;
  lessonId: string;
  lessonTitle: string;
  date: string;
  speed: number;
  errors: number;
  duration: number;
  wordsRead: number;
  totalWords: number;
  completed: boolean;
  errorWords: string[];
}

export interface QuizResult {
  id?: string;
  userId: string;
  username: string;
  lessonId: string;
  lessonTitle: string;
  date: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  teacherSignature?: string; // Signature for tests if needed
}

export interface Lesson {
  id: string;
  title: string;
  content: string;
  grade: string;
  semester: string; // Restored from original requirement
  section?: string; // Optional for compatibility
  isAI?: boolean;
  authorId?: string;
  createdAt?: string;
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  type: "multiple" | "order";
  text: string;
  options?: string[];
  correct?: number;
  items?: string[];
  correctOrder?: number[];
  difficulty?: "easy" | "medium" | "hard" | 1 | 2 | 3;
  difficultyLabel?: string;
}

export interface ReaderConfig {
  lessonId: string;
  speed: number;
  mode: "rsvp" | "scroll" | "static" | "disappearing";
  font: string;
  fontFamilyId?: "naskh" | "madrasa" | "cairo" | "amiri" | "ruqaa";
  theme: string;
  fontSize: number;
  lineHeight?: number;
  teacherMode?: boolean;
  targetStudentId?: string;
  targetStudentName?: string;
}

export interface ClassSession {
  id: string; // classKey: "grade-section"
  activeLessonId: string | null;
  teacherId: string;
  teacherName: string;
  startedAt: string;
}

export interface QuestionPoolItem extends QuizQuestion {
  id: string;
  lessonId: string;
}

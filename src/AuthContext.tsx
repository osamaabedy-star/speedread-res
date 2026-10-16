import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile } from "./types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Admin identification is now handled via nationalId and role in Firestore

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string, currentUser: User) => {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    
      if (docSnap.exists()) {
        const data = docSnap.data();
        const updatedFields: Partial<UserProfile> = {};
        
        // Ensure new fields exist for existing users
        if (data.xp === undefined) updatedFields.xp = 0;
        if (data.level === undefined) updatedFields.level = 1;
        if (data.streak === undefined) updatedFields.streak = 0;
        if (data.bestSpeed === undefined) updatedFields.bestSpeed = 0;

        // Role and approval are already stored in Firestore, no need to force email check here
        // as the Login.tsx handles the initial setup for the admin account.

        if (Object.keys(updatedFields).length > 0) {
          await updateDoc(docRef, updatedFields);
          setProfile({ uid, ...data, ...updatedFields } as UserProfile);
        } else {
          setProfile({ uid, ...data } as UserProfile);
        }
      } else {
      // If document doesn't exist, we don't automatically create it here anymore
      // as creation is handled in Login.tsx for both students and staff.
      // However, for Google login (if still used), we can have a fallback:
      const isAdminEmail = currentUser.email === "osamaabedy@gmail.com";
      const newProfile = {
        username: currentUser.displayName || currentUser.email?.split("@")[0] || "User",
        fullName: currentUser.displayName || (isAdminEmail ? "المشرف العام" : ""),
        role: isAdminEmail ? "general_supervisor" : "student",
        approved: isAdminEmail,
        xp: 0,
        level: 1,
        streak: 0,
        bestSpeed: 0,
        createdAt: new Date().toISOString(),
      };
      await setDoc(docRef, newProfile);
      setProfile({ uid, ...newProfile } as UserProfile);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        await fetchProfile(user.uid, user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid, user);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

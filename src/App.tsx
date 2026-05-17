import { useCallback, useEffect, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import {
  auth,
  db,
  ensureSupabaseAuthRole,
  handleFirestoreError,
  OperationType,
} from "./firebase";
import {
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  setDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { Toaster } from "sonner";
import { LoginPage } from "./components/LoginPage";
import { PrintWorkspace } from "./features/print-workspace/PrintWorkspace";
import { fetchGroupedFileHistory } from "./services/fileHistory";
import { isSupabaseConfigured } from "./lib/supabase/client";
import type { FileHistoryGroup, HistoryItem } from "./types";

export default function App() {
  const toaster = (
    <Toaster position="top-right" theme="dark" richColors closeButton duration={8000} />
  );

  useEffect(() => {
    if (pdfjs.version) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }
  }, []);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [groupedHistory, setGroupedHistory] = useState<FileHistoryGroup[]>([]);

  const refreshGroupedHistory = useCallback(async (uid: string) => {
    if (!isSupabaseConfigured()) {
      setGroupedHistory([]);
      return;
    }
    try {
      const groups = await fetchGroupedFileHistory(uid);
      setGroupedHistory(groups);
    } catch (err) {
      console.warn("Istoric Supabase:", err);
      setGroupedHistory([]);
      console.error("Istoric indisponibil. Deloghează-te, reloghează-te și reîncarcă pagina.");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        try {
          await ensureSupabaseAuthRole(u);
        } catch {
          /* token refresh best-effort */
        }
        void refreshGroupedHistory(u.uid);
        const userDoc = doc(db, "users", u.uid);
        try {
          await setDoc(
            userDoc,
            {
              uid: u.uid,
              displayName: u.displayName,
              email: u.email,
              photoURL: u.photoURL,
              lastLogin: serverTimestamp(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${u.uid}`);
        }

        const historyPath = `users/${u.uid}/history`;
        const historyQuery = query(collection(db, historyPath), orderBy("timestamp", "desc"));
        onSnapshot(
          historyQuery,
          (snapshot) => {
            setHistory(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as HistoryItem)));
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, historyPath);
          }
        );
      } else {
        setHistory([]);
        setGroupedHistory([]);
      }
    });
    return unsubscribe;
  }, [refreshGroupedHistory]);

  if (!isAuthReady) {
    return (
      <div className="flex h-dvh min-h-0 flex-1 flex-col items-center justify-center bg-[#0d1117]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-sm font-medium text-[#94a3b8] animate-pulse">Initializing print1.ai...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {toaster}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <LoginPage />
        </div>
      </>
    );
  }

  return (
    <>
      {toaster}
      <div className="flex h-dvh min-h-0 w-full flex-1 flex-col overflow-hidden">
        <PrintWorkspace
          user={user}
          history={history}
          groupedHistory={groupedHistory}
          onHistoryRefresh={() => void refreshGroupedHistory(user.uid)}
        />
      </div>
    </>
  );
}

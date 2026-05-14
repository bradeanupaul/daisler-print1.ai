import { useEffect, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { Toaster } from "sonner";
import {
  auth,
  db,
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
import { LoginPage } from "./components/LoginPage";
import { PrintWorkspace } from "./features/print-workspace/PrintWorkspace";
import type { HistoryItem } from "./types";

export default function App() {
  useEffect(() => {
    if (pdfjs.version) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }
  }, []);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
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
      }
    });
    return unsubscribe;
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
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
        <Toaster position="top-right" theme="dark" />
        <LoginPage />
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" theme="dark" />
      <PrintWorkspace user={user} history={history} />
    </>
  );
}

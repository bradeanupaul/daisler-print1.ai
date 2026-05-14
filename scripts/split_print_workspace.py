#!/usr/bin/env python3
"""Split App.tsx into App.tsx (shell) + features/print-workspace/PrintWorkspace.tsx"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
app_path = root / "src" / "App.tsx"
lines = app_path.read_text(encoding="utf-8").splitlines(keepends=True)

# Imports: lines 1-102 (0:102)
imports = "".join(lines[0:102])
# Fix MockupViewer import path for new file depth
imports = imports.replace("from './", "from '../../")

# Remove unused imports from PrintWorkspace (optional cleanup)
for rm in [
    "  getDoc, \n",
    "  where, \n",
    "  deleteDoc\n",
    "  Trash2, \n",
    "  Plus,\n",
    "  Minus,\n",
    "  MoreVertical,\n",
    "  User,\n",
]:
    imports = imports.replace(rm, "")

body = []
body.append("export type PrintWorkspaceProps = {\n")
body.append("  user: FirebaseUser;\n")
body.append("  history: HistoryItem[];\n")
body.append("};\n\n")
body.append("export function PrintWorkspace({ user, history }: PrintWorkspaceProps) {\n")

# PDF worker L105-110 -> indices 104-109
body.extend(lines[104:110])

# State: L114-123 (file..showHistory) indices 113-122, then L126-162 skip history
body.extend(lines[113:123])
body.extend(lines[125:162])

# hasKey effect L201-204
body.extend(lines[200:204])

# Handlers L206-719 except we need to skip nothing
body.extend(lines[205:719])

# Return L741-1793
body.extend(lines[740:1793])

body.append("}\n")

pw_path = root / "src" / "features" / "print-workspace" / "PrintWorkspace.tsx"
pw_path.parent.mkdir(parents=True, exist_ok=True)
pw_path.write_text(imports + "".join(body), encoding="utf-8")
# Remove duplicate Toaster (shell provides it)
text = pw_path.read_text(encoding="utf-8")
text = text.replace(
    "      <Toaster position=\"top-right\" theme=\"dark\" />\n\n      {mobileSidebarOpen",
    "      {mobileSidebarOpen",
    1,
)
pw_path.write_text(text, encoding="utf-8")
# Heal: slice ranges can drop mockup state between tracedSvg and showHistory
text = pw_path.read_text(encoding="utf-8")
if "setMockupType" not in text:
    text = text.replace(
        "const [tracedSvg, setTracedSvg] = useState<string | null>(null);\n  const [showHistory",
        "const [tracedSvg, setTracedSvg] = useState<string | null>(null);\n"
        "  const [showMockup, setShowMockup] = useState(false);\n"
        "  const [mockupType, setMockupType] = useState<MockupType>('hoodie');\n"
        "  const [showHistory",
        1,
    )
    pw_path.write_text(text, encoding="utf-8")
print("Wrote", pw_path)

# New App.tsx shell
app_shell = '''import { useEffect, useState } from "react";
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
'''

app_path.write_text(app_shell, encoding="utf-8")
print("Rewrote", app_path)

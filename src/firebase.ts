import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocFromServer, Timestamp, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

type FirebaseWebConfig = typeof firebaseConfig & {
  firestoreDatabaseId?: string;
};

const config = firebaseConfig as FirebaseWebConfig;

function getConfiguredFirestore(app: FirebaseApp) {
  const id = config.firestoreDatabaseId?.trim();
  if (id && id !== '(default)') {
    return getFirestore(app, id);
  }
  return getFirestore(app);
}

// Initialize Firebase SDK
export const app = initializeApp(config);
export const db = getConfiguredFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

/** Claim `role: authenticated` pentru Supabase — apelat la login / relogare. */
export async function ensureSupabaseAuthRole(user: FirebaseUser): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = (
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  )?.trim();

  if (supabaseUrl?.trim() && supabaseKey) {
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/ensure-firebase-role`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          apikey: supabaseKey,
        },
      });
      if (!res.ok) {
        console.warn("ensure-firebase-role:", await res.text());
      }
    } catch (error) {
      console.warn("ensure-firebase-role:", error);
    }
  }

  await user.getIdToken(true);
}

// Auth Helpers
export const signInWithGoogle = async () => {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureSupabaseAuthRole(cred.user);
  return cred;
};
export const logOut = () => signOut(auth);

// Firestore Error Handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

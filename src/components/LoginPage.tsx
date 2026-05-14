import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Printer, Sparkles, Zap, Shield, LayoutGrid, ArrowRight } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { toast } from 'sonner';
import { signInWithGoogle } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = () => {
  const [localhostLoginUrl, setLocalhostLoginUrl] = useState<string | null>(null);
  const [authHost, setAuthHost] = useState<{ origin: string; hostname: string } | null>(null);

  useEffect(() => {
    console.log("LoginPage rendered");
    const { hostname, port, protocol, pathname, search, origin } = window.location;
    setAuthHost({ origin, hostname });
    if (hostname === "127.0.0.1") {
      const p = port ? `:${port}` : "";
      setLocalhostLoginUrl(`${protocol}//localhost${p}${pathname}${search}`);
    }
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed:", error);
      if (error instanceof FirebaseError) {
        const hints: Record<string, string> = {
          "auth/unauthorized-domain":
            "Verifică hostul afișat mai sus. Dacă e localhost: deschide proiectul Firebase din config, Authentication → Settings → Authorized domains. Dacă nu ai acces la acel proiect, creează unul nou și înlocuiește firebase-applet-config.json.",
          "auth/configuration-not-found":
            `Serviciul Authentication nu e activat pentru proiect sau API-ul e blocat. În Firebase Console: proiectul «${firebaseConfig.projectId}» → Build → Authentication → Get started. Apoi Sign-in method → Google → Enable. În Google Cloud: APIs & Services → Identity Toolkit API = Enabled; dacă ai restricții pe API key, permite Identity Toolkit API.`,
          "auth/popup-blocked":
            "Browserul a blocat popup-ul. Permite pop-up-uri pentru acest site și încearcă din nou.",
          "auth/popup-closed-by-user":
            "Fereastra de autentificare s-a închis înainte să termini. Încearcă din nou.",
          "auth/network-request-failed":
            "Nu s-a putut contacta Firebase (rețea, firewall sau DNS).",
        };
        const extra = hints[error.code] ? ` ${hints[error.code]}` : "";
        toast.error(`${error.code}: ${error.message}.${extra}`);
      } else {
        toast.error("Login eșuat. Deschide consola dezvoltator (F12) pentru detalii.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e2e8f0] flex flex-col lg:flex-row overflow-hidden">
      {/* Left Side: Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#161b22] p-12 flex-col justify-between relative overflow-hidden border-r border-white/5">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Printer className="text-black w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">print1.ai</h1>
          </div>

          <div className="space-y-12 max-w-md">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              <h2 className="text-4xl font-bold leading-tight">
                The Future of <span className="text-amber-500">Print Processing</span> is Here.
              </h2>
              <p className="text-[#94a3b8] text-lg">
                Automate your prepress workflow with AI-powered bleed management, DPI scaling, and 3D mockups.
              </p>
            </motion.div>

            <div className="space-y-6">
              {[
                { icon: Zap, title: "Instant Processing", desc: "Process complex PDF files in seconds with our cloud engine." },
                { icon: Sparkles, title: "AI Mockups", desc: "Generate realistic product mockups using advanced Gemini AI." },
                { icon: Shield, title: "Print Ready", desc: "Guaranteed CMYK-safe exports with automated bleed and safe zones." },
                { icon: LayoutGrid, title: "Smart Imposition", desc: "Automatic sheet multiplication for efficient print production." }
              ].map((feature, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + (i * 0.1) }}
                  className="flex gap-4"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                    <feature.icon className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">{feature.title}</h4>
                    <p className="text-sm text-[#94a3b8]">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 text-sm text-[#4b5563]">
          &copy; {new Date().getFullYear()} print1.ai. All rights reserved.
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="lg:hidden absolute top-8 left-8 flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Printer className="text-black w-5 h-5" />
          </div>
          <span className="font-bold text-xl">print1.ai</span>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-white">Welcome back</h2>
            <p className="text-[#94a3b8]">Log in to your print1.ai account to continue</p>
            {authHost && (
              <p className="pt-1 text-center font-mono text-[10px] leading-relaxed text-[#64748b] break-all">
                Firebase vede acest host: <span className="text-[#94a3b8]">{authHost.hostname}</span>
                <br />
                Origine completă: <span className="text-[#94a3b8]">{authHost.origin}</span>
                <br />
                Proiect din app: <span className="text-[#94a3b8]">{firebaseConfig.projectId}</span>
              </p>
            )}
          </div>

          {authHost && authHost.hostname !== "localhost" && authHost.hostname !== "127.0.0.1" && (
            <div
              role="status"
              className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100"
            >
              <p className="font-semibold text-amber-400">Host diferit de «localhost»</p>
              <p className="mt-1 text-xs text-[#94a3b8]">
                Rulezi pe <code className="rounded bg-black/30 px-1">{authHost.hostname}</code> (ex. IP din rețea sau tunel).
                Firebase cere același host în <span className="text-[#e2e8f0]">Authorized domains</span>, sau deschide app-ul la{" "}
                <a
                  href={`http://localhost:${window.location.port || "3000"}${window.location.pathname}${window.location.search}`}
                  className="text-amber-400 underline"
                >
                  http://localhost:{window.location.port || "3000"}
                </a>
                .
              </p>
            </div>
          )}

          {localhostLoginUrl && (
            <div
              role="status"
              className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100"
            >
              <p className="font-semibold text-amber-400">Login Google: domeniu neautorizat</p>
              <p className="mt-1 text-[#e2e8f0]/90">
                Ești pe <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">127.0.0.1</code> — Firebase îl tratează separat de{" "}
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">localhost</code>.
              </p>
              <p className="mt-2 text-xs text-[#94a3b8]">
                <span className="font-medium text-[#e2e8f0]">Soluție rapidă:</span> deschide aplicația de aici:{" "}
                <a href={localhostLoginUrl} className="font-mono text-amber-400 underline hover:text-amber-300">
                  {localhostLoginUrl}
                </a>
              </p>
              <p className="mt-2 text-xs text-[#94a3b8]">
                <span className="font-medium text-[#e2e8f0]">Alternativ:</span> Firebase Console → Authentication → Settings →{" "}
                <span className="text-[#e2e8f0]">Authorized domains</span> → Add domain → introdu{" "}
                <code className="rounded bg-black/30 px-1">127.0.0.1</code> (fără port).
              </p>
            </div>
          )}

          {authHost?.hostname === "localhost" && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-xs text-[#94a3b8]">
              <span className="font-semibold text-[#e2e8f0]">Tot «unauthorized-domain» pe localhost?</span> Deschide Firebase pentru
              proiectul <code className="rounded bg-black/30 px-1">{firebaseConfig.projectId}</code> → Authentication → Settings →
              Authorized domains și confirmă că există <code className="rounded bg-black/30 px-1">localhost</code>. Dacă nu ai drepturi
              pe acel proiect (template / AI Studio), creează un proiect Firebase nou, activează Google, adaugă{" "}
              <code className="rounded bg-black/30 px-1">localhost</code>, apoi înlocuiește conținutul din{" "}
              <code className="rounded bg-black/30 px-1">firebase-applet-config.json</code> cu valorile noului proiect.
            </p>
          )}

          <div className="bg-[#161b22] p-8 rounded-3xl border border-white/5 shadow-2xl space-y-6">
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white text-black py-4 rounded-2xl font-bold hover:bg-gray-100 transition-all active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#161b22] px-2 text-[#4b5563]">Or continue with</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Email Address</label>
                <input 
                  type="email" 
                  disabled
                  placeholder="name@company.com"
                  className="w-full bg-[#0d1117] border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors opacity-50 cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Password</label>
                <input 
                  type="password" 
                  disabled
                  placeholder="••••••••"
                  className="w-full bg-[#0d1117] border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors opacity-50 cursor-not-allowed"
                />
              </div>
              <button 
                disabled
                className="w-full bg-amber-500 text-black py-4 rounded-2xl font-bold opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
              >
                Sign In <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <p className="text-center text-sm text-[#4b5563]">
            Don't have an account? <span className="text-amber-500 cursor-pointer hover:underline">Contact sales</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

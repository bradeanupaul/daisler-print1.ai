import React, { useState, useEffect, Suspense } from 'react';
import { 
  X, 
  Sparkles, 
  Download, 
  RefreshCw,
  Maximize2,
  Shirt,
  Smartphone,
  Monitor,
  Box,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Environment, 
  ContactShadows, 
  Float, 
  useTexture,
  Decal,
  Center
} from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '../lib/utils';
import { MockupType, MOCKUP_TYPES } from '../types';
import { generateCustomMockup, refineGeminiImageFromPrompt, type MockupGenerationResult } from '../services/gemini';
import * as openaiPrint from '../services/openaiPrint';
import { AiDualCompareDialog } from './AiDualCompareDialog';
import { toast } from 'sonner';

// --- 3D Mockup Components ---

function Scene({ designImage, type, zone, zundMode }: { designImage: string, type: MockupType, zone: string, zundMode: boolean }) {
  const texture = useTexture(designImage);
  
  // Placement logic based on zone
  const getPlacement = () => {
    if (type === 'tshirt' || type === 'hoodie') {
      switch (zone) {
        case 'back': return { position: [0, 0.2, -0.01], rotation: [0, Math.PI, 0], scale: [2, 2.5, 1] };
        case 'shoulder_left': return { position: [-0.8, 0.6, 0.2], rotation: [0, 0.5, 0], scale: [0.6, 0.6, 1] };
        case 'shoulder_right': return { position: [0.8, 0.6, 0.2], rotation: [0, -0.5, 0], scale: [0.6, 0.6, 1] };
        default: return { position: [0, 0.2, 0.01], rotation: [0, 0, 0], scale: [1.8, 2.2, 1] };
      }
    }
    return { position: [0, 0, 1.01], rotation: [0, 0, 0], scale: [1.8, 1.8, 1] };
  };

  const placement = getPlacement();

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} />
      <OrbitControls makeDefault enablePan={false} minDistance={2} maxDistance={10} />
      <Environment preset="studio" blur={0.5} />
      <ambientLight intensity={0.4} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
      
      <Center top>
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
          {type === 'mug' && (
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[1, 1, 2.5, 64]} />
              <meshStandardMaterial color="white" roughness={0.05} metalness={0.2} />
              <Decal position={[0, 0, 1]} rotation={[0, 0, 0]} scale={[2, 2, 1]}>
                <meshStandardMaterial map={texture} polygonOffset polygonOffsetFactor={-1} transparent />
              </Decal>
              {zundMode && (
                <Decal position={[0, 0, 1.05]} rotation={[0, 0, 0]} scale={[2.02, 2.02, 1]}>
                  <meshStandardMaterial color="#ff00ff" wireframe transparent opacity={0.6} />
                </Decal>
              )}
            </mesh>
          )}
          
          {type === 'box' && (
            <mesh castShadow receiveShadow>
              <boxGeometry args={[2, 2, 2]} />
              <meshStandardMaterial color="white" roughness={0.3} />
              <Decal position={[0, 0, 1.01]} scale={[1.8, 1.8, 1]}>
                <meshStandardMaterial map={texture} transparent polygonOffset polygonOffsetFactor={-1} />
              </Decal>
              {zundMode && (
                <Decal position={[0, 0, 1.1]} scale={[1.82, 1.82, 1]}>
                  <meshStandardMaterial color="#ff00ff" wireframe transparent opacity={0.5} />
                </Decal>
              )}
            </mesh>
          )}

          {(type === 'poster' || type === 'billboard') && (
            <group>
              <mesh castShadow receiveShadow>
                <planeGeometry args={[3, 4]} />
                <meshStandardMaterial map={texture} roughness={0.5} />
              </mesh>
              {zundMode && (
                <mesh position={[0, 0, 0.15]}>
                   <planeGeometry args={[3.05, 4.05]} />
                   <meshStandardMaterial color="#ff00ff" wireframe transparent opacity={0.5} />
                </mesh>
              )}
              {type === 'billboard' && (
                <mesh position={[0, 0, -0.1]}>
                  <boxGeometry args={[3.2, 4.2, 0.1]} />
                  <meshStandardMaterial color="#0a0a0a" metalness={0.8} roughness={0.2} />
                </mesh>
              )}
            </group>
          )}

          {(type === 'tshirt' || type === 'hoodie') && (
            <mesh castShadow receiveShadow>
              <planeGeometry args={[3, 3.5]} />
              <meshStandardMaterial color="#f0f0f0" roughness={0.9} />
              <Decal 
                position={placement.position as [number, number, number]} 
                rotation={placement.rotation as [number, number, number]} 
                scale={placement.scale as [number, number, number]}
              >
                <meshStandardMaterial map={texture} transparent opacity={0.9} polygonOffset polygonOffsetFactor={-1} />
              </Decal>
              {zundMode && (
                <Decal 
                  position={[placement.position[0], placement.position[1], placement.position[2] + 0.1]} 
                  rotation={placement.rotation as [number, number, number]} 
                  scale={[placement.scale[0] + 0.05, placement.scale[1] + 0.05, 1]}
                >
                  <meshStandardMaterial color="#ff00ff" wireframe transparent opacity={0.4} />
                </Decal>
              )}
            </mesh>
          )}

          {type === 'cap' && (
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[1, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="white" roughness={0.8} />
              <Decal position={[0, 0.5, 0.8]} rotation={[-0.5, 0, 0]} scale={[0.8, 0.8, 1]}>
                <meshStandardMaterial map={texture} transparent polygonOffset polygonOffsetFactor={-1} />
              </Decal>
              {zundMode && (
                <Decal position={[0, 0.5, 0.9]} rotation={[-0.5, 0, 0]} scale={[0.85, 0.85, 1]}>
                  <meshStandardMaterial color="#ff00ff" wireframe transparent opacity={0.5} />
                </Decal>
              )}
            </mesh>
          )}
        </Float>
      </Center>
      
      <ContactShadows position={[0, -2, 0]} opacity={0.6} scale={15} blur={2.5} far={4.5} />
    </>
  );
}

interface MockupViewerProps {
  designImage: string;
  onClose: () => void;
  initialType: MockupType;
  hasKey: boolean;
  handleSelectKey: () => void;
  targetDpi?: number;
}

export function MockupViewer({
  designImage,
  onClose,
  initialType,
  hasKey,
  handleSelectKey,
  targetDpi = 300,
}: MockupViewerProps) {
  const [type, setType] = useState<MockupType>(initialType);
  const [zone, setZone] = useState<'front' | 'back' | 'shoulder_left' | 'shoulder_right'>('front');
  const [viewMode, setViewMode] = useState<'3d' | 'ai'>('3d');
  const [zundMode, setZundMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [dualPicker, setDualPicker] = useState<Extract<MockupGenerationResult, { kind: 'dual' }> | null>(null);

  const generateMockup = async (prompt?: string) => {
    setIsGenerating(true);
    setError(null);
    const loadingToast = toast.loading("Se generează mockupul…");
    try {
      const result = await generateCustomMockup(
        prompt || `A professional studio mockup of a ${type} with this design`,
        designImage,
        localStorage.getItem('gemini_api_key') || undefined,
        undefined,
        targetDpi,
      );

      if (result.kind === 'dual') {
        toast.dismiss(loadingToast);
        const gUrl = result.gemini.imageUrl;
        const oUrl = result.openai.imageUrl;
        if (!gUrl && !oUrl) {
          const blob = `${result.gemini.error || ''} ${result.openai.error || ''}`;
          const invalidKey =
            blob.includes('INVALID_API_KEY') ||
            /invalid api key|401|incorrect api key/i.test(blob);
          if (invalidKey) {
            setError('API Key invalid. Verifică setările.');
            toast.error('Cheie API invalidă');
            handleSelectKey();
          } else {
            setError('Ambele generări au eșuat. Încearcă din nou.');
            toast.error('Mockup: ambele modele au eșuat');
          }
          return;
        }
        setDualPicker(result);
        return;
      }

      if (result.imageUrl) {
        setMockupUrl(result.imageUrl);
        setViewMode('ai');
        toast.dismiss(loadingToast);
        toast.success(`Mockup gata (${result.provider === 'gemini' ? 'Gemini' : 'OpenAI'}).`);
      } else {
        throw new Error('EMPTY_RESPONSE');
      }
    } catch (err: any) {
      console.error("Mockup failed:", err);
      toast.dismiss(loadingToast);
      if (err.message === "INVALID_API_KEY") {
        setError("API Key invalid. Please check your settings.");
        toast.error("Invalid API Key");
        handleSelectKey();
      } else if (err.message === "EMPTY_RESPONSE") {
        setError("The AI didn't return an image. Try again.");
        toast.error("Empty AI response");
      } else if (err.message?.includes("User location is not supported")) {
        setError("This AI feature is not available in your region.");
        toast.error("Region not supported");
      } else {
        setError("Failed to generate mockup. The AI model might be busy.");
        toast.error("Generation failed");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const finalizeDualPickGemini = (url: string | null) => {
    if (!url) {
      toast.error('Varianta aleasă nu are imagine.');
      return;
    }
    setMockupUrl(url);
    setViewMode('ai');
    setDualPicker(null);
    toast.success('Ai ales varianta Gemini.');
  };

  const finalizeDualPickOpenai = (url: string | null) => {
    if (!url) {
      toast.error('Varianta aleasă nu are imagine.');
      return;
    }
    setMockupUrl(url);
    setViewMode('ai');
    setDualPicker(null);
    toast.success('Ai ales varianta OpenAI.');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8"
    >
      <div className="bg-[#16191e] border border-[#2d333b] rounded-3xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-[#2d333b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Maximize2 className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Mockup Studio</h2>
              <p className="text-xs text-[#94a3b8]">3D Visualization & AI Generation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#0d1117] rounded-lg p-1 border border-[#2d333b]">
              <button 
                onClick={() => setViewMode('3d')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                  viewMode === '3d' ? "bg-amber-500 text-black shadow-lg" : "text-[#94a3b8] hover:text-white"
                )}
              >
                3D View
              </button>
              <button 
                onClick={() => setViewMode('ai')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                  viewMode === 'ai' ? "bg-amber-500 text-black shadow-lg" : "text-[#94a3b8] hover:text-white"
                )}
              >
                AI Photo
              </button>
            </div>
            <div className="w-[1px] h-8 bg-[#2d333b] mx-2" />
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="flex-1 bg-[#0d1117] relative flex items-center justify-center">
            <AnimatePresence mode="wait">
              {viewMode === '3d' ? (
                <motion.div 
                  key="3d"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full"
                >
                  <Canvas shadows dpr={[1, 2]}>
                    <Suspense fallback={null}>
                      <Scene designImage={designImage} type={type} zone={zone} zundMode={zundMode} />
                    </Suspense>
                  </Canvas>
                  <div className="absolute bottom-6 left-6 flex flex-col gap-2">
                    <button 
                      onClick={() => setZundMode(!zundMode)}
                      className={cn(
                        "flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full border backdrop-blur-md transition-all",
                        zundMode 
                          ? "bg-amber-500 border-amber-500 text-black shadow-lg shadow-amber-500/20" 
                          : "bg-black/50 border-white/10 text-[#94a3b8] hover:text-white"
                      )}
                    >
                      <Layers className="w-3 h-3" />
                      ZÜND 2.5D VIEW {zundMode ? 'ON' : 'OFF'}
                    </button>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-[#94a3b8] bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 w-fit">
                      <RefreshCw className="w-3 h-3 animate-spin-slow" />
                      DRAG TO ROTATE • SCROLL TO ZOOM
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="w-full h-full flex items-center justify-center p-8">
                  {isGenerating ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                      <p className="text-sm font-medium text-amber-500 animate-pulse">AI is crafting your mockup...</p>
                    </motion.div>
                  ) : mockupUrl ? (
                    <motion.img 
                      key="mockup"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={mockupUrl}
                      alt="Mockup"
                      className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                    />
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-20 h-20 rounded-full bg-[#1a1d23] flex items-center justify-center mx-auto">
                        <Sparkles className="w-8 h-8 text-[#2d333b]" />
                      </div>
                      <p className="text-[#94a3b8]">Click "Generate AI Photo" to create a realistic scene</p>
                      {error && (
                        <p className="text-xs text-red-500 bg-red-500/10 py-2 px-4 rounded-lg">{error}</p>
                      )}
                      <button 
                        onClick={() => generateMockup()}
                        className="px-6 py-2 bg-amber-500 text-black rounded-xl text-xs font-bold uppercase hover:bg-amber-600 transition-colors"
                      >
                        Generate Now
                      </button>
                    </div>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[#2d333b] p-6 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">Product Type</label>
              <div className="grid grid-cols-2 gap-2">
                {MOCKUP_TYPES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setType(m.id as MockupType)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border",
                      type === m.id 
                        ? "bg-amber-500 border-amber-500 text-black shadow-lg shadow-amber-500/20" 
                        : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-white/20 hover:text-white"
                    )}
                  >
                    <m.icon className={cn(
                      "w-4 h-4",
                      type === m.id ? "text-black" : "text-[#94a3b8]"
                    )} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {(type === 'tshirt' || type === 'hoodie') && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">Placement Zone</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'front', label: 'Piept (Față)' },
                    { id: 'back', label: 'Spate' },
                    { id: 'shoulder_left', label: 'Umăr Stâng' },
                    { id: 'shoulder_right', label: 'Umăr Drept' }
                  ].map(z => (
                    <button
                      key={z.id}
                      onClick={() => setZone(z.id as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                        zone === z.id 
                          ? "bg-white border-white text-black" 
                          : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-white/20"
                      )}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">AI Custom Prompt</label>
                <Sparkles className="w-3 h-3 text-amber-500" />
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Ex: A mug on a wooden table in a cozy cafe with morning sunlight..."
                className="w-full bg-[#0d1117] border border-[#2d333b] rounded-xl p-3 text-xs min-h-[100px] focus:outline-none focus:border-amber-500 transition-colors resize-none"
              />
              <button
                onClick={() => generateMockup(customPrompt)}
                disabled={isGenerating}
                className="w-full py-3 bg-amber-500 text-black rounded-xl text-xs font-bold uppercase hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Generate AI Photo
              </button>
            </div>

            {mockupUrl && viewMode === 'ai' && (
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = mockupUrl;
                  a.download = `mockup_${type}.png`;
                  a.click();
                }}
                className="w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl text-xs font-bold uppercase hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download AI Photo
              </button>
            )}
          </div>
        </div>
      </div>

      {dualPicker && (
        <AiDualCompareDialog
          open
          onClose={() => setDualPicker(null)}
          title="Compară mockup-urile (mod debug)"
          subtitle="Alege varianta sau rafinează punctual fiecare imagine înainte de a decide."
          gemini={dualPicker.gemini}
          openai={dualPicker.openai}
          onPickGemini={finalizeDualPickGemini}
          onPickOpenai={finalizeDualPickOpenai}
          refineWithGemini={(u, p) => refineGeminiImageFromPrompt(u, p, undefined, targetDpi)}
          refineWithOpenai={(u, p) => openaiPrint.quickImageEditFromPrompt(u, p, 1, 1, undefined, targetDpi)}
          zIndexClass="z-[200]"
        />
      )}
    </motion.div>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Check, Database, Layout, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Simple pixel art icon for the loader
function PixelArtIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} width={size} height={size} style={{ imageRendering: 'pixelated' }}>
      <rect x="8" y="4" width="16" height="4" fill="#6366f1"/>
      <rect x="6" y="6" width="4" height="2" fill="#6366f1"/>
      <rect x="22" y="6" width="4" height="2" fill="#6366f1"/>
      <rect x="4" y="8" width="24" height="16" fill="#818cf8"/>
      <rect x="6" y="8" width="20" height="2" fill="#6366f1"/>
      <rect x="6" y="10" width="20" height="12" fill="#c7d2fe"/>
      <rect x="8" y="12" width="6" height="2" fill="#4f46e5"/>
      <rect x="16" y="12" width="8" height="2" fill="#a5b4fc"/>
      <rect x="8" y="15" width="16" height="1" fill="#e0e7ff"/>
      <rect x="8" y="17" width="4" height="2" fill="#4f46e5"/>
      <rect x="14" y="17" width="10" height="2" fill="#a5b4fc"/>
      <rect x="10" y="24" width="4" height="2" fill="#6366f1"/>
      <rect x="18" y="24" width="4" height="2" fill="#6366f1"/>
      <rect x="8" y="26" width="6" height="2" fill="#4f46e5"/>
      <rect x="18" y="26" width="6" height="2" fill="#4f46e5"/>
      <rect x="12" y="14" width="2" height="2" fill="#f59e0b"/>
    </svg>
  );
}

interface LoadingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  duration: number; // milliseconds
}

const LOADING_STEPS: LoadingStep[] = [
  { id: 'database', label: 'Initializing database', icon: <Database className="w-4 h-4" />, duration: 600 },
  { id: 'workspace', label: 'Preparing workspace', icon: <Layout className="w-4 h-4" />, duration: 500 },
  { id: 'ready', label: 'Ready to go', icon: <Sparkles className="w-4 h-4" />, duration: 400 },
];

interface AppLoaderProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

export function AppLoader({ onComplete, minDisplayTime = 1500 }: AppLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isExiting, setIsExiting] = useState(false);

  // Progress bar percentage (0-100)
  const progress = ((currentStep + 1) / LOADING_STEPS.length) * 100;

  useEffect(() => {
    let stepTimer: NodeJS.Timeout;
    
    const runStep = (stepIndex: number) => {
      if (stepIndex >= LOADING_STEPS.length) {
        // All steps complete, show completion state briefly
        setTimeout(() => {
          setIsExiting(true);
          // Wait for exit animation then call onComplete
          setTimeout(onComplete, 400);
        }, 300);
        return;
      }

      setCurrentStep(stepIndex);
      
      stepTimer = setTimeout(() => {
        setCompletedSteps(prev => {
          const next = new Set(Array.from(prev));
          next.add(stepIndex);
          return next;
        });
        runStep(stepIndex + 1);
      }, LOADING_STEPS[stepIndex].duration);
    };

    // Start the sequence after a brief delay
    const startTimer = setTimeout(() => runStep(0), 200);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(stepTimer);
    };
  }, [onComplete, minDisplayTime]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950"
          data-testid="app-loader"
        >
          {/* Subtle background gradient animation */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/30 via-zinc-950 to-indigo-950/30" />
          
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="relative z-10 flex flex-col items-center gap-8 px-6"
          >
            {/* Logo */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            >
              <PixelArtIcon size={64} className="drop-shadow-lg" />
            </motion.div>

            {/* App name */}
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold text-white tracking-tight"
            >
              Elegant Joins
            </motion.h1>

            {/* Progress container */}
            <div className="w-72 space-y-4">
              {/* Progress bar */}
              <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                />
              </div>

              {/* Steps list */}
              <div className="space-y-2">
                {LOADING_STEPS.map((step, index) => {
                  const isComplete = completedSteps.has(index);
                  const isCurrent = currentStep === index && !isComplete;
                  const isPending = index > currentStep;

                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 + 0.3 }}
                      className={cn(
                        "flex items-center gap-3 text-sm transition-colors duration-300",
                        isComplete ? "text-emerald-400" : isCurrent ? "text-white" : "text-zinc-500"
                      )}
                    >
                      {/* Step icon */}
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300",
                        isComplete ? "bg-emerald-500/20" : isCurrent ? "bg-violet-500/20" : "bg-zinc-800"
                      )}>
                        {isComplete ? (
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', damping: 10, stiffness: 200 }}
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          </motion.div>
                        ) : isCurrent ? (
                          <motion.div
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.2 }}
                            className="text-violet-400"
                          >
                            {step.icon}
                          </motion.div>
                        ) : (
                          <span className="text-zinc-600">{step.icon}</span>
                        )}
                      </div>

                      {/* Step label */}
                      <span className={cn(
                        "transition-all duration-300",
                        isCurrent && "font-medium"
                      )}>
                        {step.label}
                        {isCurrent && (
                          <motion.span
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                          >
                            ...
                          </motion.span>
                        )}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

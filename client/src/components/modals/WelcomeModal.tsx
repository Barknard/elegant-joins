import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, Sparkles, Play, X } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTutorial: () => void;
  onLoadSampleData: () => void;
  onStartBlank?: () => void;
}

function PixelArtIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
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
      <rect x="20" y="19" width="2" height="2" fill="#10b981"/>
    </svg>
  );
}

export function WelcomeModal({ isOpen, onClose, onStartTutorial, onLoadSampleData, onStartBlank }: WelcomeModalProps) {
  const [showContent, setShowContent] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setShowContent(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (dontShowAgain) {
      markAsVisited();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        data-testid="welcome-modal"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg mx-3 sm:mx-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-600/20 via-purple-600/20 to-fuchsia-600/20 blur-xl" />
          
          {/* Main card */}
          <div className="relative bg-zinc-900/95 border border-zinc-700/50 rounded-2xl overflow-hidden shadow-2xl">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all z-10"
              data-testid="button-close-welcome"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header with animated logo */}
            <div className="relative pt-6 sm:pt-10 pb-4 sm:pb-6 px-4 sm:px-8 text-center overflow-hidden">
              {/* Animated particles - hidden on very small screens */}
              <motion.div
                className="absolute inset-0 pointer-events-none hidden sm:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-violet-400/30"
                    initial={{ 
                      x: '50%', 
                      y: '50%',
                      scale: 0 
                    }}
                    animate={{ 
                      x: `${30 + Math.random() * 40}%`,
                      y: `${20 + Math.random() * 60}%`,
                      scale: [0, 1, 0],
                    }}
                    transition={{
                      duration: 3,
                      delay: i * 0.3,
                      repeat: Infinity,
                      repeatDelay: 1
                    }}
                  />
                ))}
              </motion.div>

              {/* 60s Style 8-bit Pixel Art Logo */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, delay: 0.2 }}
                className="relative inline-flex items-center justify-center w-16 h-16 sm:w-24 sm:h-24 mb-3 sm:mb-4"
              >
                <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 blur-lg opacity-50" />
                <div className="relative w-full h-full rounded-xl sm:rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 border-2 border-violet-500/50 flex items-center justify-center shadow-lg overflow-hidden">
                  <PixelArtIcon className="w-10 h-10 sm:w-16 sm:h-16" />
                </div>
                <motion.div
                  className="absolute -top-1 -right-1"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                </motion.div>
              </motion.div>

              {/* Title */}
              <AnimatePresence>
                {showContent && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">
                      Welcome to Elegant Joins
                    </h1>
                    <p className="text-zinc-400 text-xs sm:text-sm">
                      Visual database tool for CSV & Excel files
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Content */}
            <AnimatePresence>
              {showContent && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="px-4 sm:px-8 pb-4 sm:pb-8"
                >
                  {/* Features */}
                  <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-8">
                    {[
                      { icon: '📊', text: 'Drag & drop your data files' },
                      { icon: '🔗', text: 'Connect tables visually' },
                      { icon: '⚡', text: 'Build views with joins' },
                      { icon: '🔒', text: '100% local - your data stays private' }
                    ].map((feature, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="flex items-center gap-2 sm:gap-3 text-zinc-300"
                      >
                        <span className="text-base sm:text-lg">{feature.icon}</span>
                        <span className="text-xs sm:text-sm">{feature.text}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Single Primary Action */}
                  <div className="space-y-3">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                    >
                      <Button
                        onClick={() => {
                          if (dontShowAgain) {
                            markAsVisited();
                          }
                          onLoadSampleData();
                          onClose();
                        }}
                        className="w-full h-12 sm:h-14 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-base sm:text-lg font-medium rounded-xl transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                        data-testid="button-get-started"
                      >
                        <Play className="w-5 h-5" />
                        Get Started
                      </Button>
                      <p className="text-center text-[10px] sm:text-xs text-zinc-500 mt-2">
                        We'll load sample data so you can explore right away
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.9 }}
                      className="flex items-center justify-center gap-4 pt-2"
                    >
                      <button
                        onClick={() => {
                          if (dontShowAgain) {
                            markAsVisited();
                          }
                          onLoadSampleData();
                          onStartTutorial();
                        }}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors underline-offset-2 hover:underline"
                        data-testid="button-start-tutorial"
                      >
                        Take a quick tour
                      </button>
                      <span className="text-zinc-600">•</span>
                      <button
                        onClick={() => {
                          if (dontShowAgain) {
                            markAsVisited();
                          }
                          if (onStartBlank) {
                            onStartBlank();
                          }
                          onClose();
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline-offset-2 hover:underline"
                        data-testid="button-skip-welcome"
                      >
                        Start with empty canvas
                      </button>
                    </motion.div>
                  </div>

                  {/* Don't show again checkbox */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.05 }}
                    className="flex items-center justify-center gap-2 mt-3 sm:mt-4"
                  >
                    <Checkbox 
                      id="dont-show-again"
                      checked={dontShowAgain}
                      onCheckedChange={(checked) => setDontShowAgain(checked === true)}
                      className="border-zinc-600 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600 w-4 h-4"
                      data-testid="checkbox-dont-show-again"
                    />
                    <label 
                      htmlFor="dont-show-again" 
                      className="text-[11px] sm:text-xs text-zinc-400 cursor-pointer select-none"
                    >
                      Don't show this at startup
                    </label>
                  </motion.div>

                  {/* Privacy note */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.1 }}
                    className="text-center text-[10px] sm:text-xs text-zinc-500 mt-2 sm:mt-4"
                  >
                    Your data never leaves your computer
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Utility to check if this is the first run
export function isFirstRun(): boolean {
  const hasVisited = localStorage.getItem('elegantjoins_visited');
  return !hasVisited;
}

export function markAsVisited(): void {
  localStorage.setItem('elegantjoins_visited', 'true');
  localStorage.setItem('elegantjoins_visited_at', new Date().toISOString());
}

export function resetFirstRun(): void {
  localStorage.removeItem('elegantjoins_visited');
  localStorage.removeItem('elegantjoins_visited_at');
}

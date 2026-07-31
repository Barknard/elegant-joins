import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ArrowRight, ArrowLeft, Check, ChevronRight } from 'lucide-react';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for spotlight element
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: string; // Optional hint about what action to take
}

const DEFAULT_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Your Data Canvas',
    description: 'This is your workspace. Tables appear here as draggable cards that you can arrange however you like.',
    target: '.react-flow__viewport',
    position: 'center'
  },
  {
    id: 'tables',
    title: 'Table Cards',
    description: 'Each table shows its columns and data types. Key fields are marked with a gold star. Click on a table to edit its schema.',
    target: '.react-flow__node',
    position: 'right'
  },
  {
    id: 'connections',
    title: 'Connect Tables',
    description: 'Drag from one field\'s link icon to another to create relationships. The line between tables shows how records are joined.',
    target: '.react-flow__edge',
    position: 'bottom'
  },
  {
    id: 'add-data',
    title: 'Add Your Data',
    description: 'Click the + button to import your own CSV or Excel files. They\'ll appear as new table cards on the canvas.',
    target: '[data-testid="button-add-source"]',
    position: 'left'
  },
  {
    id: 'view-builder',
    title: 'Build Views',
    description: 'Click the View Builder button to combine connected tables into a single view using joins. Export the result as a new file!',
    target: '[data-testid="button-open-view-builder"]',
    position: 'left'
  }
];

interface TutorialOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  steps?: TutorialStep[];
  onComplete?: () => void;
}

export function TutorialOverlay({ 
  isOpen, 
  onClose, 
  steps = DEFAULT_STEPS,
  onComplete 
}: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  // Update spotlight position when step changes
  useEffect(() => {
    if (!isOpen || !step?.target) {
      setSpotlightRect(null);
      return;
    }

    const updateSpotlight = () => {
      const element = document.querySelector(step.target!);
      if (element) {
        const rect = element.getBoundingClientRect();
        setSpotlightRect(rect);
      } else {
        setSpotlightRect(null);
      }
    };

    // Initial update
    updateSpotlight();

    // Update on resize/scroll
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight);

    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight);
    };
  }, [isOpen, step?.target, currentStep]);

  const handleNext = () => {
    if (isLastStep) {
      onComplete?.();
      onClose();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!spotlightRect || step.position === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const padding = 20;
    const tooltipWidth = 340;
    const tooltipHeight = 200;

    switch (step.position) {
      case 'right':
        return {
          top: Math.max(padding, Math.min(
            spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2,
            window.innerHeight - tooltipHeight - padding
          )),
          left: Math.min(
            spotlightRect.right + padding,
            window.innerWidth - tooltipWidth - padding
          )
        };
      case 'left':
        return {
          top: Math.max(padding, Math.min(
            spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2,
            window.innerHeight - tooltipHeight - padding
          )),
          left: Math.max(
            padding,
            spotlightRect.left - tooltipWidth - padding
          )
        };
      case 'bottom':
        return {
          top: Math.min(
            spotlightRect.bottom + padding,
            window.innerHeight - tooltipHeight - padding
          ),
          left: Math.max(padding, Math.min(
            spotlightRect.left + spotlightRect.width / 2 - tooltipWidth / 2,
            window.innerWidth - tooltipWidth - padding
          ))
        };
      case 'top':
        return {
          top: Math.max(
            padding,
            spotlightRect.top - tooltipHeight - padding
          ),
          left: Math.max(padding, Math.min(
            spotlightRect.left + spotlightRect.width / 2 - tooltipWidth / 2,
            window.innerWidth - tooltipWidth - padding
          ))
        };
      default:
        return {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        };
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] pointer-events-auto"
        data-testid="tutorial-overlay"
      >
        {/* Dark overlay with spotlight cutout - enhanced visibility */}
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <mask id="spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {spotlightRect && (
                <motion.rect
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  x={spotlightRect.left - 16}
                  y={spotlightRect.top - 16}
                  width={spotlightRect.width + 32}
                  height={spotlightRect.height + 32}
                  rx="16"
                  fill="black"
                />
              )}
            </mask>
            {/* Gradient glow filter */}
            <filter id="spotlight-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.8)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Spotlight border glow - enhanced with pulsing animation */}
        {spotlightRect && (
          <>
            {/* Outer glow ring */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ 
                opacity: [0.3, 0.6, 0.3], 
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute pointer-events-none"
              style={{
                left: spotlightRect.left - 20,
                top: spotlightRect.top - 20,
                width: spotlightRect.width + 40,
                height: spotlightRect.height + 40,
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(236, 72, 153, 0.3))',
                filter: 'blur(8px)'
              }}
            />
            {/* Inner highlight border */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute pointer-events-none"
              style={{
                left: spotlightRect.left - 12,
                top: spotlightRect.top - 12,
                width: spotlightRect.width + 24,
                height: spotlightRect.height + 24,
                borderRadius: 16,
                border: '3px solid rgba(139, 92, 246, 0.8)',
                boxShadow: '0 0 30px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(139, 92, 246, 0.1)'
              }}
            />
            {/* Corner accents */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute pointer-events-none"
              style={{
                left: spotlightRect.left - 18,
                top: spotlightRect.top - 18,
                width: 12,
                height: 12,
                borderLeft: '3px solid #8b5cf6',
                borderTop: '3px solid #8b5cf6',
                borderTopLeftRadius: 8
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute pointer-events-none"
              style={{
                right: window.innerWidth - spotlightRect.right - 18,
                top: spotlightRect.top - 18,
                width: 12,
                height: 12,
                borderRight: '3px solid #8b5cf6',
                borderTop: '3px solid #8b5cf6',
                borderTopRightRadius: 8
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute pointer-events-none"
              style={{
                left: spotlightRect.left - 18,
                bottom: window.innerHeight - spotlightRect.bottom - 18,
                width: 12,
                height: 12,
                borderLeft: '3px solid #8b5cf6',
                borderBottom: '3px solid #8b5cf6',
                borderBottomLeftRadius: 8
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute pointer-events-none"
              style={{
                right: window.innerWidth - spotlightRect.right - 18,
                bottom: window.innerHeight - spotlightRect.bottom - 18,
                width: 12,
                height: 12,
                borderRight: '3px solid #8b5cf6',
                borderBottom: '3px solid #8b5cf6',
                borderBottomRightRadius: 8
              }}
            />
          </>
        )}

        {/* Tutorial tooltip */}
        <motion.div
          ref={tooltipRef}
          key={currentStep}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute w-[340px] bg-zinc-900/95 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm"
          style={getTooltipStyle()}
          data-testid="tutorial-tooltip"
        >
          {/* Progress bar */}
          <div className="h-1 bg-zinc-800">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-violet-400">
                Step {currentStep + 1} of {steps.length}
              </span>
              <button
                onClick={handleSkip}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                data-testid="button-skip-tutorial"
              >
                Skip tutorial
              </button>
            </div>

            {/* Title & description */}
            <h3 className="text-lg font-semibold text-white mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              {step.description}
            </p>

            {/* Action hint */}
            {step.action && (
              <div className="flex items-center gap-2 text-xs text-violet-300 bg-violet-500/10 px-3 py-2 rounded-lg mb-4">
                <ChevronRight className="w-3 h-3" />
                {step.action}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="text-zinc-400 hover:text-white disabled:opacity-30"
                data-testid="button-tutorial-prev"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>

              <Button
                size="sm"
                onClick={handleNext}
                className="bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center gap-1"
                data-testid="button-tutorial-next"
              >
                {isLastStep ? (
                  <>
                    <Check className="w-4 h-4" />
                    Done
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Dots indicator */}
          <div className="flex items-center justify-center gap-1.5 pb-4">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === currentStep 
                    ? 'w-4 bg-violet-500' 
                    : i < currentStep 
                      ? 'bg-violet-400/50' 
                      : 'bg-zinc-600'
                }`}
                data-testid={`button-tutorial-dot-${i}`}
              />
            ))}
          </div>
        </motion.div>

        {/* Close button in corner */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 rounded-lg bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
          data-testid="button-close-tutorial"
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook to manage tutorial state
export function useTutorial() {
  const [isOpen, setIsOpen] = useState(false);

  const startTutorial = () => setIsOpen(true);
  const closeTutorial = () => setIsOpen(false);

  return {
    isOpen,
    startTutorial,
    closeTutorial
  };
}

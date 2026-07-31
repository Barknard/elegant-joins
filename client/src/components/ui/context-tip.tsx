import { motion, AnimatePresence } from 'framer-motion';
import { X, Lightbulb } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ContextTipProps {
  id: string; // Unique ID to track if user dismissed this tip
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number; // Delay before showing (ms)
  duration?: number; // Auto-dismiss after duration (ms), 0 = never
  className?: string;
  showOnce?: boolean; // Only show once per session
}

// Track dismissed tips in this session
const dismissedTips = new Set<string>();

// Track permanently dismissed tips in localStorage
const STORAGE_KEY = 'elegantjoins_dismissed_tips';

function getDismissedTips(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore storage errors
  }
  return new Set();
}

function saveDismissedTip(id: string) {
  try {
    const dismissed = getDismissedTips();
    dismissed.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(dismissed)));
  } catch {
    // Ignore storage errors
  }
}

export function ContextTip({
  id,
  message,
  position = 'bottom',
  delay = 1000,
  duration = 0,
  className,
  showOnce = false
}: ContextTipProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    if (dismissedTips.has(id)) return;
    if (showOnce && getDismissedTips().has(id)) return;

    // Show after delay
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    // Auto-dismiss if duration is set
    let hideTimer: NodeJS.Timeout;
    if (duration > 0) {
      hideTimer = setTimeout(() => {
        handleDismiss();
      }, delay + duration);
    }

    return () => {
      clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [id, delay, duration, showOnce]);

  const handleDismiss = () => {
    setIsVisible(false);
    dismissedTips.add(id);
    if (showOnce) {
      saveDismissedTip(id);
    }
  };

  const positionStyles = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2'
  };

  const arrowStyles = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-violet-600',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-violet-600',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-violet-600',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-violet-600'
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: position === 'bottom' ? -10 : position === 'top' ? 10 : 0 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className={cn(
            "absolute z-50 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs shadow-lg max-w-[200px]",
            positionStyles[position],
            className
          )}
          data-testid={`context-tip-${id}`}
        >
          {/* Arrow */}
          <div className={cn(
            "absolute w-0 h-0 border-4",
            arrowStyles[position]
          )} />
          
          <div className="flex items-start gap-2">
            <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-200" />
            <span className="flex-1">{message}</span>
            <button
              onClick={handleDismiss}
              className="shrink-0 p-0.5 rounded hover:bg-violet-500 transition-colors"
              data-testid={`button-dismiss-tip-${id}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Predefined tips for common scenarios
export const CONTEXT_TIPS = {
  FIRST_TABLE: {
    id: 'first-table-added',
    message: 'Great! Add another table and connect them with a relationship.'
  },
  DRAG_HANDLE: {
    id: 'drag-handle',
    message: 'Drag from the header bar to move this table around.'
  },
  KEY_FIELD: {
    id: 'key-field',
    message: 'Key fields (with the star) can be connected to other tables.'
  },
  CONNECTION_MADE: {
    id: 'connection-made',
    message: 'Nice! Click the link icon to see or edit the relationship.'
  },
  VIEW_BUILDER: {
    id: 'view-builder',
    message: 'Use View Builder to combine your connected tables.'
  },
  RIGHT_CLICK: {
    id: 'right-click',
    message: 'Right-click tables and fields for more options.'
  }
} as const;

// Hook to manage context tips
export function useContextTips() {
  const [shownTips, setShownTips] = useState<Set<string>>(new Set());

  const showTip = (tipId: string) => {
    if (!dismissedTips.has(tipId) && !getDismissedTips().has(tipId)) {
      setShownTips(prev => {
        const next = new Set(Array.from(prev));
        next.add(tipId);
        return next;
      });
    }
  };

  const hideTip = (tipId: string) => {
    setShownTips(prev => {
      const next = new Set(Array.from(prev));
      next.delete(tipId);
      return next;
    });
  };

  const isTipVisible = (tipId: string) => shownTips.has(tipId);

  return { showTip, hideTip, isTipVisible };
}

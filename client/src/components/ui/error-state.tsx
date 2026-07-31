import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, ArrowLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  onBack?: () => void;
  onHelp?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ErrorState({
  title = "Something went wrong",
  message,
  details,
  onRetry,
  onBack,
  onHelp,
  className,
  size = 'md'
}: ErrorStateProps) {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  const containerSizes = {
    sm: 'max-w-sm p-4',
    md: 'max-w-md p-6',
    lg: 'max-w-lg p-8'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        containerSizes[size],
        className
      )}
      data-testid="error-state"
    >
      {/* Animated icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
        className="mb-4"
      >
        <div className={cn(
          "rounded-full bg-red-100 dark:bg-red-900/30 p-3",
          size === 'lg' && 'p-4'
        )}>
          <AlertCircle className={cn(
            "text-red-500 dark:text-red-400",
            iconSizes[size]
          )} />
        </div>
      </motion.div>

      {/* Title */}
      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className={cn(
          "font-semibold text-zinc-900 dark:text-zinc-100 mb-2",
          size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg'
        )}
      >
        {title}
      </motion.h3>

      {/* Message - plain language */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className={cn(
          "text-zinc-600 dark:text-zinc-400 mb-4",
          size === 'sm' ? 'text-sm' : 'text-base'
        )}
      >
        {message}
      </motion.p>

      {/* Technical details (collapsed by default) */}
      {details && (
        <motion.details
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="w-full mb-4 text-left"
        >
          <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            Technical details
          </summary>
          <pre className="mt-2 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-mono text-zinc-600 dark:text-zinc-400 overflow-x-auto max-h-32 overflow-y-auto">
            {details}
          </pre>
        </motion.details>
      )}

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-wrap gap-2 justify-center"
      >
        {onRetry && (
          <Button
            onClick={onRetry}
            className="gap-2"
            data-testid="button-error-retry"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        )}
        
        {onBack && (
          <Button
            variant="outline"
            onClick={onBack}
            className="gap-2"
            data-testid="button-error-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        )}

        {onHelp && (
          <Button
            variant="ghost"
            onClick={onHelp}
            className="gap-2 text-zinc-500"
            data-testid="button-error-help"
          >
            <HelpCircle className="w-4 h-4" />
            Get Help
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}

// Pre-defined error messages for common scenarios
export const ERROR_MESSAGES = {
  FILE_UPLOAD: {
    title: "Couldn't read your file",
    message: "The file might be corrupted or in an unsupported format. Try saving it as a fresh CSV or Excel file and uploading again."
  },
  FILE_TOO_LARGE: {
    title: "File is too large",
    message: "This file is bigger than we can handle right now. Try splitting it into smaller files or removing unnecessary columns."
  },
  NETWORK: {
    title: "Connection problem",
    message: "We couldn't connect to save your work. Check your internet connection and try again."
  },
  SAVE_FAILED: {
    title: "Couldn't save your project",
    message: "Something went wrong while saving. Your work is still here - try saving again in a moment."
  },
  LOAD_FAILED: {
    title: "Couldn't open this project",
    message: "The project file might be damaged or from an older version. Try opening a different project."
  },
  JOIN_FAILED: {
    title: "Couldn't combine these tables",
    message: "Make sure the columns you're linking have matching types. For example, don't try to match text with numbers."
  },
  GENERIC: {
    title: "Something went wrong",
    message: "An unexpected error occurred. Try refreshing the page or starting over."
  }
} as const;

import { useRef, useEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function FloatingMenu({
  isOpen,
  position,
  onClose,
  title,
  children,
  className
}: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    setAdjustedPosition(position);
  }, [position]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = position.x;
    let newY = position.y;

    if (position.x + rect.width > viewportWidth - 16) {
      newX = position.x - rect.width;
    }
    if (position.y + rect.height > viewportHeight - 16) {
      newY = position.y - rect.height;
    }

    newX = Math.max(16, newX);
    newY = Math.max(16, newY);

    if (newX !== adjustedPosition.x || newY !== adjustedPosition.y) {
      setAdjustedPosition({ x: newX, y: newY });
    }
  }, [isOpen, position, adjustedPosition]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 30
        }}
        className={cn(
          "fixed z-[9999] min-w-[200px] py-1.5 rounded-xl",
          "border border-zinc-200/80 dark:border-zinc-700/80",
          "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl",
          "shadow-2xl shadow-black/20 dark:shadow-black/40",
          className
        )}
        style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
        data-testid="floating-menu"
      >
        {title && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 truncate uppercase tracking-wide">
              {title}
            </p>
            <button
              onClick={onClose}
              className="w-5 h-5 rounded flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all hover:scale-110"
              data-testid="floating-menu-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all hover:scale-110 z-10"
            data-testid="floating-menu-close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className={cn(!title && "pt-1")}>
          {children}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  color?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function MenuItem({
  icon: Icon,
  label,
  onClick,
  color = 'text-zinc-500',
  danger = false,
  disabled = false
}: MenuItemProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ x: 3, backgroundColor: danger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors",
        "hover:bg-zinc-100 dark:hover:bg-zinc-800",
        danger && "hover:bg-red-50 dark:hover:bg-red-900/20 cursor-delete",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && !danger && "cursor-pointer"
      )}
      data-testid={`menu-item-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className={cn("w-4 h-4 transition-transform", color, danger && "text-red-500")} />
      <span className={cn(
        "text-zinc-700 dark:text-zinc-300 font-medium",
        danger && "text-red-600 dark:text-red-400"
      )}>
        {label}
      </span>
    </motion.button>
  );
}

export function MenuDivider() {
  return <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />;
}

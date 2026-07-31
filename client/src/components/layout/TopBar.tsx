import { useState, useRef, useEffect } from 'react';
import { 
  Layout, 
  Settings, 
  Upload, 
  Menu, 
  Sun, 
  Moon,
  Play,
  Save,
  FolderOpen,
  HelpCircle,
  Download,
  FileSpreadsheet,
  Plus,
  Link2,
  Trash2,
  RefreshCw,
  Keyboard,
  Info,
  X,
  ChevronRight,
  Layers,
  GitBranch,
  FileText,
  Eye,
  Zap,
  Shield,
  GraduationCap,
  Database,
  Cloud,
  CloudOff,
  Loader2,
  Check
} from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AutoSaveStatus {
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  projectId: number | null;
}

interface TopBarProps {
    onSaveSession?: () => void;
    onLoadSession?: () => void;
    onRun?: () => void;
    onAddSource?: () => void;
    onClearCanvas?: () => void;
    onOpenViewBuilder?: () => void;
    onReplayTutorial?: () => void;
    autoSaveStatus?: AutoSaveStatus;
}

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  action?: () => void;
  submenu?: MenuItem[];
  danger?: boolean;
  divider?: boolean;
}

function HamburgerMenu({ 
  isOpen, 
  onClose,
  onSaveSession,
  onLoadSession,
  onAddSource,
  onClearCanvas,
  onRun,
  onOpenViewBuilder,
  onReplayTutorial,
  theme,
  setTheme,
  hamburgerButtonRef
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onSaveSession?: () => void;
  onLoadSession?: () => void;
  onAddSource?: () => void;
  onClearCanvas?: () => void;
  onRun?: () => void;
  onOpenViewBuilder?: () => void;
  onReplayTutorial?: () => void;
  theme: string;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  hamburgerButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideMenu = menuRef.current && menuRef.current.contains(target);
      const isHamburgerButton = hamburgerButtonRef?.current && hamburgerButtonRef.current.contains(target);
      
      if (!isInsideMenu && !isHamburgerButton) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      // Use capture phase to catch clicks before React Flow stops propagation
      document.addEventListener('mousedown', handleClickOutside, true);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, hamburgerButtonRef]);

  const menuSections = [
    {
      title: 'File',
      items: [
        { icon: Plus, label: 'Add Data Source', shortcut: 'Ctrl+O', action: () => { onAddSource?.(); onClose(); } },
        { icon: Save, label: 'Save Project', shortcut: 'Ctrl+S', action: () => { onSaveSession?.(); onClose(); } },
        { icon: FolderOpen, label: 'Open Project', shortcut: 'Ctrl+Shift+O', action: () => { onLoadSession?.(); onClose(); } },
        { divider: true },
        { icon: Download, label: 'Export Results', action: () => { toast({ title: "Export", description: "Run your query first, then export from View Builder." }); onClose(); } },
      ]
    },
    {
      title: 'Edit',
      items: [
        { icon: RefreshCw, label: 'Refresh All', action: () => { toast({ title: "Refreshed", description: "All data has been refreshed." }); onClose(); } },
        { icon: Trash2, label: 'Clear Canvas', action: () => { onClearCanvas?.(); onClose(); }, danger: true },
      ]
    },
    {
      title: 'View',
      items: [
        { icon: Layers, label: 'View Builder', action: () => { onOpenViewBuilder?.(); onClose(); } },
        { icon: Eye, label: 'Fit to Screen', shortcut: 'Ctrl+0', action: () => { toast({ title: "Fit to Screen", description: "Press Ctrl+0 on the canvas." }); onClose(); } },
        { divider: true },
        { icon: theme === 'dark' ? Sun : Moon, label: theme === 'dark' ? 'Light Mode' : 'Dark Mode', action: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); onClose(); } },
      ]
    },
    {
      title: 'Data',
      items: [
        { icon: Link2, label: 'Auto-Detect Links', action: () => { toast({ title: "Auto-Detect", description: "Right-click a table and select 'Smart Scan' to find matching fields." }); onClose(); } },
        { icon: GitBranch, label: 'Join Tables', action: () => { toast({ title: "Join Tables", description: "Click a table, then go to 'Prep Join' tab to combine tables." }); onClose(); } },
        { icon: Zap, label: 'Run Query', shortcut: 'Ctrl+Enter', action: () => { onRun?.(); onClose(); } },
      ]
    },
    {
      title: 'Help',
      items: [
        { icon: GraduationCap, label: 'Replay Tutorial', action: () => { 
          onReplayTutorial?.();
          onClose(); 
        }},
        { icon: Keyboard, label: 'Keyboard Shortcuts', action: () => { 
          toast({ 
            title: "Keyboard Shortcuts", 
            description: "Ctrl+S: Save | Ctrl+O: Open | Ctrl+Enter: Run | Delete: Remove selected"
          }); 
          onClose(); 
        }},
        { icon: HelpCircle, label: 'Getting Started', action: () => { 
          toast({ 
            title: "Getting Started",
            description: "1. Add data files 2. Connect matching fields 3. Run to see results 4. Export your data"
          }); 
          onClose(); 
        }},
        { icon: Info, label: 'About Elegant Joins', action: () => { 
          toast({ 
            title: "Elegant Joins v1.0",
            description: "A local-first data tool. Your data never leaves your computer."
          }); 
          onClose(); 
        }},
        { divider: true },
        { icon: Shield, label: 'Privacy Info', action: () => { 
          toast({ 
            title: "100% Local Processing",
            description: "All your data is processed on your computer. Nothing is sent to any server."
          }); 
          onClose(); 
        }},
      ]
    }
  ];

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="absolute top-12 sm:top-14 left-2 sm:left-4 z-50 w-[calc(100vw-16px)] sm:w-72 max-w-[280px] py-1.5 sm:py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl"
      data-testid="hamburger-menu"
    >
      <div className="px-3 sm:px-4 py-1.5 sm:py-2 border-b border-zinc-100 dark:border-zinc-800 mb-1.5 sm:mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Database className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">Elegant Joins</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            data-testid="close-hamburger-menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-100px)] sm:max-h-[calc(100vh-120px)] overflow-y-auto">
        {menuSections.map((section, sectionIndex) => (
          <div key={section.title} className={cn(sectionIndex > 0 && "mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-zinc-100 dark:border-zinc-800")}>
            <div className="px-3 sm:px-4 py-0.5 sm:py-1">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{section.title}</span>
            </div>
            {section.items.map((item, itemIndex) => {
              if ('divider' in item && item.divider) {
                return <div key={`${section.title}-div-${itemIndex}`} className="my-1 sm:my-1.5 mx-3 sm:mx-4 border-t border-zinc-100 dark:border-zinc-800" />;
              }
              if (!('icon' in item) || !item.icon || !('label' in item) || !item.label) return null;
              const Icon = item.icon;
              const label = item.label;
              const isDanger = 'danger' in item && item.danger;
              const shortcut = 'shortcut' in item ? item.shortcut : undefined;
              return (
                <button
                  key={`${section.title}-${itemIndex}`}
                  onClick={item.action}
                  className={cn(
                    "w-full flex items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-left transition-colors",
                    "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    isDanger && "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  )}
                  data-testid={`menu-${label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    <Icon className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", isDanger ? "text-red-500" : "text-zinc-500 dark:text-zinc-400")} />
                    <span className={cn("font-medium", !isDanger && "text-zinc-700 dark:text-zinc-300")}>
                      {label}
                    </span>
                  </div>
                  {shortcut && (
                    <span className="hidden sm:inline text-[10px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                      {shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-zinc-100 dark:border-zinc-800 px-3 sm:px-4 py-1.5 sm:py-2">
        <div className="flex items-center gap-2 text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>All data processed locally</span>
        </div>
      </div>
    </motion.div>
  );
}

export function TopBar({ onSaveSession, onLoadSession, onRun, onAddSource, onClearCanvas, onOpenViewBuilder, onReplayTutorial, autoSaveStatus }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hamburgerButtonRef = useRef<HTMLButtonElement>(null);

  const handleRun = () => {
    toast({
      title: "Processing Your Data",
      description: "Looking at your tables and connections...",
    });
    onRun?.();
  };
  
  const formatLastSaved = (date: Date | null) => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    
    if (diffSecs < 10) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="h-12 sm:h-14 md:h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl flex items-center justify-between px-2 sm:px-3 md:px-4 z-10 relative">
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              ref={hamburgerButtonRef}
              variant="ghost" 
              size="icon" 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={cn(
                "h-8 w-8 sm:h-9 sm:w-9 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-menu",
                isMenuOpen && "bg-zinc-100 dark:bg-zinc-800"
              )}
              data-testid="hamburger-button"
            >
              <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Open menu</p>
          </TooltipContent>
        </Tooltip>
        
        <AnimatePresence>
          {isMenuOpen && (
            <HamburgerMenu 
              isOpen={isMenuOpen} 
              onClose={() => setIsMenuOpen(false)}
              onSaveSession={onSaveSession}
              onLoadSession={onLoadSession}
              onAddSource={onAddSource}
              onClearCanvas={onClearCanvas}
              onRun={onRun}
              onOpenViewBuilder={onOpenViewBuilder}
              onReplayTutorial={onReplayTutorial}
              theme={theme}
              setTheme={setTheme}
              hamburgerButtonRef={hamburgerButtonRef}
            />
          )}
        </AnimatePresence>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 hover:scale-105 transition-transform cursor-help-custom">
              <div className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 border border-violet-500/30 flex items-center justify-center shadow-lg shadow-violet-500/10 overflow-hidden">
                <PixelArtIcon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
              </div>
              <div className="hidden min-[400px]:block">
                <h1 className="font-bold text-xs sm:text-sm tracking-tight text-zinc-900 dark:text-white">Elegant Joins</h1>
                <p className="text-[8px] sm:text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">LOCAL</p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[200px]">
            <p className="text-xs">Your data stays on your computer. Nothing is sent to the internet.</p>
          </TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-2 hidden md:block" />

        <nav className="hidden md:flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="text-zinc-600 dark:text-zinc-400 hover:text-primary hover:bg-primary/5 transition-all cursor-canvas">
                <Layout className="w-4 h-4 mr-2" />
                Canvas
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">This is where you work with your tables</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-zinc-600 dark:text-zinc-400 hover:text-primary hover:bg-primary/5 transition-all cursor-help-custom"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Help
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[250px]">
              <p className="text-xs font-medium mb-1">Quick Tips:</p>
              <ul className="text-xs space-y-1 text-zinc-400">
                <li>Click the + button to add data files</li>
                <li>Drag from one field to another to connect tables</li>
                <li>Click the key icon to mark important fields</li>
                <li>Right-click on tables for more options</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </nav>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={onSaveSession}
                className="hidden md:flex gap-2 hover:border-primary hover:text-primary transition-colors cursor-save"
            >
                <Save className="w-4 h-4" />
                Save
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Download your work as a file so you can continue later</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={onLoadSession}
                className="hidden md:flex gap-2 hover:border-primary hover:text-primary transition-colors cursor-folder"
            >
                <FolderOpen className="w-4 h-4" />
                Open
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Load a previously saved project file</p>
          </TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 sm:mx-1 hidden sm:block" />

        {/* Auto-save status indicator - shown when a project is open */}
        {autoSaveStatus?.projectId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div 
                layout
                className={cn(
                  "hidden sm:flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border mr-1 sm:mr-2 cursor-help-custom transition-colors duration-300",
                  autoSaveStatus.isSaving 
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" 
                    : autoSaveStatus.hasUnsavedChanges
                      ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
                      : "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800"
                )}
              >
                <AnimatePresence mode="wait">
                  {autoSaveStatus.isSaving ? (
                    <motion.div
                      key="saving"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center"
                    >
                      <Loader2 className="w-3 h-3 text-blue-500 animate-spin mr-1.5" />
                      <span className="text-[10px] sm:text-xs font-mono text-blue-600 dark:text-blue-400">Saving...</span>
                    </motion.div>
                  ) : autoSaveStatus.hasUnsavedChanges ? (
                    <motion.div
                      key="unsaved"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center"
                    >
                      <motion.div 
                        className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-amber-500 mr-1.5 sm:mr-2"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                      <span className="text-[10px] sm:text-xs font-mono text-amber-600 dark:text-amber-400">Unsaved</span>
                    </motion.div>
                  ) : autoSaveStatus.lastSaved ? (
                    <motion.div
                      key="saved"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center"
                    >
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                      >
                        <Check className="w-3 h-3 text-emerald-500 mr-1.5" />
                      </motion.div>
                      <span className="text-[10px] sm:text-xs font-mono text-emerald-600 dark:text-emerald-400">
                        Saved {formatLastSaved(autoSaveStatus.lastSaved)}
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="auto-save"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center"
                    >
                      <Cloud className="w-3 h-3 text-zinc-400 mr-1.5" />
                      <span className="text-[10px] sm:text-xs font-mono text-zinc-500 dark:text-zinc-400">Auto-save on</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {autoSaveStatus.isSaving 
                  ? "Saving your changes..." 
                  : autoSaveStatus.hasUnsavedChanges 
                    ? "You have unsaved changes that will be saved automatically"
                    : autoSaveStatus.lastSaved
                      ? `Last saved ${formatLastSaved(autoSaveStatus.lastSaved)}`
                      : "Your project will be saved automatically as you work"}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Ready status - shown when no project is open */}
        {!autoSaveStatus?.projectId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="hidden sm:flex items-center px-2 sm:px-3 py-1 sm:py-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full border border-zinc-200 dark:border-zinc-800 mr-1 sm:mr-2 cursor-help-custom">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5 sm:mr-2" />
                  <span className="text-[10px] sm:text-xs font-mono text-zinc-500 dark:text-zinc-400">Ready</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Everything is working! Your data is being processed locally.</p>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onAddSource?.() || document.getElementById('file-upload-global')?.click()}
                className="hidden md:flex gap-2 border-dashed hover:border-primary hover:text-primary transition-colors cursor-upload"
            >
                <Upload className="w-4 h-4" />
                Add Data
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Upload a CSV or Excel file to add a new table</p>
          </TooltipContent>
        </Tooltip>
        <input id="file-upload-global" type="file" className="hidden" accept=".csv,.xlsx,.xls" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
                variant="default" 
                size="sm" 
                onClick={handleRun}
                className="h-8 sm:h-9 px-2 sm:px-3 gap-1 sm:gap-2 text-xs sm:text-sm bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-none shadow-md shadow-blue-500/20 hover:shadow-blue-500/40 transition-all hover:scale-105 active:scale-95 cursor-run"
            >
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                Run
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Process your data and see the results</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")} 
              className={cn(
                "h-8 w-8 sm:h-9 sm:w-9 ml-0.5 sm:ml-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
                theme === "dark" ? "cursor-theme-light" : "cursor-theme-dark"
              )}
            >
                {theme === "dark" ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

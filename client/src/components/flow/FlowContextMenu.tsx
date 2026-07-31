import { useEffect, useRef } from 'react';
import { Trash2, Edit, Copy, Plus, RefreshCcw, X, Link } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MenuType = 'node' | 'edge' | 'pane';

interface FlowContextMenuProps {
  type: MenuType;
  position: { x: number; y: number };
  onClose: () => void;
  onAction: (action: string) => void;
}

export function FlowContextMenu({ type, position, onClose, onAction }: FlowContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Use pointerdown to catch both mouse and touch events
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // If the click is inside the menu, do nothing
      if (ref.current && ref.current.contains(event.target as Node)) {
        return;
      }
      
      // Otherwise, close the menu
      // We use a small timeout to allow the click event to propagate first
      // This prevents race conditions where a click that opens a new menu
      // is immediately closed by this handler
      onClose();
    };

    // Use capture phase to ensure we catch it before other handlers if needed,
    // but standard bubbling is usually safer for "outside" checks.
    document.addEventListener('pointerdown', handleClickOutside);
    
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [onClose]);

  const menuItems = {
    node: [
      { id: 'edit', label: 'Edit Table', icon: Edit, color: 'text-zinc-700 dark:text-zinc-200' },
      { id: 'duplicate', label: 'Duplicate', icon: Copy, color: 'text-zinc-700 dark:text-zinc-200' },
      { id: 'separator' },
      { id: 'delete', label: 'Delete', icon: Trash2, color: 'text-red-600 dark:text-red-400' },
    ],
    edge: [
      { id: 'edit_join', label: 'Edit Join Type', icon: Link, color: 'text-zinc-700 dark:text-zinc-200' },
      { id: 'separator' },
      { id: 'delete_edge', label: 'Remove Link', icon: Trash2, color: 'text-red-600 dark:text-red-400' },
    ],
    pane: [
      { id: 'add_source', label: 'Add Data Source', icon: Plus, color: 'text-primary' },
      { id: 'reset_view', label: 'Reset View', icon: RefreshCcw, color: 'text-zinc-700 dark:text-zinc-200' },
    ]
  };

  const items = menuItems[type];

  return (
    <div 
      ref={ref}
      className="fixed z-50 min-w-[180px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
      onContextMenu={(e) => e.preventDefault()} // Prevent native context menu on the custom menu
    >
      <div className="p-1 flex flex-col gap-0.5">
        {items.map((item, index) => {
          if (item.id === 'separator') {
            return <div key={index} className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />;
          }
          
          const Icon = item.icon as any;
          return (
            <button
              key={item.id}
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering outside click logic
                onAction(item.id);
                onClose();
              }}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors w-full text-left",
                "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                item.color
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface EditableLabelProps {
  value: string;
  displayValue?: string;
  originalValue: string;
  onSave: (newDisplayValue: string) => void;
  className?: string;
  iconSize?: 'sm' | 'md';
  showOriginalOnHover?: boolean;
  externalEditTrigger?: boolean;
  onEditEnd?: () => void;
  clickToEdit?: boolean;
}

export function EditableLabel({ 
  value, 
  displayValue, 
  originalValue,
  onSave, 
  className,
  iconSize = 'sm',
  showOriginalOnHover = true,
  externalEditTrigger = false,
  onEditEnd,
  clickToEdit = true
}: EditableLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayValue || value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (externalEditTrigger && !isEditing) {
      setEditValue(displayValue || value);
      setIsEditing(true);
    }
  }, [externalEditTrigger, displayValue, value, isEditing]);

  const hasOverride = displayValue && displayValue !== originalValue;
  const displayText = displayValue || value;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue) {
      onSave(trimmedValue);
    }
    setIsEditing(false);
    onEditEnd?.();
  };

  const handleCancel = () => {
    setEditValue(displayValue || value);
    setIsEditing(false);
    onEditEnd?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditValue(displayValue || value);
    setIsEditing(true);
  };

  const iconSizeClass = iconSize === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className={cn(
            "bg-white dark:bg-zinc-800 border border-primary/50 rounded px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-primary/30",
            "w-full min-w-0 flex-1",
            className
          )}
          style={{ maxWidth: 'calc(100% - 40px)' }}
          data-testid="input-rename"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          className="shrink-0 p-0.5 text-emerald-500 hover:text-emerald-600 transition-colors"
          data-testid="button-save-rename"
        >
          <Check className={iconSizeClass} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleCancel(); }}
          className="shrink-0 p-0.5 text-zinc-400 hover:text-zinc-600 transition-colors"
          data-testid="button-cancel-rename"
        >
          <X className={iconSizeClass} />
        </button>
      </div>
    );
  }

  const labelContent = (
    <span 
      className={cn(
        "truncate", 
        className,
        clickToEdit && "cursor-text hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 rounded px-0.5 -mx-0.5 transition-colors"
      )}
      onClick={clickToEdit ? handleStartEdit : undefined}
      data-testid="text-editable-label"
    >
      {displayText}
    </span>
  );

  return (
    <div className="group/edit flex items-center gap-1 min-w-0">
      {showOriginalOnHover && hasOverride ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {labelContent}
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <span className="text-zinc-400">Original: </span>
            <span className="font-medium">{originalValue}</span>
          </TooltipContent>
        </Tooltip>
      ) : (
        labelContent
      )}
      
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleStartEdit}
            className={cn(
              "shrink-0 p-0.5 rounded transition-all",
              "opacity-0 group-hover/edit:opacity-30 hover:!opacity-100",
              "text-zinc-400 hover:text-primary",
              hasOverride && "!opacity-40 !text-primary/60 hover:!text-primary"
            )}
            data-testid="button-edit-name"
          >
            <Pencil className={iconSizeClass} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {hasOverride ? 'Edit display name' : 'Rename'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

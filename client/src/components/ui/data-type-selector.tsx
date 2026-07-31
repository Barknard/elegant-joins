import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Type, Hash, Calendar, ToggleLeft, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DataType = 'text' | 'number' | 'date' | 'boolean';

interface DataTypeSelectorProps {
  value: DataType;
  onChange: (value: DataType) => void;
  className?: string;
  triggerClassName?: string;
  showLabel?: boolean;
}

const types: { value: DataType; label: string; icon: any; color: string }[] = [
  { value: 'text', label: 'Text', icon: Type, color: 'text-blue-500' },
  { value: 'number', label: 'Number', icon: Hash, color: 'text-emerald-500' },
  { value: 'date', label: 'Date', icon: Calendar, color: 'text-amber-500' },
  { value: 'boolean', label: 'Boolean', icon: ToggleLeft, color: 'text-purple-500' },
];

export function DataTypeSelector({ value, onChange, className, triggerClassName, showLabel = false }: DataTypeSelectorProps) {
  const currentType = types.find(t => t.value === value) || types[0];
  const Icon = currentType.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "h-6 px-1.5 gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
            triggerClassName
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", currentType.color)} />
          {showLabel && <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{currentType.label}</span>}
          {showLabel && <ChevronDown className="w-3 h-3 text-zinc-400 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[140px] z-[9999]">
        {types.map((t) => (
          <DropdownMenuItem 
            key={t.value} 
            onClick={() => onChange(t.value)}
            className="gap-2 text-xs"
          >
            <t.icon className={cn("w-3.5 h-3.5", t.color)} />
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

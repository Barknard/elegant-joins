import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { TableNodeType, Column } from '@/components/flow/TableNode';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  GitMerge, 
  Database, 
  Check,
  AlertCircle,
  Loader2,
  Key,
  HelpCircle,
  Link2,
  Plus,
  Trash2,
  ArrowRight,
  Layers,
  Shuffle,
  Sparkles,
  Eye,
  Table2,
  Pencil,
  Copy,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  KeyRound,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { DataTypeSelector, DataType } from '@/components/ui/data-type-selector';
import { FloatingMenu, MenuItem, MenuDivider } from '@/components/ui/floating-menu';

interface FieldMapping {
  id: string;
  sourceField: string;
  targetField: string;
}

interface TableEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: TableNodeType | null;
  allNodes: TableNodeType[];
  onJoin: (sourceNode: TableNodeType, targetNodeId: string, type: string) => void;
  onUpdateColumnType?: (tableId: string, columnId: string, newType: DataType) => void;
  onToggleKey?: (tableId: string, columnId: string) => void;
  onRenameColumn?: (tableId: string, columnId: string, newName: string) => void;
  onDuplicateColumn?: (tableId: string, columnId: string) => void;
  onMoveColumn?: (tableId: string, columnId: string, direction: 'up' | 'down') => void;
  onDeleteColumn?: (tableId: string, columnId: string) => void;
  onChangeIconColor?: (tableId: string, color: string) => void;
}

const TABLE_COLORS = [
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Slate', value: '#64748b' },
  { name: 'Zinc', value: '#71717a' },
  { name: 'Stone', value: '#78716c' },
];

type JoinMode = 'join' | 'append' | 'auto-align';

interface SchemaContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  column: Column | null;
  columnIndex: number;
}

interface SchemaContextMenuProps {
  position: { x: number; y: number };
  column: Column;
  columnIndex: number;
  totalColumns: number;
  onClose: () => void;
  onRename: () => void;
  onToggleKey: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function SchemaContextMenu({
  position,
  column,
  columnIndex,
  totalColumns,
  onClose,
  onRename,
  onToggleKey,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete
}: SchemaContextMenuProps) {
  return (
    <FloatingMenu
      isOpen={true}
      position={position}
      onClose={onClose}
      title={column.displayName || column.name}
    >
      <MenuItem icon={Pencil} label="Rename" onClick={() => { onRename(); onClose(); }} color="text-blue-500" />
      <MenuItem icon={KeyRound} label={column.isKey ? 'Remove Key' : 'Make Key'} onClick={() => { onToggleKey(); onClose(); }} color="text-amber-500" />
      <MenuItem icon={Copy} label="Duplicate" onClick={() => { onDuplicate(); onClose(); }} color="text-green-500" />
      {columnIndex > 0 && (
        <MenuItem icon={ArrowUp} label="Move Up" onClick={() => { onMoveUp(); onClose(); }} color="text-zinc-500" />
      )}
      {columnIndex < totalColumns - 1 && (
        <MenuItem icon={ArrowDown} label="Move Down" onClick={() => { onMoveDown(); onClose(); }} color="text-zinc-500" />
      )}
      <MenuDivider />
      <MenuItem icon={Trash2} label="Delete" onClick={() => { onDelete(); onClose(); }} danger />
    </FloatingMenu>
  );
}

export function TableEditModal({ 
  open, 
  onOpenChange, 
  node, 
  allNodes, 
  onJoin, 
  onUpdateColumnType, 
  onToggleKey,
  onRenameColumn,
  onDuplicateColumn,
  onMoveColumn,
  onDeleteColumn,
  onChangeIconColor
}: TableEditModalProps) {
  const [joinMode, setJoinMode] = useState<JoinMode>('join');
  const [joinType, setJoinType] = useState<'inner' | 'left' | 'right' | 'full'>('left');
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [isJoining, setIsJoining] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [contextMenu, setContextMenu] = useState<SchemaContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    column: null,
    columnIndex: -1
  });
  const [renameState, setRenameState] = useState<{ columnId: string; value: string } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const { toast } = useToast();

  // Reset state when modal closes to prevent stale state issues
  useEffect(() => {
    if (!open) {
      setSelectedTableId("");
      setFieldMappings([]);
      setJoinMode('join');
      setJoinType('left');
      setIsJoining(false);
      setShowColorPicker(false);
    }
  }, [open]);

  // Compute derived values (must be before any early returns for hooks consistency)
  const otherTables = useMemo(() => node ? allNodes.filter(n => n.id !== node.id) : [], [node, allNodes]);
  const selectedTable = useMemo(() => otherTables.find(t => t.id === selectedTableId), [otherTables, selectedTableId]);

  // Generate preview data based on current mode and settings
  const previewData = useMemo(() => {
    if (!node || !selectedTable) return null;

    const sourceColumns = node.data.columns;
    const targetColumns = selectedTable.data.columns;
    
    // Get resolved field mappings for display
    const resolvedMappings = fieldMappings
      .filter(m => m.sourceField && m.targetField)
      .map(m => ({
        sourceCol: sourceColumns.find(c => c.id === m.sourceField),
        targetCol: targetColumns.find(c => c.id === m.targetField)
      }))
      .filter(m => m.sourceCol && m.targetCol);

    // Calculate output columns based on mode
    let outputColumns: { name: string; source: 'left' | 'right' | 'both'; isKey?: boolean }[] = [];
    let explanation = '';
    let sampleRows: Record<string, string>[] = [];

    if (joinMode === 'append') {
      // Stack Rows: all unique columns from both tables
      const allColumnNames = new Set<string>();
      sourceColumns.forEach(c => allColumnNames.add(c.name));
      targetColumns.forEach(c => allColumnNames.add(c.name));
      
      outputColumns = Array.from(allColumnNames).map(name => {
        const inSource = sourceColumns.some(c => c.name === name);
        const inTarget = targetColumns.some(c => c.name === name);
        return {
          name,
          source: (inSource && inTarget) ? 'both' : (inSource ? 'left' : 'right')
        };
      });
      
      explanation = `All rows from both tables will be stacked together. Columns with the same name will be merged.`;
      
      // Sample rows showing structure
      sampleRows = [
        { _source: node.data.label, ...Object.fromEntries(outputColumns.map(c => [c.name, c.source === 'right' ? '—' : 'value'])) },
        { _source: node.data.label, ...Object.fromEntries(outputColumns.map(c => [c.name, c.source === 'right' ? '—' : 'value'])) },
        { _source: selectedTable.data.label, ...Object.fromEntries(outputColumns.map(c => [c.name, c.source === 'left' ? '—' : 'value'])) },
      ];
    } else if (joinMode === 'auto-align') {
      // Auto-Align: find matching column names
      const matchedColumns: string[] = [];
      sourceColumns.forEach(sc => {
        const match = targetColumns.find(tc => tc.name.toLowerCase() === sc.name.toLowerCase());
        if (match) matchedColumns.push(sc.name);
      });

      // Output: all source columns + non-matching target columns
      outputColumns = [
        ...sourceColumns.map(c => ({ 
          name: c.name, 
          source: matchedColumns.includes(c.name) ? 'both' as const : 'left' as const,
          isKey: c.isKey
        })),
        ...targetColumns
          .filter(c => !matchedColumns.some(m => m.toLowerCase() === c.name.toLowerCase()))
          .map(c => ({ name: c.name, source: 'right' as const, isKey: c.isKey }))
      ];
      
      explanation = matchedColumns.length > 0 
        ? `Found ${matchedColumns.length} matching column(s): ${matchedColumns.join(', ')}. These will be used to align data automatically.`
        : `No matching column names found. Rows will be combined side-by-side.`;

      sampleRows = [
        { _match: '✓', ...Object.fromEntries(outputColumns.map(c => [c.name, 'matched'])) },
        { _match: '✓', ...Object.fromEntries(outputColumns.map(c => [c.name, 'matched'])) },
        { _match: '—', ...Object.fromEntries(outputColumns.slice(0, sourceColumns.length).map(c => [c.name, 'left only'])) },
      ];
    } else if (joinMode === 'join' && resolvedMappings.length > 0) {
      // Link Fields: explicit field mappings
      const linkedTargetCols = resolvedMappings.map(m => m.targetCol?.id);
      
      outputColumns = [
        ...sourceColumns.map(c => ({ 
          name: c.name, 
          source: 'left' as const,
          isKey: c.isKey || resolvedMappings.some(m => m.sourceCol?.id === c.id)
        })),
        ...targetColumns
          .filter(c => !linkedTargetCols.includes(c.id))
          .map(c => ({ name: c.name, source: 'right' as const, isKey: c.isKey }))
      ];

      const joinTypeLabels: Record<string, string> = {
        'left': `All rows from ${node.data.label} will be kept, matched with ${selectedTable.data.label} where possible.`,
        'inner': `Only rows with matches in both tables will be kept.`,
        'right': `All rows from ${selectedTable.data.label} will be kept, matched with ${node.data.label} where possible.`,
        'full': `All rows from both tables will be kept, matched where possible.`
      };
      
      explanation = `Linking on: ${resolvedMappings.map(m => `${m.sourceCol?.name} ↔ ${m.targetCol?.name}`).join(', ')}. ${joinTypeLabels[joinType]}`;

      sampleRows = [
        { _match: '✓ Match', ...Object.fromEntries(outputColumns.map(c => [c.name, 'data'])) },
        { _match: joinType === 'inner' ? '✗ Excluded' : '— No match', ...Object.fromEntries(outputColumns.map((c, i) => [c.name, i < sourceColumns.length ? 'data' : '—'])) },
      ];
    }

    return {
      outputColumns,
      explanation,
      sampleRows,
      totalColumns: outputColumns.length
    };
  }, [node, selectedTable, joinMode, joinType, fieldMappings]);

  // Early return AFTER all hooks
  if (!node) return null;

  // Get key fields from both tables for quick suggestions
  const sourceKeyFields = node.data.columns.filter(c => c.isKey);
  const targetKeyFields = selectedTable?.data.columns.filter(c => c.isKey) || [];

  // Add a new field mapping
  const addFieldMapping = () => {
    const newId = `mapping-${Date.now()}`;
    setFieldMappings(prev => [...prev, { id: newId, sourceField: '', targetField: '' }]);
  };

  // Remove a field mapping
  const removeFieldMapping = (id: string) => {
    setFieldMappings(prev => prev.filter(m => m.id !== id));
  };

  // Update a field mapping
  const updateFieldMapping = (id: string, field: 'sourceField' | 'targetField', value: string) => {
    setFieldMappings(prev => prev.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  // Auto-detect matching field names
  const autoDetectMappings = () => {
    if (!selectedTable) return;
    
    const autoMappings: FieldMapping[] = [];
    
    // First try to match key fields
    sourceKeyFields.forEach(sourceCol => {
      const match = selectedTable.data.columns.find(targetCol => 
        targetCol.name.toLowerCase() === sourceCol.name.toLowerCase() ||
        (targetCol.isKey && sourceCol.name.toLowerCase().includes(targetCol.name.toLowerCase().replace('_id', '').replace('id', '')))
      );
      if (match) {
        autoMappings.push({
          id: `auto-${Date.now()}-${sourceCol.id}`,
          sourceField: sourceCol.id,
          targetField: match.id
        });
      }
    });

    // If no key matches, try exact name matches
    if (autoMappings.length === 0) {
      node.data.columns.forEach(sourceCol => {
        const match = selectedTable.data.columns.find(targetCol => 
          targetCol.name.toLowerCase() === sourceCol.name.toLowerCase()
        );
        if (match) {
          autoMappings.push({
            id: `auto-${Date.now()}-${sourceCol.id}`,
            sourceField: sourceCol.id,
            targetField: match.id
          });
        }
      });
    }

    if (autoMappings.length > 0) {
      setFieldMappings(autoMappings);
      toast({
        title: "Fields Matched!",
        description: `Found ${autoMappings.length} matching field(s) between the tables.`,
      });
    } else {
      toast({
        title: "No Matches Found",
        description: "No matching field names found. Please link fields manually.",
        variant: "destructive"
      });
    }
  };

  // Handle table selection change
  const handleTableSelect = (tableId: string) => {
    setSelectedTableId(tableId);
    setFieldMappings([]); // Reset mappings when table changes
  };

  const handleJoin = () => {
    setIsJoining(true);
    setTimeout(() => {
        // Build join configuration
        const joinConfig = {
          mode: joinMode,
          joinType: joinType,
          fieldMappings: fieldMappings.map(m => ({
            sourceField: node.data.columns.find(c => c.id === m.sourceField)?.name || m.sourceField,
            targetField: selectedTable?.data.columns.find(c => c.id === m.targetField)?.name || m.targetField
          }))
        };
        
        // Pass the join type with mode prefix for downstream handling
        const joinTypeWithMode = joinMode === 'append' ? 'append' : 
                                  joinMode === 'auto-align' ? 'auto' : 
                                  joinType;
        
        onJoin(node, selectedTableId, joinTypeWithMode);
        setIsJoining(false);
        onOpenChange(false);
        
        const modeLabels = {
          'join': `Joined using ${fieldMappings.length} field link(s)`,
          'append': 'All rows stacked together',
          'auto-align': 'Fields automatically matched'
        };
        
        toast({
            title: "Tables Combined!",
            description: modeLabels[joinMode],
            variant: "default",
            className: "bg-emerald-600 text-white border-none"
        });
    }, 1500);
  };

  const isReadyToJoin = selectedTableId && (
    joinMode === 'append' || 
    joinMode === 'auto-align' || 
    (joinMode === 'join' && fieldMappings.length > 0 && fieldMappings.every(m => m.sourceField && m.targetField))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col gap-0 p-0 glass-card border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="p-1.5 rounded-md transition-colors flex items-center gap-0.5 group"
                style={{ 
                  backgroundColor: node.data.iconColor ? `${node.data.iconColor}20` : 'rgb(var(--primary) / 0.1)',
                  color: node.data.iconColor || 'rgb(var(--primary))'
                }}
                data-testid="icon-color-picker-trigger"
              >
                <Database className="w-5 h-5" />
                <ChevronDown className="w-3 h-3 opacity-40 group-hover:opacity-80 transition-opacity" />
              </button>
              
              {showColorPicker && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowColorPicker(false)} 
                  />
                  <div className="absolute top-full left-0 mt-2 p-2 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 z-50 w-48">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2 px-1">Icon Color</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {TABLE_COLORS.map((color) => (
                        <Tooltip key={color.value}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                onChangeIconColor?.(node.id, color.value);
                                setShowColorPicker(false);
                              }}
                              className={cn(
                                "w-8 h-8 rounded-md transition-all hover:scale-110 flex items-center justify-center relative",
                                node.data.iconColor === color.value && "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900"
                              )}
                              style={{ 
                                backgroundColor: `${color.value}20`,
                                color: color.value,
                                '--tw-ring-color': color.value
                              } as React.CSSProperties}
                              data-testid={`color-option-${color.name.toLowerCase()}`}
                            >
                              <Database className="w-4 h-4" />
                              {node.data.iconColor === color.value && (
                                <Check className="w-3 h-3 absolute top-0.5 right-0.5" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p className="text-xs">{color.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {node.data.displayLabel || node.data.label}
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400 ml-2 border px-2 py-0.5 rounded-full">
                {node.data.columns.length} columns
            </span>
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            View and edit your table's columns, data types, and key fields.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="schema" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 bg-white/30 dark:bg-zinc-900/30">
            <TabsList className="grid w-full grid-cols-2 max-w-[300px]">
              <TabsTrigger value="schema">Schema</TabsTrigger>
              <TabsTrigger value="prep-join">Prep Join</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/50 p-6 overflow-hidden flex flex-col">
             
             {/* SCHEMA TAB */}
             <TabsContent value="schema" className="flex-1 mt-0 h-full overflow-hidden flex flex-col">
               <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                 <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
                 <p className="text-xs text-blue-700 dark:text-blue-300">
                   <strong>Tip:</strong> Right-click any field for quick actions like rename, duplicate, or delete. 
                   Click the key icon to mark important fields. Change data types by clicking the type badge.
                 </p>
               </div>
               
               <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex-1 shadow-sm">
                 <ScrollArea className="h-full">
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {node.data.columns.map((col, colIndex) => (
                            <div 
                              key={col.id} 
                              className="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group cursor-context-menu"
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({
                                  isOpen: true,
                                  position: { x: e.clientX, y: e.clientY },
                                  column: col,
                                  columnIndex: colIndex
                                });
                              }}
                            >
                                <div className="flex items-center gap-3">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => onToggleKey?.(node.id, col.id)}
                                          className={cn(
                                            "w-8 h-8 rounded flex items-center justify-center transition-all hover:scale-110",
                                            col.isKey 
                                              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" 
                                              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-900/20"
                                          )}
                                          data-testid={`schema-toggle-key-${col.id}`}
                                        >
                                          <Key className="w-4 h-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">
                                          {col.isKey 
                                            ? "This is a key field. Click to remove key status." 
                                            : "Click to make this a key field for linking tables."}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <div className="flex-1">
                                        {renameState?.columnId === col.id ? (
                                          <div className="flex items-center gap-2">
                                            <Input
                                              autoFocus
                                              value={renameState.value}
                                              onChange={(e) => setRenameState({ ...renameState, value: e.target.value })}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' && renameState.value.trim()) {
                                                  onRenameColumn?.(node.id, col.id, renameState.value.trim());
                                                  setRenameState(null);
                                                } else if (e.key === 'Escape') {
                                                  setRenameState(null);
                                                }
                                              }}
                                              onBlur={() => {
                                                if (renameState.value.trim() && renameState.value !== (col.displayName || col.name)) {
                                                  onRenameColumn?.(node.id, col.id, renameState.value.trim());
                                                }
                                                setRenameState(null);
                                              }}
                                              className="h-7 text-sm w-48"
                                              data-testid={`schema-rename-input-${col.id}`}
                                            />
                                          </div>
                                        ) : (
                                          <>
                                            <p 
                                              className="text-sm font-medium text-zinc-900 dark:text-zinc-100 cursor-text hover:bg-zinc-100/50 dark:hover:bg-zinc-700/50 rounded px-1 -mx-1 transition-colors inline-block"
                                              onClick={() => setRenameState({ columnId: col.id, value: col.displayName || col.name })}
                                              data-testid={`schema-column-name-${col.id}`}
                                            >
                                              {col.displayName || col.name}
                                            </p>
                                            <p className="text-xs text-zinc-400 mt-0.5">
                                              {col.isKey ? "Key field - used for connections" : "Regular field"}
                                              {col.displayName && col.displayName !== col.name && (
                                                <span className="ml-2 text-zinc-300 dark:text-zinc-600">
                                                  (original: {col.name})
                                                </span>
                                              )}
                                            </p>
                                          </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div>
                                          <DataTypeSelector 
                                              value={col.type} 
                                              onChange={(newType) => onUpdateColumnType?.(node.id, col.id, newType)}
                                              showLabel
                                              triggerClassName="h-7 px-3 border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-800 hover:border-primary"
                                          />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Change the data type for this column</p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setContextMenu({
                                              isOpen: true,
                                              position: { x: rect.right, y: rect.top },
                                              column: col,
                                              columnIndex: colIndex
                                            });
                                          }}
                                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                          data-testid={`schema-more-options-${col.id}`}
                                        >
                                          <MoreVertical className="w-4 h-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">More options</p>
                                      </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        ))}
                    </div>
                 </ScrollArea>
               </div>

               {/* Schema Context Menu */}
               {contextMenu.isOpen && contextMenu.column && (
                 <SchemaContextMenu
                   position={contextMenu.position}
                   column={contextMenu.column}
                   columnIndex={contextMenu.columnIndex}
                   totalColumns={node.data.columns.length}
                   onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, column: null, columnIndex: -1 })}
                   onRename={() => {
                     setRenameState({
                       columnId: contextMenu.column!.id,
                       value: contextMenu.column!.displayName || contextMenu.column!.name
                     });
                   }}
                   onToggleKey={() => onToggleKey?.(node.id, contextMenu.column!.id)}
                   onDuplicate={() => onDuplicateColumn?.(node.id, contextMenu.column!.id)}
                   onMoveUp={() => onMoveColumn?.(node.id, contextMenu.column!.id, 'up')}
                   onMoveDown={() => onMoveColumn?.(node.id, contextMenu.column!.id, 'down')}
                   onDelete={() => onDeleteColumn?.(node.id, contextMenu.column!.id)}
                 />
               )}
             </TabsContent>

             {/* PREP JOIN TAB */}
             <TabsContent value="prep-join" className="flex-1 mt-0 h-full overflow-auto">
               <ScrollArea className="h-full">
               <div className="max-w-3xl mx-auto space-y-6">
                  
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>Combine your data:</strong> Choose how you want to merge tables together - 
                      join them on matching fields, append rows, or let us find the best match automatically.
                    </p>
                  </div>

                  {/* Step 1: Select Table */}
                  <div className="space-y-3">
                      <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</span>
                        Pick a table to combine with
                      </label>
                      <Select value={selectedTableId} onValueChange={handleTableSelect}>
                        <SelectTrigger className="w-full h-12 bg-white dark:bg-zinc-900 hover:border-primary transition-colors" data-testid="select-join-table">
                            <SelectValue placeholder="Choose a table..." />
                        </SelectTrigger>
                        <SelectContent>
                            {otherTables.length === 0 ? (
                              <div className="p-3 text-sm text-zinc-500 text-center">
                                No other tables available. Add more data first!
                              </div>
                            ) : (
                              otherTables.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  <div className="flex items-center gap-2">
                                    <Database className="w-4 h-4 text-zinc-400" />
                                    {t.data.displayLabel || t.data.label}
                                    <span className="text-xs text-zinc-400">({t.data.columns.length} cols)</span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                        </SelectContent>
                      </Select>
                  </div>

                  {selectedTableId && (
                    <>
                      {/* Step 2: Choose Mode */}
                      <div className="space-y-3">
                          <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</span>
                            How do you want to combine?
                          </label>
                          <div className="grid grid-cols-3 gap-3">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div 
                                    onClick={() => setJoinMode('join')}
                                    className={cn(
                                        "p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                                        joinMode === 'join' 
                                            ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
                                            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-primary/30"
                                    )}
                                    data-testid="mode-join"
                                  >
                                      <div className="flex items-center gap-2 mb-2">
                                        <Link2 className="w-5 h-5 text-blue-500" />
                                        <span className="font-medium text-sm">Link Fields</span>
                                        {joinMode === 'join' && <Check className="w-4 h-4 text-primary ml-auto" />}
                                      </div>
                                      <p className="text-xs text-zinc-500">Match rows using specific fields you choose</p>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[200px]">
                                  <p className="text-xs">Link tables by matching values in specific columns you select</p>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div 
                                    onClick={() => setJoinMode('append')}
                                    className={cn(
                                        "p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                                        joinMode === 'append' 
                                            ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
                                            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-primary/30"
                                    )}
                                    data-testid="mode-append"
                                  >
                                      <div className="flex items-center gap-2 mb-2">
                                        <Layers className="w-5 h-5 text-emerald-500" />
                                        <span className="font-medium text-sm">Stack Rows</span>
                                        {joinMode === 'append' && <Check className="w-4 h-4 text-primary ml-auto" />}
                                      </div>
                                      <p className="text-xs text-zinc-500">Add all rows from both tables together</p>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[200px]">
                                  <p className="text-xs">Stack all rows from both tables on top of each other (append)</p>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div 
                                    onClick={() => setJoinMode('auto-align')}
                                    className={cn(
                                        "p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                                        joinMode === 'auto-align' 
                                            ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
                                            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-primary/30"
                                    )}
                                    data-testid="mode-auto-align"
                                  >
                                      <div className="flex items-center gap-2 mb-2">
                                        <Sparkles className="w-5 h-5 text-purple-500" />
                                        <span className="font-medium text-sm">Auto-Align</span>
                                        {joinMode === 'auto-align' && <Check className="w-4 h-4 text-primary ml-auto" />}
                                      </div>
                                      <p className="text-xs text-zinc-500">Let us find the best match automatically</p>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[200px]">
                                  <p className="text-xs">Automatically detect matching columns and align data</p>
                                </TooltipContent>
                              </Tooltip>
                          </div>
                      </div>

                      {/* Step 3: Field Mapping (only for 'join' mode) */}
                      {joinMode === 'join' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</span>
                                Link matching fields
                              </label>
                              <div className="flex items-center gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={autoDetectMappings}
                                  className="text-xs h-8"
                                  data-testid="button-auto-detect"
                                >
                                  <Shuffle className="w-3 h-3 mr-1" />
                                  Auto-Detect
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={addFieldMapping}
                                  className="text-xs h-8"
                                  data-testid="button-add-mapping"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Add Link
                                </Button>
                              </div>
                            </div>

                            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                              {fieldMappings.length === 0 ? (
                                <div className="text-center py-8">
                                  <Link2 className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                                  <p className="text-sm text-zinc-500 mb-2">No field links yet</p>
                                  <p className="text-xs text-zinc-400 mb-4">Click "Auto-Detect" to find matches or "Add Link" to connect fields manually</p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {/* Header */}
                                  <div className="grid grid-cols-[1fr,auto,1fr,auto] gap-3 items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{node.data.displayLabel || node.data.label}</div>
                                    <div></div>
                                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{selectedTable?.data.displayLabel || selectedTable?.data.label}</div>
                                    <div></div>
                                  </div>
                                  
                                  {/* Mappings */}
                                  {fieldMappings.map((mapping, index) => (
                                    <div key={mapping.id} className="grid grid-cols-[1fr,auto,1fr,auto] gap-3 items-center">
                                      <Select 
                                        value={mapping.sourceField} 
                                        onValueChange={(val) => updateFieldMapping(mapping.id, 'sourceField', val)}
                                      >
                                        <SelectTrigger className="h-10 bg-zinc-50 dark:bg-zinc-800">
                                          <SelectValue placeholder="Select field..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {node.data.columns.map(col => (
                                            <SelectItem key={col.id} value={col.id}>
                                              <div className="flex items-center gap-2">
                                                {col.isKey && <Key className="w-3 h-3 text-amber-500" />}
                                                {col.displayName || col.name}
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      
                                      <ArrowRight className="w-4 h-4 text-zinc-400" />
                                      
                                      <Select 
                                        value={mapping.targetField} 
                                        onValueChange={(val) => updateFieldMapping(mapping.id, 'targetField', val)}
                                      >
                                        <SelectTrigger className="h-10 bg-zinc-50 dark:bg-zinc-800">
                                          <SelectValue placeholder="Select field..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {selectedTable?.data.columns.map(col => (
                                            <SelectItem key={col.id} value={col.id}>
                                              <div className="flex items-center gap-2">
                                                {col.isKey && <Key className="w-3 h-3 text-amber-500" />}
                                                {col.displayName || col.name}
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => removeFieldMapping(mapping.id)}
                                        className="h-8 w-8 text-zinc-400 hover:text-red-500"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                        </div>
                      )}

                      {/* Step 3/4: Join Type (for 'join' mode only) */}
                      {joinMode === 'join' && fieldMappings.length > 0 && (
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</span>
                              What to do with non-matching rows?
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'left', label: 'Keep All My Data', desc: 'Keep all rows from this table, add matching info from the other' },
                                    { id: 'inner', label: 'Only Matches', desc: 'Only keep rows that match in both tables' },
                                    { id: 'right', label: 'Keep All Their Data', desc: 'Keep all rows from the other table' },
                                    { id: 'full', label: 'Keep Everything', desc: 'Keep all rows from both tables, match where possible' },
                                ].map((type) => (
                                    <div 
                                      key={type.id}
                                      onClick={() => setJoinType(type.id as any)}
                                      className={cn(
                                          "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                                          joinType === type.id 
                                              ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                                              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-primary/30"
                                      )}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                          {/* Venn Diagram */}
                                          <svg width="48" height="32" viewBox="0 0 48 32" className="shrink-0">
                                            {type.id === 'left' && (
                                              <>
                                                <circle cx="16" cy="16" r="12" className="fill-blue-500" />
                                                <circle cx="32" cy="16" r="12" className="fill-zinc-200 dark:fill-zinc-700" />
                                                <path d="M24 6.5a12 12 0 0 0 0 19" className="fill-blue-500" />
                                              </>
                                            )}
                                            {type.id === 'inner' && (
                                              <>
                                                <circle cx="16" cy="16" r="12" className="fill-zinc-200 dark:fill-zinc-700" />
                                                <circle cx="32" cy="16" r="12" className="fill-zinc-200 dark:fill-zinc-700" />
                                                <clipPath id="innerClip">
                                                  <circle cx="32" cy="16" r="12" />
                                                </clipPath>
                                                <circle cx="16" cy="16" r="12" className="fill-purple-500" clipPath="url(#innerClip)" />
                                              </>
                                            )}
                                            {type.id === 'right' && (
                                              <>
                                                <circle cx="16" cy="16" r="12" className="fill-zinc-200 dark:fill-zinc-700" />
                                                <circle cx="32" cy="16" r="12" className="fill-emerald-500" />
                                                <path d="M24 6.5a12 12 0 0 1 0 19" className="fill-emerald-500" />
                                              </>
                                            )}
                                            {type.id === 'full' && (
                                              <>
                                                <circle cx="16" cy="16" r="12" className="fill-blue-500" />
                                                <circle cx="32" cy="16" r="12" className="fill-emerald-500" />
                                                <clipPath id="fullClip">
                                                  <circle cx="32" cy="16" r="12" />
                                                </clipPath>
                                                <circle cx="16" cy="16" r="12" className="fill-purple-500" clipPath="url(#fullClip)" />
                                              </>
                                            )}
                                            {/* Circle outlines for clarity */}
                                            <circle cx="16" cy="16" r="12" className="fill-none stroke-zinc-400 dark:stroke-zinc-500" strokeWidth="0.5" />
                                            <circle cx="32" cy="16" r="12" className="fill-none stroke-zinc-400 dark:stroke-zinc-500" strokeWidth="0.5" />
                                          </svg>
                                          <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                              <span className="font-medium text-sm">{type.label}</span>
                                              {joinType === type.id && <Check className="w-4 h-4 text-primary animate-in zoom-in" />}
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-0.5">{type.desc}</p>
                                          </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Legend */}
                            <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 pt-2">
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-blue-500" />
                                <span>Your table</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                <span>Other table</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-purple-500" />
                                <span>Overlap (matches)</span>
                              </div>
                            </div>
                        </div>
                      )}

                      {/* Preview Section */}
                      {previewData && previewData.outputColumns.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-purple-500" />
                            <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              Preview: What your combined table will look like
                            </label>
                          </div>
                          
                          {/* Explanation */}
                          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                            <p className="text-xs text-purple-700 dark:text-purple-300">
                              {previewData.explanation}
                            </p>
                          </div>

                          {/* Column Preview */}
                          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                            <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Table2 className="w-4 h-4 text-zinc-400" />
                                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                    Output will have {previewData.totalColumns} columns
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                    <span className="text-zinc-500">{node.data.displayLabel || node.data.label}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="text-zinc-500">{selectedTable?.data.displayLabel || selectedTable?.data.label}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                    <span className="text-zinc-500">Both</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Column Pills */}
                            <div className="p-3">
                              <div className="flex flex-wrap gap-2">
                                {previewData.outputColumns.map((col, idx) => (
                                  <div 
                                    key={idx}
                                    className={cn(
                                      "px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border",
                                      col.source === 'left' && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
                                      col.source === 'right' && "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
                                      col.source === 'both' && "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                                    )}
                                  >
                                    {col.isKey && <Key className="w-3 h-3" />}
                                    {col.name}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Sample Rows */}
                            <div className="border-t border-zinc-100 dark:border-zinc-800">
                              <div className="p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                                <p className="text-xs text-zinc-500 mb-2 font-medium">Sample output structure:</p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                                        <th className="text-left py-1.5 px-2 text-zinc-400 font-medium">#</th>
                                        {previewData.outputColumns.slice(0, 6).map((col, idx) => (
                                          <th key={idx} className="text-left py-1.5 px-2 text-zinc-500 font-medium">
                                            {col.name.length > 10 ? col.name.slice(0, 10) + '...' : col.name}
                                          </th>
                                        ))}
                                        {previewData.outputColumns.length > 6 && (
                                          <th className="text-left py-1.5 px-2 text-zinc-400">+{previewData.outputColumns.length - 6} more</th>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {previewData.sampleRows.slice(0, 3).map((row, rowIdx) => (
                                        <tr key={rowIdx} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                                          <td className="py-1.5 px-2 text-zinc-400">{rowIdx + 1}</td>
                                          {previewData.outputColumns.slice(0, 6).map((col, colIdx) => (
                                            <td key={colIdx} className={cn(
                                              "py-1.5 px-2",
                                              row[col.name] === '—' ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-600 dark:text-zinc-400"
                                            )}>
                                              {row[col.name] || '—'}
                                            </td>
                                          ))}
                                          {previewData.outputColumns.length > 6 && (
                                            <td className="py-1.5 px-2 text-zinc-300">...</td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action */}
                      <div className="pt-4 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800">
                          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md text-xs">
                              <AlertCircle className="w-4 h-4" />
                              <span>This will create a new combined table</span>
                          </div>
                          <Button 
                            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98]" 
                            disabled={!isReadyToJoin || isJoining}
                            onClick={handleJoin}
                            data-testid="button-create-combined"
                          >
                              {isJoining ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitMerge className="w-4 h-4 mr-2" />}
                              {isJoining ? 'Creating...' : 'Create Combined Table'}
                          </Button>
                      </div>
                    </>
                  )}

               </div>
               </ScrollArea>
             </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, ArrowRightLeft, Trash2, HelpCircle, Check, Sparkles, AlertTriangle, Key, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeyField {
  id: string;
  name: string;
  displayName?: string;
}

interface RelationshipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (type: string, label: string, joinType?: string, newSourceFieldId?: string, newTargetFieldId?: string) => void;
  onDelete?: () => void;
  sourceLabel: string;
  targetLabel: string;
  sourceFieldName?: string;
  targetFieldName?: string;
  sourceKeyFields?: KeyField[];
  targetKeyFields?: KeyField[];
  currentSourceFieldId?: string;
  currentTargetFieldId?: string;
  isEditing?: boolean;
  initialType?: string;
  initialJoinType?: string;
  sourceColumnData?: any[];
  targetColumnData?: any[];
}

const relationshipOptions = [
  { 
    value: "one-to-one", 
    label: "One-to-One", 
    code: "1:1",
    description: "Each row matches exactly one row in the other table.",
    example: "Example: One person has one passport."
  },
  { 
    value: "one-to-many", 
    label: "One-to-Many", 
    code: "1:N",
    description: "One row here can match many rows there.",
    example: "Example: One customer can have many orders."
  },
  { 
    value: "many-to-one", 
    label: "Many-to-One", 
    code: "N:1",
    description: "Many rows here match one row there.",
    example: "Example: Many orders belong to one customer."
  },
  { 
    value: "many-to-many", 
    label: "Many-to-Many", 
    code: "M:N",
    description: "Many rows can match many rows.",
    example: "Example: Students take many classes, classes have many students."
  },
];

const joinTypeOptions = [
  { 
    id: 'left', 
    label: 'Keep All From Left', 
    desc: 'Keep all rows from the first table'
  },
  { 
    id: 'inner', 
    label: 'Only Matches', 
    desc: 'Only rows that match in both'
  },
  { 
    id: 'right', 
    label: 'Keep All From Right', 
    desc: 'Keep all rows from the second table'
  },
  { 
    id: 'full', 
    label: 'Keep Everything', 
    desc: 'Keep all rows from both tables'
  },
];

// Venn diagram component for join types
function JoinVennDiagram({ type, selected }: { type: string; selected: boolean }) {
  const baseOpacity = selected ? 1 : 0.7;
  
  return (
    <svg width="40" height="28" viewBox="0 0 48 32" className="shrink-0">
      {type === 'left' && (
        <>
          <circle cx="16" cy="16" r="11" className="fill-blue-500" opacity={baseOpacity} />
          <circle cx="32" cy="16" r="11" className="fill-zinc-200 dark:fill-zinc-700" opacity={0.5} />
          <path d="M24 7a11 11 0 0 0 0 18" className="fill-blue-500" opacity={baseOpacity} />
        </>
      )}
      {type === 'inner' && (
        <>
          <circle cx="16" cy="16" r="11" className="fill-zinc-200 dark:fill-zinc-700" opacity={0.5} />
          <circle cx="32" cy="16" r="11" className="fill-zinc-200 dark:fill-zinc-700" opacity={0.5} />
          <clipPath id="innerClipModal">
            <circle cx="32" cy="16" r="11" />
          </clipPath>
          <circle cx="16" cy="16" r="11" className="fill-purple-500" clipPath="url(#innerClipModal)" opacity={baseOpacity} />
        </>
      )}
      {type === 'right' && (
        <>
          <circle cx="16" cy="16" r="11" className="fill-zinc-200 dark:fill-zinc-700" opacity={0.5} />
          <circle cx="32" cy="16" r="11" className="fill-emerald-500" opacity={baseOpacity} />
          <path d="M24 7a11 11 0 0 1 0 18" className="fill-emerald-500" opacity={baseOpacity} />
        </>
      )}
      {type === 'full' && (
        <>
          <circle cx="16" cy="16" r="11" className="fill-blue-500" opacity={baseOpacity} />
          <circle cx="32" cy="16" r="11" className="fill-emerald-500" opacity={baseOpacity} />
          <clipPath id="fullClipModal">
            <circle cx="32" cy="16" r="11" />
          </clipPath>
          <circle cx="16" cy="16" r="11" className="fill-purple-500" clipPath="url(#fullClipModal)" opacity={baseOpacity} />
        </>
      )}
      <circle cx="16" cy="16" r="11" className="fill-none stroke-zinc-400 dark:stroke-zinc-500" strokeWidth="0.5" />
      <circle cx="32" cy="16" r="11" className="fill-none stroke-zinc-400 dark:stroke-zinc-500" strokeWidth="0.5" />
    </svg>
  );
}

// Cardinality diagram component - exported for use in edges
export function CardinalityDiagram({ type, size = 'normal', animated = false }: { type: string; size?: 'mini' | 'normal'; animated?: boolean }) {
  const width = size === 'mini' ? 24 : 48;
  const height = size === 'mini' ? 16 : 32;
  
  return (
    <svg width={width} height={height} viewBox="0 0 48 32" className="shrink-0">
      <defs>
        <style>{`
          @keyframes pulse-glow {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
          @keyframes flow-dash {
            to { stroke-dashoffset: -12; }
          }
        `}</style>
      </defs>
      {type === 'one-to-one' && (
        <>
          <circle cx="12" cy="16" r="6" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite' } : {}} />
          <circle cx="36" cy="16" r="6" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.6s' } : {}} />
          <line x1="18" y1="16" x2="30" y2="16" className="stroke-purple-500" strokeWidth="2" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite' } : {}} />
        </>
      )}
      {type === 'one-to-many' && (
        <>
          <circle cx="12" cy="16" r="6" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite' } : {}} />
          <circle cx="36" cy="8" r="4" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0s' } : {}} />
          <circle cx="36" cy="16" r="4" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.3s' } : {}} />
          <circle cx="36" cy="24" r="4" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.6s' } : {}} />
          <line x1="18" y1="16" x2="32" y2="8" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0s' } : {}} />
          <line x1="18" y1="16" x2="32" y2="16" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0.15s' } : {}} />
          <line x1="18" y1="16" x2="32" y2="24" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0.3s' } : {}} />
        </>
      )}
      {type === 'many-to-one' && (
        <>
          <circle cx="12" cy="8" r="4" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0s' } : {}} />
          <circle cx="12" cy="16" r="4" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.3s' } : {}} />
          <circle cx="12" cy="24" r="4" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.6s' } : {}} />
          <circle cx="36" cy="16" r="6" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite' } : {}} />
          <line x1="16" y1="8" x2="30" y2="16" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0s' } : {}} />
          <line x1="16" y1="16" x2="30" y2="16" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0.15s' } : {}} />
          <line x1="16" y1="24" x2="30" y2="16" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0.3s' } : {}} />
        </>
      )}
      {type === 'many-to-many' && (
        <>
          <circle cx="10" cy="10" r="4" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0s' } : {}} />
          <circle cx="10" cy="22" r="4" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.3s' } : {}} />
          <circle cx="38" cy="10" r="4" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.15s' } : {}} />
          <circle cx="38" cy="22" r="4" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.45s' } : {}} />
          <line x1="14" y1="10" x2="34" y2="10" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0s' } : {}} />
          <line x1="14" y1="10" x2="34" y2="22" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0.1s' } : {}} />
          <line x1="14" y1="22" x2="34" y2="10" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0.2s' } : {}} />
          <line x1="14" y1="22" x2="34" y2="22" className="stroke-purple-500" strokeWidth="1.5" strokeDasharray={animated ? "4 3" : "none"} style={animated ? { animation: 'flow-dash 0.8s linear infinite', animationDelay: '0.3s' } : {}} />
        </>
      )}
    </svg>
  );
}

export function RelationshipModal({ 
  open, 
  onOpenChange, 
  onConfirm, 
  onDelete, 
  sourceLabel, 
  targetLabel,
  sourceFieldName,
  targetFieldName,
  sourceKeyFields = [],
  targetKeyFields = [],
  currentSourceFieldId,
  currentTargetFieldId,
  isEditing = false,
  initialType,
  initialJoinType,
  sourceColumnData,
  targetColumnData
}: RelationshipModalProps) {
  const [selectedType, setSelectedType] = useState(initialType || "many-to-one");
  const [selectedJoinType, setSelectedJoinType] = useState(initialJoinType || "left");
  const [selectedSourceField, setSelectedSourceField] = useState('');
  const [selectedTargetField, setSelectedTargetField] = useState('');
  
  useEffect(() => {
    if (open) {
      setSelectedType(initialType || "many-to-one");
      setSelectedJoinType(initialJoinType || "left");
      // Initialize with current field ID, or first available key field as default
      const defaultSourceId = currentSourceFieldId || sourceKeyFields[0]?.id || '';
      const defaultTargetId = currentTargetFieldId || targetKeyFields[0]?.id || '';
      setSelectedSourceField(defaultSourceId);
      setSelectedTargetField(defaultTargetId);
    }
  }, [open, initialType, initialJoinType, currentSourceFieldId, currentTargetFieldId, sourceKeyFields, targetKeyFields]);
  
  const recommendation = useMemo(() => {
    if (!sourceColumnData || !targetColumnData) return null;
    
    const sourceValues = sourceColumnData.filter(v => v != null && v !== '');
    const targetValues = targetColumnData.filter(v => v != null && v !== '');
    
    if (sourceValues.length === 0 || targetValues.length === 0) return null;
    
    const rowsA = sourceValues.length;
    const rowsB = targetValues.length;
    const distinctA = new Set(sourceValues).size;
    const distinctB = new Set(targetValues).size;
    const dupsA = rowsA - distinctA;
    const dupsB = rowsB - distinctB;
    
    const sourceIsUnique = dupsA === 0;
    const targetIsUnique = dupsB === 0;
    
    let recommendedType: string;
    let reason: string;
    
    if (sourceIsUnique && targetIsUnique) {
      recommendedType = "one-to-one";
      reason = "Both columns have all unique values";
    } else if (sourceIsUnique && !targetIsUnique) {
      recommendedType = "one-to-many";
      reason = `${sourceLabel} is unique (${distinctA} values), ${targetLabel} has ${dupsB} duplicates`;
    } else if (!sourceIsUnique && targetIsUnique) {
      recommendedType = "many-to-one";
      reason = `${sourceLabel} has ${dupsA} duplicates, ${targetLabel} is unique (${distinctB} values)`;
    } else {
      recommendedType = "many-to-many";
      reason = `Both have duplicates (${dupsA} in ${sourceLabel}, ${dupsB} in ${targetLabel})`;
    }
    
    return { 
      type: recommendedType, 
      reason,
      hasDuplicates: !sourceIsUnique || !targetIsUnique
    };
  }, [sourceColumnData, targetColumnData, sourceLabel, targetLabel]);
  
  const handleConfirm = () => {
    const option = relationshipOptions.find(o => o.value === selectedType);
    // Always pass the selected field IDs - they may differ from current or be newly selected
    onConfirm(selectedType, option?.label || "Many-to-One", selectedJoinType, selectedSourceField || undefined, selectedTargetField || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] glass-card border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4 text-primary" />
            {isEditing ? 'Edit Connection' : 'Create Connection'}
          </DialogTitle>
          <DialogDescription>
            Choose how these two tables are related and how data should be combined.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-5">
          {/* Connected Fields Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              Connected Fields
            </Label>
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-3">
                {/* Source Field */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    {sourceLabel}
                  </div>
                  {sourceKeyFields.length > 1 ? (
                    <Select value={selectedSourceField} onValueChange={setSelectedSourceField}>
                      <SelectTrigger className="h-9 text-sm font-medium bg-white dark:bg-zinc-900">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceKeyFields.map(field => (
                          <SelectItem key={field.id} value={field.id}>
                            <div className="flex items-center gap-2">
                              <Key className="w-3 h-3 text-amber-500" />
                              <span>{field.displayName || field.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-9 px-3 flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      <Key className="w-3 h-3 text-amber-500" />
                      <span className="text-sm font-medium truncate">{sourceFieldName || 'No field'}</span>
                    </div>
                  )}
                </div>

                {/* Arrow */}
                <div className="flex flex-col items-center shrink-0 pt-5">
                  <Link2 className="w-4 h-4 text-purple-500" />
                </div>

                {/* Target Field */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    {targetLabel}
                  </div>
                  {targetKeyFields.length > 1 ? (
                    <Select value={selectedTargetField} onValueChange={setSelectedTargetField}>
                      <SelectTrigger className="h-9 text-sm font-medium bg-white dark:bg-zinc-900">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetKeyFields.map(field => (
                          <SelectItem key={field.id} value={field.id}>
                            <div className="flex items-center gap-2">
                              <Key className="w-3 h-3 text-amber-500" />
                              <span>{field.displayName || field.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-9 px-3 flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      <Key className="w-3 h-3 text-amber-500" />
                      <span className="text-sm font-medium truncate">{targetFieldName || 'No field'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Smart Recommendation */}
          {recommendation && (
            <div className="space-y-2">
              <button
                onClick={() => setSelectedType(recommendation.type)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                  selectedType === recommendation.type
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
                    : "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-700"
                )}
                data-testid="button-apply-recommendation"
              >
                <div className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-800/30">
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Recommended:</span>
                    <CardinalityDiagram type={recommendation.type} />
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                      {relationshipOptions.find(o => o.value === recommendation.type)?.label}
                    </span>
                    {selectedType === recommendation.type && <Check className="w-3 h-3 text-amber-600 ml-auto" />}
                  </div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">{recommendation.reason}</p>
                </div>
              </button>
              
              {/* M:M Warning - shown when user selects M:M and data has duplicates */}
              {recommendation.hasDuplicates && selectedType === 'many-to-many' && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800" data-testid="warning-mm-join">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-orange-700 dark:text-orange-300">
                    <span className="font-medium">Caution:</span> Many-to-many joins may multiply rows. Consider deduplicating or aggregating one side first.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Relationship Type */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</span>
              How are these tables related?
            </Label>
            <RadioGroup value={selectedType} onValueChange={setSelectedType} className="grid grid-cols-2 gap-2">
              {relationshipOptions.map((option) => (
                <div 
                  key={option.value}
                  className={cn(
                    "flex items-start gap-2 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md",
                    selectedType === option.value 
                      ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20' 
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  )}
                  onClick={() => setSelectedType(option.value)}
                >
                  <CardinalityDiagram type={option.value} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{option.label}</span>
                      <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">
                        {option.code}
                      </span>
                      {selectedType === option.value && <Check className="w-3 h-3 text-primary ml-auto" />}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">{option.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Join Type with Venn Diagrams */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</span>
              When combining data, what to keep?
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {joinTypeOptions.map((option) => (
                <div 
                  key={option.id}
                  onClick={() => setSelectedJoinType(option.id)}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                    selectedJoinType === option.id 
                      ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20' 
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  )}
                >
                  <JoinVennDiagram type={option.id} selected={selectedJoinType === option.id} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs">{option.label}</span>
                      {selectedJoinType === option.id && <Check className="w-3 h-3 text-primary" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{option.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-400 pt-1">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Left table</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Right table</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span>Matches</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex !justify-between sm:justify-between w-full items-center gap-2">
           {isEditing && onDelete ? (
               <Button 
                   variant="destructive" 
                   size="sm" 
                   onClick={onDelete}
                   className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-200 dark:border-red-900/30 shadow-none"
               >
                   <Trash2 className="w-4 h-4 mr-2" />
                   Remove
               </Button>
           ) : (
               <div />
           )}
           <div className="flex gap-2">
               <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
               <Button onClick={handleConfirm}>
                   {isEditing ? 'Update' : 'Connect Tables'}
               </Button>
           </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Handle, Position, Node, NodeProps } from '@xyflow/react';
import { Key, MoreVertical, Database, Trash2, Pencil, KeyRound, Copy, ArrowUp, ArrowDown, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataTypeSelector, DataType } from '@/components/ui/data-type-selector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EditableLabel } from '@/components/ui/editable-label';
import { FloatingMenu, MenuItem, MenuDivider } from '@/components/ui/floating-menu';
import { useState, useRef } from 'react';

export interface Column {
  id: string;
  name: string;
  displayName?: string;
  type: DataType;
  isKey?: boolean;
}

export type TableNodeData = {
  label: string;
  displayLabel?: string;
  iconColor?: string;
  columns: Column[];
  rawData?: Record<string, any>[];
  connectedColumnIds?: string[];
  sourceConnectedColumnIds?: string[];
  targetConnectedColumnIds?: string[];
  // Map of columnId -> which side ('left' or 'right') the handle should be on based on connected table position
  columnHandleSides?: Record<string, 'left' | 'right'>;
  onTypeChange?: (columnId: string, newType: DataType) => void;
  onToggleKey?: (columnId: string) => void;
  onRenameTable?: (newDisplayName: string) => void;
  onRenameColumn?: (columnId: string, newDisplayName: string) => void;
  onDeleteColumn?: (columnId: string) => void;
  onDuplicateColumn?: (columnId: string) => void;
  onMoveColumn?: (columnId: string, direction: 'up' | 'down') => void;
  onEdgeClick?: (columnId: string, handleType: 'source' | 'target') => void;
  onChangeIconColor?: (color: string) => void;
};

interface FieldContextMenuProps {
  position: { x: number; y: number };
  column: Column;
  columnIndex: number;
  totalColumns: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleKey: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function FieldContextMenu({ 
  position, 
  column, 
  columnIndex,
  totalColumns,
  onClose, 
  onRename, 
  onDelete, 
  onToggleKey,
  onDuplicate,
  onMoveUp,
  onMoveDown
}: FieldContextMenuProps) {
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

export type TableNodeType = Node<TableNodeData, 'table'>;

export function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const [contextMenu, setContextMenu] = useState<{
    column: Column;
    columnIndex: number;
    position: { x: number; y: number };
  } | null>(null);
  
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  
  // Handle scroll anywhere on table - scroll the columns list
  const handleTableWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (columnsRef.current) {
      columnsRef.current.scrollTop += e.deltaY;
    }
  };

  const handleColumnContextMenu = (e: React.MouseEvent, col: Column, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      column: col,
      columnIndex: index,
      position: { x: e.clientX, y: e.clientY }
    });
  };

  return (
    <div 
      className={cn(
        "min-w-[280px] rounded-xl border transition-all duration-300 shadow-sm",
        "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl",
        selected ? "border-primary ring-2 ring-primary/20 shadow-xl shadow-primary/10" : "border-zinc-200 dark:border-zinc-800 hover:border-primary/50",
        "overflow-visible"
      )}
      onWheel={handleTableWheel}
    >
      {/* Header - Draggable area (only this div can drag the node on mobile) */}
      <div 
        data-node-drag-handle
        className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-800/50 rounded-t-xl cursor-grab-custom active:cursor-grabbing-custom"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div 
            className="p-1.5 rounded-md shrink-0 transition-colors"
            style={{ 
              backgroundColor: data.iconColor ? `${data.iconColor}20` : 'rgb(var(--primary) / 0.1)',
              color: data.iconColor || 'rgb(var(--primary))'
            }}
          >
            <Database className="w-4 h-4" />
          </div>
          <EditableLabel
            value={data.label}
            displayValue={data.displayLabel}
            originalValue={data.label}
            onSave={(newName) => data.onRenameTable?.(newName)}
            className="font-semibold text-sm text-zinc-900 dark:text-zinc-100"
            iconSize="sm"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors shrink-0">
              <MoreVertical className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Right-click for more options</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Columns - nodrag class allows touch scrolling without moving the node */}
      {/* Extra horizontal padding (px-8) to accommodate handle icons that extend beyond the table */}
      {/* Wheel scroll handled at table level for scrolling anywhere on the table */}
      <div 
        ref={columnsRef}
        className="nodrag px-8 py-2 flex flex-col gap-1 max-h-[320px] overflow-y-auto overflow-x-hidden scrollbar-thin touch-pan-y"
      >
        {data.columns.map((col, index) => {
          // Determine which side this column's connection handle should be on
          // For connected columns, use the calculated optimal side based on connected table position
          // For unconnected key columns, show handles on both sides for potential connections
          const isConnected = data.connectedColumnIds?.includes(col.id);
          const isSourceConnected = data.sourceConnectedColumnIds?.includes(col.id);
          const isTargetConnected = data.targetConnectedColumnIds?.includes(col.id);
          const handleSide = data.columnHandleSides?.[col.id]; // 'left' or 'right' based on connected table position
          
          // For unconnected key fields: show dormant handles on both sides
          // For connected source fields: show handle on the calculated optimal side
          // For connected target fields: show handle on the calculated optimal side
          const sourceHandleSide = isSourceConnected ? handleSide : undefined;
          const targetHandleSide = isTargetConnected ? handleSide : undefined;
          
          return (
          <div 
            key={col.id} 
            className="relative group flex items-center justify-between p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-context-menu min-w-fit"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => handleColumnContextMenu(e, col, index)}
          >
            {/* Left Side - shows handles for:
                - Connected source handles when target table is on the left
                - Connected target handles when source table is on the left  
                - Dormant handles for key fields (for potential connections) */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-50 overflow-visible">
              {/* SOURCE handle on LEFT - when source is connected and optimal side is left */}
              {isSourceConnected && sourceHandleSide === 'left' && (
                <>
                  <Handle
                    type="source"
                    position={Position.Left}
                    id={`${col.id}-source`}
                    data-testid={`handle-source-${col.id}`}
                    className="!absolute !w-7 !h-7 !bg-transparent !border-none !left-0 !top-0 !transform-none !rounded-full cursor-link z-10"
                  />
                  <button 
                    type="button"
                    data-testid={`connection-source-${col.id}`}
                    className="relative z-20 w-7 h-7 rounded-full flex items-center justify-center bg-purple-500/90 border-2 border-purple-400/50 shadow-lg shadow-purple-500/30 cursor-pointer transition-all duration-200 hover:scale-125 hover:shadow-xl hover:shadow-purple-500/50 hover:bg-purple-400 hover:border-purple-300 active:scale-95 group/link"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdgeClick?.(col.id, 'source');
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5 text-white transition-transform group-hover/link:rotate-12" />
                  </button>
                </>
              )}
              {/* TARGET handle on LEFT - when target is connected and optimal side is left */}
              {isTargetConnected && targetHandleSide === 'left' && (
                <>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${col.id}-target`}
                    data-testid={`handle-target-${col.id}`}
                    className="!absolute !w-7 !h-7 !bg-transparent !border-none !left-0 !top-0 !transform-none !rounded-full cursor-link z-10"
                  />
                  <button 
                    type="button"
                    data-testid={`connection-target-${col.id}`}
                    className="relative z-20 w-7 h-7 rounded-full flex items-center justify-center bg-purple-500/90 border-2 border-purple-400/50 shadow-lg shadow-purple-500/30 cursor-pointer transition-all duration-200 hover:scale-125 hover:shadow-xl hover:shadow-purple-500/50 hover:bg-purple-400 hover:border-purple-300 active:scale-95 group/link"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdgeClick?.(col.id, 'target');
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5 text-white transition-transform group-hover/link:rotate-12" />
                  </button>
                </>
              )}
              {/* Dormant handles for unconnected key fields - allow starting new connections */}
              {col.isKey && !isConnected && (
                <>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${col.id}-target`}
                    data-testid={`handle-target-${col.id}`}
                    className="!absolute !w-7 !h-7 !bg-transparent !border-none !left-0 !top-0 !transform-none !rounded-full cursor-link z-10"
                  />
                  <div 
                    data-testid={`handle-visual-left-${col.id}`}
                    className="relative z-20 w-7 h-7 rounded-full flex items-center justify-center bg-zinc-300/50 dark:bg-zinc-700/50 border-2 border-zinc-300/30 dark:border-zinc-600/30 cursor-link transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-125 hover:bg-purple-400/60 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/30 active:scale-95 group/link pointer-events-none"
                  >
                    <Link2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 transition-all group-hover/link:text-white group-hover/link:rotate-12" />
                  </div>
                </>
              )}
            </div>

            {/* Key Icon */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onToggleKey?.(col.id);
                  }}
                  className={cn(
                    "shrink-0 transition-all hover:scale-110 focus:outline-none p-0.5 rounded cursor-key w-5 flex items-center justify-center",
                    col.isKey 
                      ? "opacity-100" 
                      : "opacity-0 group-hover:opacity-40 hover:!opacity-100"
                  )}
                  data-testid={`toggle-key-${col.id}`}
                >
                  <Key className={cn(
                    "w-3.5 h-3.5 transition-colors",
                    col.isKey 
                      ? "text-amber-500 fill-amber-500/20" 
                      : "text-zinc-400"
                  )} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {col.isKey 
                    ? "Click to remove as key" 
                    : "Click to make this a key (for linking tables)"}
                </p>
              </TooltipContent>
            </Tooltip>
            
            {/* Column Name - takes remaining space */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <EditableLabel
                value={col.name}
                displayValue={col.displayName}
                originalValue={col.name}
                onSave={(newName) => data.onRenameColumn?.(col.id, newName)}
                className={cn(
                  "text-sm transition-colors font-medium select-none truncate",
                  col.isKey ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400",
                  "group-hover:text-primary"
                )}
                iconSize="sm"
                externalEditTrigger={editingColumnId === col.id}
                onEditEnd={() => setEditingColumnId(null)}
              />
            </div>
            
            {/* Data Type - fixed width for alignment */}
            <div className="shrink-0 w-6 flex items-center justify-center cursor-datatype" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DataTypeSelector 
                        value={col.type} 
                        onChange={(newType) => data.onTypeChange?.(col.id, newType)}
                        triggerClassName="h-5 w-5 px-0 justify-center opacity-60 group-hover:opacity-100 cursor-datatype"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Change data type</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Right Side - shows handles for:
                - Connected source handles when target table is on the right
                - Connected target handles when source table is on the right  
                - Dormant handles for key fields (for potential connections) */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full z-50 overflow-visible">
              {/* SOURCE handle on RIGHT - when source is connected and optimal side is right */}
              {isSourceConnected && sourceHandleSide === 'right' && (
                <>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`${col.id}-source`}
                    data-testid={`handle-source-${col.id}`}
                    className="!absolute !w-7 !h-7 !bg-transparent !border-none !right-0 !top-0 !transform-none !rounded-full cursor-link z-10"
                  />
                  <button 
                    type="button"
                    data-testid={`connection-source-${col.id}`}
                    className="relative z-20 w-7 h-7 rounded-full flex items-center justify-center bg-purple-500/90 border-2 border-purple-400/50 shadow-lg shadow-purple-500/30 cursor-pointer transition-all duration-200 hover:scale-125 hover:shadow-xl hover:shadow-purple-500/50 hover:bg-purple-400 hover:border-purple-300 active:scale-95 group/link"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdgeClick?.(col.id, 'source');
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5 text-white transition-transform group-hover/link:rotate-12" />
                  </button>
                </>
              )}
              {/* TARGET handle on RIGHT - when target is connected and optimal side is right */}
              {isTargetConnected && targetHandleSide === 'right' && (
                <>
                  <Handle
                    type="target"
                    position={Position.Right}
                    id={`${col.id}-target`}
                    data-testid={`handle-target-${col.id}`}
                    className="!absolute !w-7 !h-7 !bg-transparent !border-none !right-0 !top-0 !transform-none !rounded-full cursor-link z-10"
                  />
                  <button 
                    type="button"
                    data-testid={`connection-target-${col.id}`}
                    className="relative z-20 w-7 h-7 rounded-full flex items-center justify-center bg-purple-500/90 border-2 border-purple-400/50 shadow-lg shadow-purple-500/30 cursor-pointer transition-all duration-200 hover:scale-125 hover:shadow-xl hover:shadow-purple-500/50 hover:bg-purple-400 hover:border-purple-300 active:scale-95 group/link"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdgeClick?.(col.id, 'target');
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5 text-white transition-transform group-hover/link:rotate-12" />
                  </button>
                </>
              )}
              {/* Dormant handles for unconnected key fields - allow starting new connections */}
              {col.isKey && !isConnected && (
                <>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`${col.id}-source`}
                    data-testid={`handle-source-${col.id}`}
                    className="!absolute !w-7 !h-7 !bg-transparent !border-none !right-0 !top-0 !transform-none !rounded-full cursor-link z-10"
                  />
                  <div 
                    data-testid={`handle-visual-right-${col.id}`}
                    className="relative z-20 w-7 h-7 rounded-full flex items-center justify-center bg-zinc-300/50 dark:bg-zinc-700/50 border-2 border-zinc-300/30 dark:border-zinc-600/30 cursor-link transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-125 hover:bg-purple-400/60 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/30 active:scale-95 group/link pointer-events-none"
                  >
                    <Link2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 transition-all group-hover/link:text-white group-hover/link:rotate-12" />
                  </div>
                </>
              )}
            </div>
          </div>
          );
        })}
      </div>
      
      <div className="h-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-b-xl" />
      
      {/* Field Context Menu */}
      {contextMenu && (
        <FieldContextMenu
          position={contextMenu.position}
          column={contextMenu.column}
          columnIndex={contextMenu.columnIndex}
          totalColumns={data.columns.length}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            setEditingColumnId(contextMenu.column.id);
          }}
          onDelete={() => {
            data.onDeleteColumn?.(contextMenu.column.id);
          }}
          onToggleKey={() => {
            data.onToggleKey?.(contextMenu.column.id);
          }}
          onDuplicate={() => {
            data.onDuplicateColumn?.(contextMenu.column.id);
          }}
          onMoveUp={() => {
            data.onMoveColumn?.(contextMenu.column.id, 'up');
          }}
          onMoveDown={() => {
            data.onMoveColumn?.(contextMenu.column.id, 'down');
          }}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  ChevronDown,
  Rows,
  ArrowRightLeft,
  Table as TableIcon,
  Info,
  RefreshCw,
  Maximize2,
  Minimize2,
  AlertTriangle,
  ListOrdered
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TableNodeType } from '@/components/flow/TableNode';
import { Edge } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { executeJoin, type JoinTable, type JoinEdge as EngineJoinEdge, type JoinResult } from '@/lib/join/engine';
import type { JoinType } from '@shared/schema';

const PANEL_WIDTH_KEY = 'elegantjoins_preview_width';
const DEFAULT_WIDTH = 500;
const MIN_WIDTH = 350;
const MAX_WIDTH = 1200;
// The preview is a glance, not the export — a tight cap keeps the table snappy even
// against a many-to-many join that would otherwise fan out to thousands of rows.
const PREVIEW_ROW_LIMIT = 200;

const EMPTY_RESULT: JoinResult = { columns: [], rows: [], totalRows: 0, truncated: false, steps: [], warnings: [] };

interface JoinPreviewPanelProps {
  nodes: TableNodeType[];
  edges: Edge[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Turns React Flow state into the join engine's plain-data inputs.
 * Handle ids are `${columnId}-source` / `${columnId}-target`; the engine wants the
 * column NAME (not id), so we resolve id -> name against the owning node here.
 */
function buildJoinInputs(nodes: TableNodeType[], edges: Edge[]): { tables: JoinTable[]; joinEdges: EngineJoinEdge[] } {
  const tables: JoinTable[] = nodes.map((node) => ({
    nodeId: node.id,
    name: node.data.displayLabel || node.data.label,
    // dataType travels with the column: without it every filter and sort falls
    // back to text, where `amount more than 100` is not a text operator and so
    // silently matches every row.
    columns: node.data.columns.map((c) => ({ columnId: c.id, name: c.name, dataType: c.type })),
    rows: node.data.rawData ?? [],
  }));

  const columnNamesByNode = new Map(
    nodes.map((node) => [node.id, new Map(node.data.columns.map((c) => [c.id, c.name]))])
  );

  const joinEdges: EngineJoinEdge[] = [];
  for (const edge of edges) {
    const sourceColumnId = edge.sourceHandle?.replace(/-source$/, '');
    const targetColumnId = edge.targetHandle?.replace(/-target$/, '');
    const sourceColumn = sourceColumnId ? columnNamesByNode.get(edge.source)?.get(sourceColumnId) : undefined;
    const targetColumn = targetColumnId ? columnNamesByNode.get(edge.target)?.get(targetColumnId) : undefined;
    if (!sourceColumn || !targetColumn) continue; // link points at a column that no longer exists

    joinEdges.push({
      edgeId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceColumn,
      targetColumn,
      joinType: (edge.data?.joinType as JoinType | undefined) ?? 'left',
    });
  }

  return { tables, joinEdges };
}

export function JoinPreviewPanel({ nodes, edges, isOpen, onOpenChange }: JoinPreviewPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);
    return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Save width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(PANEL_WIDTH_KEY, panelWidth.toString());
  }, [panelWidth]);

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + deltaX, MIN_WIDTH), MAX_WIDTH);
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelWidth]);

  const hasConnections = edges.length > 0;

  const connectedNodes = useMemo(() => {
    const connectedNodeIds = new Set<string>();
    edges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });
    return nodes.filter(n => connectedNodeIds.has(n.id));
  }, [nodes, edges]);

  // Tables the user placed but never loaded data into. Distinguished from "0 rows after
  // filtering" so the empty state can say the honest thing instead of looking broken.
  const tablesMissingData = useMemo(
    () => connectedNodes.filter(n => !n.data.rawData).map(n => n.data.displayLabel || n.data.label),
    [connectedNodes]
  );

  const { tables, joinEdges } = useMemo(() => buildJoinInputs(nodes, edges), [nodes, edges]);

  // executeJoin is a pure, synchronous function over plain data — no loading state needed.
  // Skipping the computation while closed avoids re-joining on every canvas edit that
  // isn't visible anyway; refreshTick lets the refresh button force a recompute.
  const result = useMemo(
    () => (isOpen && hasConnections ? executeJoin(tables, joinEdges, { rowLimit: PREVIEW_ROW_LIMIT }) : EMPTY_RESULT),
    [isOpen, hasConnections, tables, joinEdges, refreshTick]
  );

  const panelHeight = isExpanded ? 'h-[50vh]' : 'h-[280px]';

  if (!hasConnections && !isOpen) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="absolute bottom-3 left-3 z-20"
      style={{
        width: isOpen ? (isExpanded ? 'calc(100% - 24px)' : `${panelWidth}px`) : 'auto',
        maxWidth: isOpen ? `${MAX_WIDTH}px` : 'none'
      }}
    >
      <AnimatePresence>
        {!isOpen && hasConnections && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => onOpenChange(true)}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-zinc-200 dark:border-zinc-700 shadow-lg hover:shadow-xl hover:border-purple-500/30 transition-all"
                  data-testid="button-open-join-preview"
                >
                  <Rows className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-medium">Preview Join</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                    {edges.length} link{edges.length !== 1 ? 's' : ''}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Preview how your joined data will look</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden flex flex-col relative",
              panelHeight
            )}
          >
            {/* Resize handle on the right edge */}
            {!isExpanded && (
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-500/20 transition-colors z-10 flex items-center justify-center group"
                onMouseDown={handleResizeStart}
              >
                <div className="h-8 w-1 rounded-full bg-zinc-300 dark:bg-zinc-600 group-hover:bg-purple-500 transition-colors" />
              </div>
            )}
            <div className="h-12 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between px-4 bg-zinc-50/80 dark:bg-zinc-800/50 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600">
                  <Rows className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">Join Preview</h3>
                {result.rows.length > 0 && (
                  <span className="text-xs text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">
                    {result.rows.length.toLocaleString()} rows
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRefreshTick(t => t + 1)}
                      className="h-8 w-8 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      data-testid="button-refresh-preview"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Refresh preview</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="h-8 w-8 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      data-testid="button-expand-preview"
                    >
                      {isExpanded ? (
                        <Minimize2 className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <Maximize2 className="w-4 h-4 text-zinc-500" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{isExpanded ? 'Minimize' : 'Expand'}</p>
                  </TooltipContent>
                </Tooltip>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    onOpenChange(false);
                    setIsExpanded(false);
                  }}
                  className="h-8 w-8 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  data-testid="button-close-preview"
                >
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-zinc-50/50 dark:bg-zinc-900/50 scrollbar-thin">
              {result.steps.length > 0 && (
                <div data-testid="preview-steps" className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/30">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <ListOrdered className="w-3 h-3" /> How this was joined
                  </p>
                  <ol className="space-y-0.5">
                    {result.steps.map((step, i) => (
                      <li key={i} className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div data-testid="preview-warnings" className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30 space-y-1">
                  {result.warnings.map((warning, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{warning}</span>
                    </p>
                  ))}
                </div>
              )}

              {result.rows.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                    <Info className="w-6 h-6 text-zinc-400" />
                  </div>
                  {tablesMissingData.length > 0 ? (
                    <>
                      <p className="text-sm text-zinc-500 mb-1">No data loaded yet</p>
                      <p className="text-xs text-zinc-400">
                        {tablesMissingData.join(', ')} {tablesMissingData.length === 1 ? 'has' : 'have'} no rows uploaded — add data to preview the join.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-zinc-500 mb-1">No preview available</p>
                      <p className="text-xs text-zinc-400">Connect tables with matching fields to see joined data</p>
                    </>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-100/50 dark:bg-zinc-800/50 hover:bg-zinc-100/50">
                      {result.columns.map((col) => (
                        <TableHead key={col.key} className="whitespace-nowrap text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 px-3 py-2">
                          <div className="flex flex-col">
                            <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">{col.table}</span>
                            <span>{col.column}</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-white dark:hover:bg-zinc-800 border-zinc-100 dark:border-zinc-800 transition-colors">
                        {result.columns.map((col) => {
                          const value = row[col.key];
                          return (
                            <TableCell key={col.key} className="text-xs whitespace-nowrap px-3 py-2 font-mono">
                              {value === null || value === undefined
                                ? <span className="text-zinc-300 dark:text-zinc-600 italic">null</span>
                                : (typeof value === 'number' && col.column.toLowerCase().includes('amount')
                                    ? `$${value.toLocaleString()}`
                                    : String(value))
                              }
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="h-8 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between px-4 bg-zinc-50/80 dark:bg-zinc-800/50 shrink-0">
              <div className="flex items-center gap-2 text-[10px] text-zinc-400" data-testid="preview-row-count">
                <TableIcon className="w-3 h-3" />
                <span>
                  {result.truncated
                    ? `Showing ${result.rows.length.toLocaleString()} of ${result.totalRows.toLocaleString()} rows`
                    : `${result.rows.length.toLocaleString()} row${result.rows.length !== 1 ? 's' : ''}`}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <ArrowRightLeft className="w-3 h-3 text-purple-400" />
                <span>{edges.length} connection{edges.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

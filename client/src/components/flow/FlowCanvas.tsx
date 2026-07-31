import { useState, useEffect, useCallback } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  Panel,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  NodeMouseHandler,
  EdgeMouseHandler,
  OnNodeDrag,
  ReactFlowInstance,
  EdgeLabelRenderer,
  getSmoothStepPath,
  EdgeProps,
  BaseEdge
} from '@xyflow/react';
import { TableNode, TableNodeType } from './TableNode';
import { Button } from '@/components/ui/button';
import { Map, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
function JoinTypeIcon({ type, size = 'mini', animated = false }: { type: string; size?: 'mini' | 'normal'; animated?: boolean }) {
  const width = size === 'mini' ? 28 : 48;
  const height = size === 'mini' ? 20 : 32;
  
  return (
    <svg width={width} height={height} viewBox="0 0 48 32" className="shrink-0">
      <defs>
        <style>{`
          @keyframes pulse-glow {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </defs>
      
      {type === 'left' && (
        <>
          <circle cx="16" cy="16" r="10" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite' } : {}} />
          <circle cx="32" cy="16" r="10" className="fill-zinc-300 dark:fill-zinc-600" />
          <path d="M 24 8.5 A 10 10 0 0 1 24 23.5 A 10 10 0 0 1 24 8.5" className="fill-purple-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.3s' } : {}} />
        </>
      )}
      
      {type === 'right' && (
        <>
          <circle cx="16" cy="16" r="10" className="fill-zinc-300 dark:fill-zinc-600" />
          <circle cx="32" cy="16" r="10" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite' } : {}} />
          <path d="M 24 8.5 A 10 10 0 0 0 24 23.5 A 10 10 0 0 0 24 8.5" className="fill-purple-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.3s' } : {}} />
        </>
      )}
      
      {type === 'inner' && (
        <>
          <circle cx="16" cy="16" r="10" className="fill-zinc-300 dark:fill-zinc-600" />
          <circle cx="32" cy="16" r="10" className="fill-zinc-300 dark:fill-zinc-600" />
          <ellipse cx="24" cy="16" rx="6" ry="8" className="fill-purple-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite' } : {}} />
        </>
      )}
      
      {type === 'full' && (
        <>
          <circle cx="16" cy="16" r="10" className="fill-blue-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite' } : {}} />
          <circle cx="32" cy="16" r="10" className="fill-emerald-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.3s' } : {}} />
          <ellipse cx="24" cy="16" rx="6" ry="8" className="fill-purple-500" style={animated ? { animation: 'pulse-glow 1.2s ease-in-out infinite', animationDelay: '0.6s' } : {}} />
        </>
      )}
    </svg>
  );
}

function CardinalityEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const joinType = (data as any)?.joinType || 'left';

  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="cursor-link"
      />
      {/* Main edge path with hover glow effect */}
      <BaseEdge 
        id={id} 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: isHovered ? 3 : 2,
          stroke: isHovered ? '#8b5cf6' : (style?.stroke || '#6366f1'),
          filter: isHovered ? 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.6))' : 'none',
          transition: 'all 0.2s ease-out',
        }} 
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div 
            className={cn(
              "rounded-lg shadow-md border p-1.5 flex items-center justify-center transition-all duration-200",
              isHovered 
                ? "bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/40 dark:to-purple-900/40 border-violet-300 dark:border-violet-600 shadow-lg shadow-violet-500/20 scale-110" 
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
            )}
            style={{
              boxShadow: isHovered 
                ? '0 4px 20px rgba(139, 92, 246, 0.3)' 
                : '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}
          >
            <JoinTypeIcon type={joinType} size="mini" animated={isHovered} />
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  table: TableNode,
};

const edgeTypes = {
  cardinality: CardinalityEdge,
};

interface FlowCanvasProps {
  nodes: TableNodeType[];
  edges: Edge[];
  onNodesChange: OnNodesChange<TableNodeType>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick?: NodeMouseHandler;
  onNodeContextMenu?: NodeMouseHandler;
  onEdgeContextMenu?: EdgeMouseHandler;
  onEdgeClick?: EdgeMouseHandler;
  onPaneContextMenu?: (event: React.MouseEvent | MouseEvent) => void;
  onPaneClick?: () => void;
  // React Flow fires these from touch as well as mouse, so the event is
  // `MouseEvent | TouchEvent` — typing it as React.MouseEvent silently excluded every
  // touch drag. `OnNodeDrag` is the library's own signature; use it directly.
  onNodeDrag?: OnNodeDrag<TableNodeType>;
  onNodeDragStop?: OnNodeDrag<TableNodeType>;
}

export function FlowCanvas({ 
  nodes, 
  edges, 
  onNodesChange, 
  onEdgesChange, 
  onConnect, 
  onNodeClick,
  onNodeContextMenu,
  onEdgeContextMenu,
  onEdgeClick,
  onPaneContextMenu,
  onPaneClick,
  onNodeDrag,
  onNodeDragStop
}: FlowCanvasProps) {
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [minimapHovered, setMinimapHovered] = useState(false);
  const [minimapExpanded, setMinimapExpanded] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const collapseExpandedMenus = useCallback(() => {
    setMinimapExpanded(false);
    onPaneClick?.();
  }, [onPaneClick]);

  const handlePaneClick = useCallback(() => {
    collapseExpandedMenus();
  }, [collapseExpandedMenus]);

  const handleNodeClickWithCollapse: NodeMouseHandler = useCallback((event, node) => {
    collapseExpandedMenus();
    onNodeClick?.(event, node);
  }, [collapseExpandedMenus, onNodeClick]);

  const handleEdgeClickWithCollapse: EdgeMouseHandler = useCallback((event, edge) => {
    collapseExpandedMenus();
    onEdgeClick?.(event, edge);
  }, [collapseExpandedMenus, onEdgeClick]);

  const handleNodeContextMenuWithCollapse: NodeMouseHandler = useCallback((event, node) => {
    collapseExpandedMenus();
    onNodeContextMenu?.(event, node);
  }, [collapseExpandedMenus, onNodeContextMenu]);

  const handleEdgeContextMenuWithCollapse: EdgeMouseHandler = useCallback((event, edge) => {
    collapseExpandedMenus();
    onEdgeContextMenu?.(event, edge);
  }, [collapseExpandedMenus, onEdgeContextMenu]);

  const handlePaneContextMenuWithCollapse = useCallback((event: React.MouseEvent | MouseEvent) => {
    collapseExpandedMenus();
    onPaneContextMenu?.(event);
  }, [collapseExpandedMenus, onPaneContextMenu]);

  return (
    <div className="w-full h-full bg-zinc-50 dark:bg-zinc-950 relative">
      <div className="absolute inset-0 dot-grid opacity-50 pointer-events-none" />
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClickWithCollapse}
        onNodeContextMenu={handleNodeContextMenuWithCollapse}
        onEdgeContextMenu={handleEdgeContextMenuWithCollapse}
        onEdgeClick={handleEdgeClickWithCollapse}
        onPaneContextMenu={handlePaneContextMenuWithCollapse}
        onPaneClick={handlePaneClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeDragThreshold={10}
        fitView
        className="bg-zinc-50 dark:bg-zinc-950"
        defaultEdgeOptions={{
            type: 'cardinality',
            style: { strokeWidth: 2, stroke: '#6366f1' },
            animated: true,
        }}
      >
        <Background 
            variant={BackgroundVariant.Dots} 
            gap={24} 
            size={1} 
            color="currentColor" 
            className="text-zinc-300 dark:text-zinc-800 opacity-50"
        />
        <Controls className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400" />
        
        {/* Minimap - Top Right with hover expand (two-click on mobile) */}
        <Panel position="top-right">
          <AnimatePresence mode="wait">
            {!minimapVisible ? (
              <motion.div
                key="minimap-button"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onMouseEnter={() => !isTouchDevice && setMinimapHovered(true)}
                onMouseLeave={() => { 
                  setMinimapHovered(false); 
                  if (!isTouchDevice) setMinimapExpanded(false); 
                }}
              >
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isTouchDevice && !minimapExpanded) {
                      setMinimapExpanded(true);
                    } else {
                      setMinimapVisible(true);
                      setMinimapExpanded(false);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 h-10 rounded-lg shadow-lg border transition-all duration-200 overflow-hidden",
                    "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm",
                    "border-zinc-200 dark:border-zinc-700",
                    "hover:shadow-xl hover:border-primary/30 hover:bg-white dark:hover:bg-zinc-800",
                    (minimapHovered || minimapExpanded) ? "px-3" : "w-10 justify-center"
                  )}
                  data-testid="button-show-minimap"
                >
                  <div className="flex items-center justify-center shrink-0">
                    <Map className="w-4 h-4 text-primary" />
                  </div>
                  <AnimatePresence>
                    {(minimapHovered || minimapExpanded) && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="text-xs font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap overflow-hidden"
                      >
                        Show Map
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="minimap-panel"
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex flex-col bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <Map className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-medium text-zinc-500">Map</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMinimapVisible(false);
                    }}
                    className="p-2 -m-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                    data-testid="button-hide-minimap"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                
                {/* Map */}
                <div className="w-[180px] h-[120px]">
                  <MiniMap 
                    className="!bg-transparent !border-0 !m-0 !static"
                    style={{ width: 180, height: 120 }}
                    nodeColor={() => '#6366f1'}
                    maskColor="rgba(0, 0, 0, 0.08)"
                    pannable
                    zoomable
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </ReactFlow>
    </div>
  );
}

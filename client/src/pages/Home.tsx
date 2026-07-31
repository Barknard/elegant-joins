import { TopBar } from '@/components/layout/TopBar';
import { FlowCanvas } from '@/components/flow/FlowCanvas';
import { AddSourceModal, FieldMatch, ImportedTable } from '@/components/modals/AddSourceModal';
import { ViewBuilderPanel } from '@/components/panels/ViewBuilderPanel';
import { JoinPreviewPanel } from '@/components/panels/JoinPreviewPanel';
import { TableEditModal } from '@/components/modals/TableEditModal';
import { FlowContextMenu, MenuType } from '@/components/flow/FlowContextMenu';
import { RelationshipModal } from '@/components/modals/RelationshipModal';
import { WelcomeModal, isFirstRun, markAsVisited } from '@/components/modals/WelcomeModal';
import { TutorialOverlay } from '@/components/modals/TutorialOverlay';
import { OpenProjectModal } from '@/components/modals/OpenProjectModal';
import { SaveProjectModal } from '@/components/modals/SaveProjectModal';
import { Button } from '@/components/ui/button';
import { Plus, Database, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useNodesState, useEdgesState, addEdge, Connection, Edge, Node, useReactFlow } from '@xyflow/react';
import { TableNodeType, TableNodeData, Column } from '@/components/flow/TableNode';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/local-api';
import { useAutoSave } from '@/hooks/use-auto-save';
import { DataType } from '@/components/ui/data-type-selector';

// Sample data for tutorial
const SAMPLE_CUSTOMERS_DATA = [
  { customer_id: 1, full_name: 'Alice Johnson', email: 'alice@email.com', phone: '+1-555-0101', address: '123 Oak St', city: 'Portland', state: 'OR', zip_code: '97201', country: 'USA', company: 'Tech Corp', job_title: 'Engineer', signup_date: '2024-01-15', last_login: '2024-11-28', status: 'active', tier: 'gold' },
  { customer_id: 2, full_name: 'Bob Smith', email: 'bob@email.com', phone: '+1-555-0102', address: '456 Pine Ave', city: 'Seattle', state: 'WA', zip_code: '98101', country: 'USA', company: 'Design Inc', job_title: 'Designer', signup_date: '2024-02-20', last_login: '2024-11-25', status: 'active', tier: 'silver' },
  { customer_id: 3, full_name: 'Carol Williams', email: 'carol@email.com', phone: '+1-555-0103', address: '789 Elm Blvd', city: 'Denver', state: 'CO', zip_code: '80202', country: 'USA', company: 'Sales Pro', job_title: 'Manager', signup_date: '2024-03-10', last_login: '2024-11-20', status: 'active', tier: 'bronze' },
  { customer_id: 4, full_name: 'David Brown', email: 'david@email.com', phone: '+1-555-0104', address: '321 Cedar Ln', city: 'Austin', state: 'TX', zip_code: '78701', country: 'USA', company: 'Startup LLC', job_title: 'CEO', signup_date: '2024-04-05', last_login: '2024-11-15', status: 'inactive', tier: 'gold' },
  { customer_id: 5, full_name: 'Eva Martinez', email: 'eva@email.com', phone: '+1-555-0105', address: '654 Maple Dr', city: 'Miami', state: 'FL', zip_code: '33101', country: 'USA', company: 'Consulting Co', job_title: 'Analyst', signup_date: '2024-05-12', last_login: '2024-11-30', status: 'active', tier: 'platinum' }
];

const SAMPLE_ORDERS_DATA = [
  { order_id: 101, customer_id: 1, product_name: 'Laptop Pro', category: 'Electronics', quantity: 1, unit_price: 1299.00, amount: 1299.00, discount: 0, tax: 103.92, shipping: 15.00, payment_method: 'credit_card', shipping_address: '123 Oak St', order_date: '2024-10-15', ship_date: '2024-10-17', status: 'completed' },
  { order_id: 102, customer_id: 2, product_name: 'Wireless Mouse', category: 'Accessories', quantity: 2, unit_price: 45.00, amount: 89.99, discount: 0.01, tax: 7.20, shipping: 5.00, payment_method: 'paypal', shipping_address: '456 Pine Ave', order_date: '2024-10-18', ship_date: '2024-10-20', status: 'completed' },
  { order_id: 103, customer_id: 1, product_name: 'Monitor 27"', category: 'Electronics', quantity: 1, unit_price: 349.00, amount: 225.50, discount: 123.50, tax: 18.04, shipping: 25.00, payment_method: 'credit_card', shipping_address: '123 Oak St', order_date: '2024-10-22', ship_date: null, status: 'pending' },
  { order_id: 104, customer_id: 3, product_name: 'Keyboard Mech', category: 'Accessories', quantity: 1, unit_price: 129.00, amount: 75.00, discount: 54.00, tax: 6.00, shipping: 8.00, payment_method: 'debit_card', shipping_address: '789 Elm Blvd', order_date: '2024-10-25', ship_date: '2024-10-27', status: 'completed' },
  { order_id: 105, customer_id: 2, product_name: 'USB Hub', category: 'Accessories', quantity: 3, unit_price: 35.00, amount: 199.00, discount: 0, tax: 15.92, shipping: 0, payment_method: 'paypal', shipping_address: '456 Pine Ave', order_date: '2024-11-01', ship_date: '2024-11-03', status: 'shipped' },
  { order_id: 106, customer_id: 4, product_name: 'Tablet 10"', category: 'Electronics', quantity: 1, unit_price: 499.00, amount: 320.00, discount: 179.00, tax: 25.60, shipping: 12.00, payment_method: 'credit_card', shipping_address: '321 Cedar Ln', order_date: '2024-11-05', ship_date: '2024-11-07', status: 'completed' },
  { order_id: 107, customer_id: 5, product_name: 'Phone Case', category: 'Accessories', quantity: 2, unit_price: 25.00, amount: 45.50, discount: 4.50, tax: 3.64, shipping: 3.00, payment_method: 'apple_pay', shipping_address: '654 Maple Dr', order_date: '2024-11-10', ship_date: null, status: 'pending' }
];

// Initial mock data
const initialNodes: TableNodeType[] = [
  {
    id: '1',
    type: 'table',
    position: { x: 100, y: 100 },
    data: { 
      label: 'Customers.csv',
      iconColor: '#3b82f6',
      columns: [
        { id: 'c1', name: 'customer_id', type: 'number', isKey: true },
        { id: 'c2', name: 'full_name', type: 'text' },
        { id: 'c3', name: 'email', type: 'text' },
        { id: 'c4', name: 'phone', type: 'text' },
        { id: 'c5', name: 'address', type: 'text' },
        { id: 'c6', name: 'city', type: 'text' },
        { id: 'c7', name: 'state', type: 'text' },
        { id: 'c8', name: 'zip_code', type: 'text' },
        { id: 'c9', name: 'country', type: 'text' },
        { id: 'c10', name: 'company', type: 'text' },
        { id: 'c11', name: 'job_title', type: 'text' },
        { id: 'c12', name: 'signup_date', type: 'date' },
        { id: 'c13', name: 'last_login', type: 'date' },
        { id: 'c14', name: 'status', type: 'text' },
        { id: 'c15', name: 'tier', type: 'text' },
      ],
      rawData: SAMPLE_CUSTOMERS_DATA
    },
  },
  {
    id: '2',
    type: 'table',
    position: { x: 600, y: 150 },
    data: { 
      label: 'Orders.xlsx',
      iconColor: '#22c55e',
      columns: [
        { id: 'o1', name: 'order_id', type: 'number', isKey: true },
        { id: 'o2', name: 'customer_id', type: 'number', isKey: true },
        { id: 'o3', name: 'product_name', type: 'text' },
        { id: 'o4', name: 'category', type: 'text' },
        { id: 'o5', name: 'quantity', type: 'number' },
        { id: 'o6', name: 'unit_price', type: 'number' },
        { id: 'o7', name: 'amount', type: 'number' },
        { id: 'o8', name: 'discount', type: 'number' },
        { id: 'o9', name: 'tax', type: 'number' },
        { id: 'o10', name: 'shipping', type: 'number' },
        { id: 'o11', name: 'payment_method', type: 'text' },
        { id: 'o12', name: 'shipping_address', type: 'text' },
        { id: 'o13', name: 'order_date', type: 'date' },
        { id: 'o14', name: 'ship_date', type: 'date' },
        { id: 'o15', name: 'status', type: 'text' },
      ],
      rawData: SAMPLE_ORDERS_DATA
    },
  },
];

const initialEdges: Edge[] = [
  { 
    id: 'e1-2', 
    type: 'cardinality',
    source: '1', 
    sourceHandle: 'c1-source', 
    target: '2', 
    targetHandle: 'o2-target', 
    animated: true, 
    style: { stroke: '#6366f1', strokeWidth: 2 },
    data: { cardinalityType: 'many-to-one', joinType: 'left' }
  }
];

export default function Home() {
  const { toast } = useToast();

  // Start with empty canvas - sample data is loaded when user clicks "Get Started" in welcome modal
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isViewBuilderOpen, setIsViewBuilderOpen] = useState(false);
  const [isJoinPreviewOpen, setIsJoinPreviewOpen] = useState(false);
  const [runTriggered, setRunTriggered] = useState(false);
  
  const [selectedNode, setSelectedNode] = useState<TableNodeType | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Relationship Modal State
  const [isRelationshipModalOpen, setIsRelationshipModalOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);

  // Project Management State
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);

  // Onboarding State
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  
  // Mobile button states
  const [addButtonExpanded, setAddButtonExpanded] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [collapseRequest, setCollapseRequest] = useState(0);

  // Auto-save hook - automatically saves changes when a project is open
  const { isSaving, lastSaved, hasUnsavedChanges } = useAutoSave({
    projectId: currentProjectId,
    nodes,
    edges,
    debounceMs: 2000,
    enabled: currentProjectId !== null
  });

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const collapseAllExpandedButtons = useCallback(() => {
    setAddButtonExpanded(false);
    setCollapseRequest(prev => prev + 1);
    setIsJoinPreviewOpen(false);
  }, []);

  // Function to compute handle sides based on current node positions
  // This is called both on initial render and during node drags
  const computeHandleSides = useCallback((currentNodes: typeof nodes, currentEdges: typeof edges) => {
    const sourceConnectedCols: Record<string, Set<string>> = {};
    const targetConnectedCols: Record<string, Set<string>> = {};
    const handleSides: Record<string, Record<string, 'left' | 'right'>> = {};
    
    // Create a map of node positions for quick lookup
    const nodePositions: Record<string, { x: number; y: number; width: number }> = {};
    currentNodes.forEach(node => {
      nodePositions[node.id] = { 
        x: node.position.x, 
        y: node.position.y,
        width: (node as any).measured?.width || 280
      };
    });
    
    currentEdges.forEach(edge => {
      const sourcePos = nodePositions[edge.source];
      const targetPos = nodePositions[edge.target];
      
      if (sourcePos && targetPos) {
        const sourceCenterX = sourcePos.x + sourcePos.width / 2;
        const targetCenterX = targetPos.x + targetPos.width / 2;
        const sourceIsLeftOfTarget = sourceCenterX < targetCenterX;
        
        const sourceHandleSide = sourceIsLeftOfTarget ? 'right' : 'left';
        const targetHandleSide = sourceIsLeftOfTarget ? 'left' : 'right';
        
        if (edge.sourceHandle) {
          const colId = edge.sourceHandle.replace('-source', '');
          if (!sourceConnectedCols[edge.source]) sourceConnectedCols[edge.source] = new Set();
          sourceConnectedCols[edge.source].add(colId);
          if (!handleSides[edge.source]) handleSides[edge.source] = {};
          handleSides[edge.source][colId] = sourceHandleSide;
        }
        if (edge.targetHandle) {
          const colId = edge.targetHandle.replace('-target', '');
          if (!targetConnectedCols[edge.target]) targetConnectedCols[edge.target] = new Set();
          targetConnectedCols[edge.target].add(colId);
          if (!handleSides[edge.target]) handleSides[edge.target] = {};
          handleSides[edge.target][colId] = targetHandleSide;
        }
      }
    });
    
    return { sourceConnectedCols, targetConnectedCols, handleSides };
  }, []);

  // Compute connected column IDs for each node based on edges
  // Track which side (source/target) each column is connected on
  // Also compute which side handles should appear based on relative table positions
  const nodesWithConnections = useMemo(() => {
    const { sourceConnectedCols, targetConnectedCols, handleSides } = computeHandleSides(nodes, edges);
    
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        sourceConnectedColumnIds: Array.from(sourceConnectedCols[node.id] || []),
        targetConnectedColumnIds: Array.from(targetConnectedCols[node.id] || []),
        connectedColumnIds: [
          ...Array.from(sourceConnectedCols[node.id] || []),
          ...Array.from(targetConnectedCols[node.id] || [])
        ],
        columnHandleSides: handleSides[node.id] || {}
      }
    }));
  }, [nodes, edges, computeHandleSides]);

  // Handler to update handle sides when nodes are dragged
  // This ensures handles flip to the optimal side in real-time during drags
  const handleNodeDrag = useCallback((_event: React.MouseEvent | MouseEvent | TouchEvent, _node: Node, dragNodes: Node[]) => {
    // Create updated nodes array with the dragged node's new position
    const updatedNodes = nodes.map(n => {
      const draggedNode = dragNodes.find(dn => dn.id === n.id);
      return draggedNode ? { ...n, position: draggedNode.position } : n;
    });
    
    // Recompute handle sides with the updated positions
    const { sourceConnectedCols, targetConnectedCols, handleSides } = computeHandleSides(updatedNodes, edges);
    
    // Update node data with new handle sides (only for nodes involved in edges)
    setNodes(currentNodes => currentNodes.map(n => {
      const hasConnections = sourceConnectedCols[n.id]?.size > 0 || targetConnectedCols[n.id]?.size > 0;
      if (!hasConnections) return n;
      
      // Get position from dragged nodes or current position
      const draggedNode = dragNodes.find(dn => dn.id === n.id);
      const newPosition = draggedNode ? draggedNode.position : n.position;
      
      return {
        ...n,
        position: newPosition,
        data: {
          ...n.data,
          sourceConnectedColumnIds: Array.from(sourceConnectedCols[n.id] || []),
          targetConnectedColumnIds: Array.from(targetConnectedCols[n.id] || []),
          connectedColumnIds: [
            ...Array.from(sourceConnectedCols[n.id] || []),
            ...Array.from(targetConnectedCols[n.id] || [])
          ],
          columnHandleSides: handleSides[n.id] || {}
        }
      };
    }));
  }, [nodes, edges, computeHandleSides, setNodes]);

  // Also update on drag stop to ensure final positions are captured
  const handleNodeDragStop = useCallback((_event: React.MouseEvent | MouseEvent | TouchEvent, _node: Node, dragNodes: Node[]) => {
    // Create updated nodes array with final positions
    const updatedNodes = nodes.map(n => {
      const draggedNode = dragNodes.find(dn => dn.id === n.id);
      return draggedNode ? { ...n, position: draggedNode.position } : n;
    });
    
    // Recompute handle sides with the final positions
    const { sourceConnectedCols, targetConnectedCols, handleSides } = computeHandleSides(updatedNodes, edges);
    
    // Update all connected nodes with new handle sides
    setNodes(currentNodes => currentNodes.map(n => {
      const draggedNode = dragNodes.find(dn => dn.id === n.id);
      const newPosition = draggedNode ? draggedNode.position : n.position;
      const hasConnections = sourceConnectedCols[n.id]?.size > 0 || targetConnectedCols[n.id]?.size > 0;
      
      return {
        ...n,
        position: newPosition,
        data: {
          ...n.data,
          ...(hasConnections ? {
            sourceConnectedColumnIds: Array.from(sourceConnectedCols[n.id] || []),
            targetConnectedColumnIds: Array.from(targetConnectedCols[n.id] || []),
            connectedColumnIds: [
              ...Array.from(sourceConnectedCols[n.id] || []),
              ...Array.from(targetConnectedCols[n.id] || [])
            ],
            columnHandleSides: handleSides[n.id] || {}
          } : {})
        }
      };
    }));
  }, [nodes, edges, computeHandleSides, setNodes]);

  // Show welcome modal on every startup (unless user opted out by checking "Don't show at startup")
  useEffect(() => {
    const hasOptedOut = localStorage.getItem('elegantjoins_visited') === 'true';
    if (!hasOptedOut) {
      // User hasn't opted out, always show the welcome modal
      const timer = setTimeout(() => {
        setIsWelcomeModalOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Load sample data function
  const loadSampleData = useCallback(() => {
    const sampleCustomers: TableNodeType = {
      id: 'sample-customers',
      type: 'table',
      position: { x: 100, y: 150 },
      data: {
        label: 'Customers.csv',
        displayLabel: 'Sample Customers',
        iconColor: '#3b82f6',
        columns: [
          { id: 'sc1', name: 'customer_id', type: 'number', isKey: true },
          { id: 'sc2', name: 'full_name', type: 'text' },
          { id: 'sc3', name: 'email', type: 'text' },
          { id: 'sc4', name: 'phone', type: 'text' },
          { id: 'sc5', name: 'address', type: 'text' },
          { id: 'sc6', name: 'city', type: 'text' },
          { id: 'sc7', name: 'state', type: 'text' },
          { id: 'sc8', name: 'zip_code', type: 'text' },
          { id: 'sc9', name: 'country', type: 'text' },
          { id: 'sc10', name: 'company', type: 'text' },
          { id: 'sc11', name: 'job_title', type: 'text' },
          { id: 'sc12', name: 'signup_date', type: 'date' },
          { id: 'sc13', name: 'last_login', type: 'date' },
          { id: 'sc14', name: 'status', type: 'text' },
          { id: 'sc15', name: 'tier', type: 'text' }
        ],
        rawData: SAMPLE_CUSTOMERS_DATA
      }
    };

    const sampleOrders: TableNodeType = {
      id: 'sample-orders',
      type: 'table',
      position: { x: 550, y: 150 },
      data: {
        label: 'Orders.xlsx',
        displayLabel: 'Sample Orders',
        iconColor: '#22c55e',
        columns: [
          { id: 'so1', name: 'order_id', type: 'number', isKey: true },
          { id: 'so2', name: 'customer_id', type: 'number', isKey: true },
          { id: 'so3', name: 'product_name', type: 'text' },
          { id: 'so4', name: 'category', type: 'text' },
          { id: 'so5', name: 'quantity', type: 'number' },
          { id: 'so6', name: 'unit_price', type: 'number' },
          { id: 'so7', name: 'amount', type: 'number' },
          { id: 'so8', name: 'discount', type: 'number' },
          { id: 'so9', name: 'tax', type: 'number' },
          { id: 'so10', name: 'shipping', type: 'number' },
          { id: 'so11', name: 'payment_method', type: 'text' },
          { id: 'so12', name: 'shipping_address', type: 'text' },
          { id: 'so13', name: 'order_date', type: 'date' },
          { id: 'so14', name: 'ship_date', type: 'date' },
          { id: 'so15', name: 'status', type: 'text' }
        ],
        rawData: SAMPLE_ORDERS_DATA
      }
    };

    const sampleEdge: Edge = {
      id: 'sample-edge',
      type: 'cardinality',
      source: 'sample-customers',
      sourceHandle: 'sc1-source',
      target: 'sample-orders',
      targetHandle: 'so2-target',
      animated: true,
      style: { stroke: '#6366f1', strokeWidth: 2 },
      data: { cardinalityType: 'one-to-many', joinType: 'left' }
    };

    setNodes([sampleCustomers, sampleOrders]);
    setEdges([sampleEdge]);
    
    toast({
      title: 'Sample Data Loaded',
      description: 'Customers and Orders tables are now on your canvas'
    });
  }, [setNodes, setEdges, toast]);

  // Handle welcome modal close
  const handleWelcomeClose = useCallback(() => {
    setIsWelcomeModalOpen(false);
  }, []);

  // Handle start with blank canvas
  const handleStartBlank = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setCurrentProjectId(null);
    setCurrentProjectName('');
  }, [setNodes, setEdges]);

  // Start tutorial
  const handleStartTutorial = useCallback(() => {
    setIsWelcomeModalOpen(false);
    // Small delay before showing tutorial
    setTimeout(() => {
      setIsTutorialOpen(true);
    }, 300);
  }, []);

  // Tutorial completion
  const handleTutorialComplete = useCallback(() => {
    setIsTutorialOpen(false);
    toast({
      title: 'Tutorial Complete!',
      description: 'You\'re ready to start building. Happy linking!'
    });
  }, [toast]);

  // Replay tutorial (called from Help menu)
  const handleReplayTutorial = useCallback(() => {
    loadSampleData();
    setTimeout(() => {
      setIsTutorialOpen(true);
    }, 300);
  }, [loadSampleData]);

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    type: MenuType;
    position: { x: number; y: number };
    targetId?: string;
  } | null>(null);
  
  const [addButtonHovered, setAddButtonHovered] = useState(false);


  const handleUpdateColumnType = useCallback((tableId: string, columnId: string, newType: DataType) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === tableId) {
          return {
            ...node,
            data: {
              ...node.data,
              columns: node.data.columns.map((col) => 
                col.id === columnId ? { ...col, type: newType } : col
              ),
            },
          };
        }
        return node;
      })
    );
    
    if (selectedNode && selectedNode.id === tableId) {
        setSelectedNode(prev => prev ? {
            ...prev,
            data: {
                ...prev.data,
                columns: prev.data.columns.map((col) => 
                    col.id === columnId ? { ...col, type: newType } : col
                )
            }
        } : null);
    }

    toast({
        title: "Data Type Updated",
        description: `Column type changed to ${newType}`,
    });
  }, [selectedNode, setNodes, toast]);

  const handleToggleKey = useCallback((tableId: string, columnId: string) => {
    // Find current key state from nodes (functional update ensures we get latest state)
    setNodes((nds) => {
      // Look up current key state from actual nodes
      const targetNode = nds.find(n => n.id === tableId);
      const targetCol = targetNode?.data.columns.find(c => c.id === columnId);
      const currentIsKey = targetCol?.isKey ?? false;
      const nextIsKey = !currentIsKey;
      
      // Also update selectedNode to keep modal in sync (using same computed value)
      if (selectedNode && selectedNode.id === tableId) {
          setSelectedNode(prev => {
              if (!prev) return null;
              return {
                  ...prev,
                  data: {
                      ...prev.data,
                      columns: prev.data.columns.map((col) => 
                          col.id === columnId ? { ...col, isKey: nextIsKey } : col
                      )
                  }
              };
          });
      }
      
      return nds.map((node) => {
        if (node.id === tableId) {
          return {
            ...node,
            data: {
              ...node.data,
              columns: node.data.columns.map((col) => 
                col.id === columnId ? { ...col, isKey: nextIsKey } : col
              ),
            },
          };
        }
        return node;
      });
    });
    
    toast({
        title: "Key Status Updated",
        description: "Field key status has been toggled.",
    });
  }, [selectedNode, setNodes, toast]);

  const handleRenameTable = useCallback((tableId: string, newDisplayName: string) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === tableId) {
          return {
            ...node,
            data: {
              ...node.data,
              displayLabel: newDisplayName,
            },
          };
        }
        return node;
      })
    );
    
    if (selectedNode && selectedNode.id === tableId) {
        setSelectedNode(prev => prev ? {
            ...prev,
            data: {
                ...prev.data,
                displayLabel: newDisplayName
            }
        } : null);
    }

    toast({
        title: "Table Renamed",
        description: `Display name set to "${newDisplayName}"`,
    });
  }, [selectedNode, setNodes, toast]);

  const handleRenameColumn = useCallback((tableId: string, columnId: string, newDisplayName: string) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === tableId) {
          return {
            ...node,
            data: {
              ...node.data,
              columns: node.data.columns.map((col) => 
                col.id === columnId ? { ...col, displayName: newDisplayName } : col
              ),
            },
          };
        }
        return node;
      })
    );
    
    if (selectedNode && selectedNode.id === tableId) {
        setSelectedNode(prev => prev ? {
            ...prev,
            data: {
                ...prev.data,
                columns: prev.data.columns.map((col) => 
                    col.id === columnId ? { ...col, displayName: newDisplayName } : col
                )
            }
        } : null);
    }

    toast({
        title: "Column Renamed",
        description: `Display name set to "${newDisplayName}"`,
    });
  }, [selectedNode, setNodes, toast]);

  const handleChangeIconColor = useCallback((tableId: string, color: string) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === tableId) {
          return {
            ...node,
            data: {
              ...node.data,
              iconColor: color,
            },
          };
        }
        return node;
      })
    );
    
    if (selectedNode && selectedNode.id === tableId) {
        setSelectedNode(prev => prev ? {
            ...prev,
            data: {
                ...prev.data,
                iconColor: color
            }
        } : null);
    }
  }, [selectedNode, setNodes]);

  const handleDeleteColumn = useCallback((tableId: string, columnId: string) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === tableId) {
          const updatedColumns = node.data.columns.filter((col) => col.id !== columnId);
          if (updatedColumns.length === 0) {
            toast({
              title: "Cannot Delete",
              description: "A table must have at least one column",
              variant: "destructive"
            });
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              columns: updatedColumns,
            },
          };
        }
        return node;
      })
    );
    
    // Remove any edges connected to this column
    setEdges((eds) => eds.filter((edge) => 
      !edge.sourceHandle?.includes(columnId) && !edge.targetHandle?.includes(columnId)
    ));
    
    if (selectedNode && selectedNode.id === tableId) {
      setSelectedNode(prev => prev ? {
        ...prev,
        data: {
          ...prev.data,
          columns: prev.data.columns.filter((col) => col.id !== columnId)
        }
      } : null);
    }

    toast({
      title: "Column Deleted",
    });
  }, [selectedNode, setNodes, setEdges, toast]);

  const handleDuplicateColumn = useCallback((tableId: string, columnId: string) => {
    let newColumns: Column[] | null = null;
    
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === tableId) {
          const sourceCol = node.data.columns.find((col) => col.id === columnId);
          if (!sourceCol) return node;
          
          const newColId = `${tableId}-${Date.now()}`;
          const newCol = {
            ...sourceCol,
            id: newColId,
            name: `${sourceCol.name}_copy`,
            displayName: sourceCol.displayName ? `${sourceCol.displayName} (copy)` : undefined,
            isKey: false,
          };
          
          const colIndex = node.data.columns.findIndex((col) => col.id === columnId);
          newColumns = [...node.data.columns];
          newColumns.splice(colIndex + 1, 0, newCol);
          
          return {
            ...node,
            data: {
              ...node.data,
              columns: newColumns,
            },
          };
        }
        return node;
      })
    );

    if (selectedNode && selectedNode.id === tableId && newColumns) {
      setSelectedNode(prev => prev ? {
        ...prev,
        data: {
          ...prev.data,
          columns: newColumns!
        }
      } : null);
    }

    toast({
      title: "Column Duplicated",
    });
  }, [selectedNode, setNodes, toast]);

  const handleMoveColumn = useCallback((tableId: string, columnId: string, direction: 'up' | 'down') => {
    let reorderedColumns: Column[] | null = null;
    
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === tableId) {
          const columns = [...node.data.columns];
          const colIndex = columns.findIndex((col) => col.id === columnId);
          
          if (colIndex === -1) return node;
          if (direction === 'up' && colIndex === 0) return node;
          if (direction === 'down' && colIndex === columns.length - 1) return node;
          
          const newIndex = direction === 'up' ? colIndex - 1 : colIndex + 1;
          const [col] = columns.splice(colIndex, 1);
          columns.splice(newIndex, 0, col);
          
          reorderedColumns = columns;
          
          return {
            ...node,
            data: {
              ...node.data,
              columns,
            },
          };
        }
        return node;
      })
    );
    
    if (selectedNode && selectedNode.id === tableId && reorderedColumns) {
      setSelectedNode(prev => prev ? {
        ...prev,
        data: {
          ...prev.data,
          columns: reorderedColumns!
        }
      } : null);
    }
  }, [selectedNode, setNodes]);

  // Handler for clicking on link icons - opens relationship modal for that edge
  const handleEdgeClickFromNode = useCallback((nodeId: string, colId: string, handleType: 'source' | 'target') => {
    // Find the edge that connects this column
    const edge = edges.find(e => {
      if (handleType === 'source') {
        return e.source === nodeId && e.sourceHandle === `${colId}-source`;
      } else {
        return e.target === nodeId && e.targetHandle === `${colId}-target`;
      }
    });
    
    if (edge) {
      setSelectedEdgeId(edge.id);
      setPendingConnection(null);
      setIsRelationshipModalOpen(true);
    }
  }, [edges]);

  useEffect(() => {
      setNodes((nds) => nds.map(n => ({
          ...n,
          data: {
              ...n.data,
              onTypeChange: (colId: string, newType: DataType) => handleUpdateColumnType(n.id, colId, newType),
              onToggleKey: (colId: string) => handleToggleKey(n.id, colId),
              onRenameTable: (newName: string) => handleRenameTable(n.id, newName),
              onRenameColumn: (colId: string, newName: string) => handleRenameColumn(n.id, colId, newName),
              onDeleteColumn: (colId: string) => handleDeleteColumn(n.id, colId),
              onDuplicateColumn: (colId: string) => handleDuplicateColumn(n.id, colId),
              onMoveColumn: (colId: string, direction: 'up' | 'down') => handleMoveColumn(n.id, colId, direction),
              onEdgeClick: (colId: string, handleType: 'source' | 'target') => handleEdgeClickFromNode(n.id, colId, handleType),
          }
      })));
  }, [handleEdgeClickFromNode]); 

  // View Builder stays closed by default - user opens it manually or via Run button

  const onConnect = useCallback(
    (params: Connection) => {
        // Prevent self-joins within the same table
        if (params.source === params.target) {
            toast({
                title: "Can't Connect to Itself",
                description: "A table cannot be linked to itself. Try connecting to a different table.",
                variant: "destructive"
            });
            return;
        }

        // Auto-make key on source and target columns if they aren't already keys
        const sourceHandle = params.sourceHandle;
        const targetHandle = params.targetHandle;
        let autoKeySet = false;
        
        if (sourceHandle && targetHandle) {
            const sourceColId = sourceHandle.replace('-source', '');
            const targetColId = targetHandle.replace('-target', '');
            
            setNodes((nds) => {
                const updatedNodes = nds.map((node) => {
                    if (node.id === params.source) {
                        const col = node.data.columns.find(c => c.id === sourceColId);
                        if (col && !col.isKey) {
                            autoKeySet = true;
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    columns: node.data.columns.map((c) => 
                                        c.id === sourceColId ? { ...c, isKey: true } : c
                                    ),
                                },
                            };
                        }
                    }
                    if (node.id === params.target) {
                        const col = node.data.columns.find(c => c.id === targetColId);
                        if (col && !col.isKey) {
                            autoKeySet = true;
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    columns: node.data.columns.map((c) => 
                                        c.id === targetColId ? { ...c, isKey: true } : c
                                    ),
                                },
                            };
                        }
                    }
                    return node;
                });
                return updatedNodes;
            });
            
            if (autoKeySet) {
                toast({
                    title: "Fields Marked as Keys",
                    description: "Connected fields have been automatically set as key fields.",
                });
            }
        }

        // Close edit modal if open to avoid stale state
        setIsEditModalOpen(false);
        setSelectedNode(null);

        setPendingConnection(params);
        setSelectedEdgeId(null);
        setIsRelationshipModalOpen(true);
    },
    [toast, setNodes],
  );

  const handleConfirmRelationship = (type: string, label: string, joinType?: string, sourceFieldId?: string, targetFieldId?: string) => {
     if (pendingConnection) {
        // Use the field IDs from the modal (which may be user-selected or defaulted)
        const finalConnection = {
            ...pendingConnection,
            sourceHandle: sourceFieldId ? `${sourceFieldId}-source` : pendingConnection.sourceHandle,
            targetHandle: targetFieldId ? `${targetFieldId}-target` : pendingConnection.targetHandle,
        };
        
        setEdges((eds) => addEdge({ 
            ...finalConnection, 
            type: 'cardinality',
            animated: true, 
            style: { stroke: '#6366f1', strokeWidth: 2 },
            data: { cardinalityType: type, joinType: joinType || 'left' }
        }, eds));
        
        toast({
            title: "Relationship Created",
            description: `Established ${label} connection`,
        });
        setPendingConnection(null);
     } else if (selectedEdgeId) {
        // Update existing edge with the selected field IDs
        setEdges((eds) => eds.map(e => {
            if (e.id === selectedEdgeId) {
                return {
                    ...e,
                    sourceHandle: sourceFieldId ? `${sourceFieldId}-source` : e.sourceHandle,
                    targetHandle: targetFieldId ? `${targetFieldId}-target` : e.targetHandle,
                    data: { 
                      ...e.data,
                      cardinalityType: type, 
                      joinType: joinType || 'left' 
                    }
                };
            }
            return e;
        }));
        toast({
            title: "Relationship Updated",
            description: `Connection type changed to ${label}`,
        });
        setSelectedEdgeId(null);
     }
     setIsRelationshipModalOpen(false);
  };

  const handleDeleteRelationship = () => {
      if (selectedEdgeId) {
          setEdges((eds) => eds.filter(e => e.id !== selectedEdgeId));
          toast({
              title: "Relationship Removed",
              description: "The connection has been deleted.",
              variant: "destructive"
          });
          setSelectedEdgeId(null);
          setIsRelationshipModalOpen(false);
      }
  };

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node as TableNodeType);
    setIsEditModalOpen(true);
  }, []);
  
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      // For editing existing edges, only set selectedEdgeId (not pendingConnection)
      // pendingConnection is for new connections only
      setPendingConnection(null);
      setSelectedEdgeId(edge.id);
      setIsRelationshipModalOpen(true);
  }, []);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
        isOpen: true,
        type: 'node',
        position: { x: event.clientX, y: event.clientY },
        targetId: node.id
    });
  }, []);

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenu({
        isOpen: true,
        type: 'edge',
        position: { x: event.clientX, y: event.clientY },
        targetId: edge.id
    });
  }, []);

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    if ('preventDefault' in event) event.preventDefault();
    const clientX = 'clientX' in event ? event.clientX : 0;
    const clientY = 'clientY' in event ? event.clientY : 0;
    
    setContextMenu({
        isOpen: true,
        type: 'pane',
        position: { x: clientX, y: clientY }
    });
  }, []);

  const handleMenuAction = (action: string) => {
      if (!contextMenu) return;
      const { targetId } = contextMenu;

      switch(action) {
          case 'delete':
              if (targetId) {
                  setNodes((nds) => nds.filter((n) => n.id !== targetId));
                  setEdges((eds) => eds.filter((e) => e.source !== targetId && e.target !== targetId));
                  toast({ title: "Table Deleted" });
              }
              break;
          case 'duplicate':
              if (targetId) {
                  const original = nodes.find(n => n.id === targetId);
                  if (original) {
                      const newId = (Math.random() * 10000).toString();
                      const newNode = {
                          ...original,
                          id: newId,
                          position: { x: original.position.x + 20, y: original.position.y + 20 },
                          data: { 
                              ...original.data, 
                              label: `${original.data.label} (Copy)`,
                              onTypeChange: (colId: string, newType: DataType) => handleUpdateColumnType(newId, colId, newType),
                              onToggleKey: (colId: string) => handleToggleKey(newId, colId)
                          }
                      };
                      setNodes(nds => [...nds, newNode]);
                      toast({ title: "Table Duplicated" });
                  }
              }
              break;
          case 'edit':
              if (targetId) {
                  const node = nodes.find(n => n.id === targetId);
                  if (node) {
                      setSelectedNode(node);
                      setIsEditModalOpen(true);
                  }
              }
              break;
          case 'edit_join':
            // Edit existing edge - only set selectedEdgeId (not pendingConnection)
            if (targetId) {
                const edge = edges.find(e => e.id === targetId);
                if (edge) {
                    setPendingConnection(null);
                    setSelectedEdgeId(edge.id);
                    setIsRelationshipModalOpen(true);
                }
            }
            break;
          case 'delete_edge':
              if (targetId) {
                  setEdges(eds => eds.filter(e => e.id !== targetId));
                  toast({ title: "Link Removed" });
              }
              break;
          case 'add_source':
              setIsAddModalOpen(true);
              break;
          case 'reset_view':
               toast({ title: "View Reset", description: "Viewport position reset" });
               break;
      }
      setContextMenu(null);
  };

  const handleAddTable = (table: ImportedTable, autoConnect?: FieldMatch[]) => {
    // `(nodes.length + 1)` collided as soon as anything was deleted — delete node 2 of
    // 3, add a table, and the new node reuses id "3". Every edge pointing at the old
    // "3" then silently attached to the wrong table.
    const newId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

    // The columns arrive fully formed from the parser, with ids the smart scan already
    // referenced — so there is no longer any mock-id remapping table to keep in sync.
    const columns = table.columns;

    const newNode: TableNodeType = {
      id: newId,
      type: 'table',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: {
        label: table.file.name,
        columns,
        // The actual file contents — without this the join engine has nothing to join.
        rawData: table.rows,
        onTypeChange: (colId: string, newType: DataType) => handleUpdateColumnType(newId, colId, newType),
        onToggleKey: (colId: string) => handleToggleKey(newId, colId)
      }
    };

    setNodes((nds) => [...nds, newNode]);

    const rowSummary = `${table.rows.length.toLocaleString()} row${table.rows.length === 1 ? '' : 's'}, ${columns.length} column${columns.length === 1 ? '' : 's'}`;

    if (autoConnect && autoConnect.length > 0) {
      const newEdges: Edge[] = autoConnect.map((match, index) => ({
        id: `auto-${newId}-${index}`,
        source: newId,
        sourceHandle: `${match.newColumnId}-source`,
        target: match.existingTableId,
        targetHandle: `${match.existingColumnId}-target`,
        type: 'cardinality',
        data: { joinType: 'left', cardinalityType: 'one-to-many' },
        animated: true,
        style: { stroke: '#a855f7', strokeWidth: 2 },
        label: 'Auto-linked'
      }));

      setEdges((eds) => [...eds, ...newEdges]);

      toast({
        title: "Table Added & Connected",
        description: `${table.file.name} — ${rowSummary}, with ${autoConnect.length} auto-link${autoConnect.length > 1 ? 's' : ''}.`,
      });
    } else {
      toast({
        title: "Table Added",
        description: `${table.file.name} — ${rowSummary}.`,
      });
    }

    // Truncation and skipped sheets are shown in the import dialog, but a toast keeps
    // the fact visible after the dialog closes.
    if (table.truncated) {
      toast({
        title: "Only part of this file was imported",
        description: `${table.file.name} has ${table.totalRows.toLocaleString()} rows; the first ${table.rows.length.toLocaleString()} were loaded.`,
        variant: "destructive",
      });
    }
  };

  const handleJoinTable = (sourceNode: TableNodeType, targetId: string, type: string) => {
      const targetNode = nodes.find(n => n.id === targetId);
      if (!targetNode) return;

      const newId = (nodes.length + 100).toString();
      const enrichedNode: TableNodeType = {
          id: newId,
          type: 'table',
          position: { x: sourceNode.position.x + 300, y: sourceNode.position.y + 50 },
          data: {
              label: `Enriched_${sourceNode.data.label.split('.')[0]}`,
              columns: [
                  ...sourceNode.data.columns,
                  ...targetNode.data.columns.map(c => ({...c, id: c.id + '_joined', name: `${c.name} (${targetNode.data.label.split('.')[0]})`}))
              ],
              onTypeChange: (colId: string, newType: DataType) => handleUpdateColumnType(newId, colId, newType),
              onToggleKey: (colId: string) => handleToggleKey(newId, colId)
          }
      };

      setNodes(nds => [...nds, enrichedNode]);

      const newEdge: Edge = {
          id: `e-${sourceNode.id}-${newId}`,
          source: sourceNode.id,
          target: newId,
          animated: true,
          style: { stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5,5' },
          label: `${type.toUpperCase()} JOIN`
      };

      setEdges(eds => [...eds, newEdge]);
  };

  // Session Management Functions
  const handleSaveSession = () => {
    setIsSaveModalOpen(true);
  };

  const handleLoadSession = () => {
    setIsOpenModalOpen(true);
  };

  const saveProjectToDatabase = async (name: string, description?: string) => {
    const snapshot = {
      project: {
        name,
        description,
        viewport: undefined,
        isTemplate: false,
      },
      tables: nodes.map(n => ({
        nodeId: n.id,
        name: n.data.label.replace(/\.[^/.]+$/, ""),
        displayName: n.data.displayLabel,
        fileName: n.data.label,
        positionX: Math.round(n.position.x),
        positionY: Math.round(n.position.y),
        iconColor: n.data.iconColor,
        rawData: n.data.rawData,
        columns: n.data.columns.map((col, idx) => ({
          columnId: col.id,
          name: col.name,
          displayName: col.displayName,
          dataType: col.type,
          isKey: col.isKey || false,
          columnOrder: idx,
        })),
      })),
      relationships: edges.map(e => ({
        edgeId: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        sourceColumnId: e.sourceHandle?.replace('-source', ''),
        targetColumnId: e.targetHandle?.replace('-target', ''),
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        relationshipType: (e.data?.cardinalityType as string) || 'one-to-many',
        joinType: (e.data?.joinType as string) || 'left',
        cardinalityType: (e.data?.cardinalityType as string) || 'one-to-many',
        label: e.label?.toString() || '',
      })),
    };

    try {
      let response;
      if (currentProjectId) {
        response = await apiFetch(`/api/projects/${currentProjectId}/snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
      } else {
        response = await apiFetch('/api/projects/from-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
      }

      if (response.ok) {
        const result = await response.json();
        const projectId = result.project?.id || result.id;
        setCurrentProjectId(projectId);
        setCurrentProjectName(name);
        toast({
          title: "Project Saved",
          description: `"${name}" has been saved successfully.`,
          className: "bg-emerald-600 text-white border-none"
        });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error("Save failed:", error);
      toast({
        title: "Save Failed",
        description: "Could not save project to database.",
        variant: "destructive"
      });
    }
  };

  const loadProjectFromDatabase = async (projectId: number) => {
    try {
      const response = await apiFetch(`/api/projects/${projectId}/full`);
      if (!response.ok) throw new Error('Failed to load project');

      const data = await response.json();
      
      const restoredNodes: TableNodeType[] = data.tables.map((t: any) => ({
        id: t.nodeId,
        type: 'table' as const,
        position: { x: t.positionX, y: t.positionY },
        data: {
          label: t.fileName,
          displayLabel: t.displayName,
          iconColor: t.iconColor,
          columns: t.columns
            .sort((a: any, b: any) => a.columnOrder - b.columnOrder)
            .map((c: any) => ({
              id: c.columnId,
              name: c.name,
              displayName: c.displayName,
              type: c.dataType as DataType,
              isKey: c.isKey === 1,
            })),
          rawData: t.rawData,
        },
      }));

      const tableIdToNodeId = new Map<number, string>();
      data.tables.forEach((t: any) => {
        tableIdToNodeId.set(t.id, t.nodeId);
      });

      const restoredEdges: Edge[] = data.relationships.map((r: any) => ({
        id: r.edgeId,
        type: 'cardinality',
        source: tableIdToNodeId.get(r.sourceTableId) || '',
        target: tableIdToNodeId.get(r.targetTableId) || '',
        sourceHandle: r.sourceHandle || `${r.sourceColumnId}-source`,
        targetHandle: r.targetHandle || `${r.targetColumnId}-target`,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        data: {
          cardinalityType: r.cardinalityType || r.relationshipType,
          joinType: r.joinType || 'left',
        },
        label: r.label,
      }));

      setNodes(restoredNodes);
      setEdges(restoredEdges);
      setCurrentProjectId(projectId);
      setCurrentProjectName(data.project.name);

      toast({
        title: "Project Loaded",
        description: `"${data.project.name}" restored successfully.`,
        className: "bg-emerald-600 text-white border-none"
      });
    } catch (error) {
      console.error("Load failed:", error);
      toast({
        title: "Load Failed",
        description: "Could not load project from database.",
        variant: "destructive"
      });
    }
  };

  const deleteProjectFromDatabase = async (projectId: number) => {
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
        setCurrentProjectName('');
      }
      toast({
        title: "Project Deleted",
        description: "Project has been removed.",
      });
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const exportProjectTemplate = () => {
    const template = {
      project: {
        name: currentProjectName || 'Exported Project',
        isTemplate: true,
      },
      tables: nodes.map(n => ({
        nodeId: n.id,
        name: n.data.label.replace(/\.[^/.]+$/, ""),
        displayName: n.data.displayLabel,
        fileName: n.data.label,
        positionX: Math.round(n.position.x),
        positionY: Math.round(n.position.y),
        iconColor: n.data.iconColor,
        rawData: n.data.rawData,
        columns: n.data.columns.map((col, idx) => ({
          columnId: col.id,
          name: col.name,
          displayName: col.displayName,
          dataType: col.type,
          isKey: col.isKey || false,
          columnOrder: idx,
        })),
      })),
      relationships: edges.map(e => ({
        edgeId: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        sourceColumnId: e.sourceHandle?.replace('-source', ''),
        targetColumnId: e.targetHandle?.replace('-target', ''),
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        relationshipType: (e.data?.cardinalityType as string) || 'one-to-many',
        joinType: (e.data?.joinType as string) || 'left',
        cardinalityType: (e.data?.cardinalityType as string) || 'one-to-many',
        label: e.label?.toString() || '',
      })),
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentProjectName || 'project').replace(/\s+/g, '_')}_template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Template Exported",
      description: "Project template downloaded as JSON.",
      className: "bg-emerald-600 text-white border-none"
    });
  };

  const importProjectTemplate = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const template = JSON.parse(content);

        if (!template.tables || !template.relationships) {
          throw new Error("Invalid template format");
        }

        const response = await apiFetch('/api/projects/import-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(template),
        });

        if (response.ok) {
          const project = await response.json();
          await loadProjectFromDatabase(project.id);
          toast({
            title: "Template Imported",
            description: `"${template.project?.name || 'Imported Project'}" loaded successfully.`,
            className: "bg-emerald-600 text-white border-none"
          });
        } else {
          throw new Error('Import failed');
        }
      } catch (error) {
        console.error("Import failed:", error);
        toast({
          title: "Import Failed",
          description: "Could not parse template file.",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const onSessionFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importProjectTemplate(file);
    }
    event.target.value = '';
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <TopBar 
        onSaveSession={handleSaveSession} 
        onLoadSession={handleLoadSession} 
        onRun={() => {
          setIsViewBuilderOpen(true);
          setRunTriggered(true);
        }}
        onAddSource={() => setIsAddModalOpen(true)}
        onClearCanvas={() => {
          setNodes([]);
          setEdges([]);
          setSelectedNode(null);
          toast({
            title: "Canvas Cleared",
            description: "All tables and connections have been removed.",
          });
        }}
        onOpenViewBuilder={() => setIsViewBuilderOpen(true)}
        onReplayTutorial={handleReplayTutorial}
        autoSaveStatus={{
          isSaving,
          lastSaved,
          hasUnsavedChanges,
          projectId: currentProjectId
        }}
      />
      <input 
        type="file" 
        ref={sessionInputRef} 
        className="hidden" 
        accept=".json" 
        onChange={onSessionFileSelected} 
      />
      
      <div className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 relative h-full">
            <FlowCanvas 
                nodes={nodesWithConnections} 
                edges={edges} 
                onNodesChange={onNodesChange} 
                onEdgesChange={onEdgesChange} 
                onConnect={onConnect} 
                onNodeClick={handleNodeClick}
                onNodeContextMenu={handleNodeContextMenu}
                onEdgeContextMenu={handleEdgeContextMenu}
                onEdgeClick={handleEdgeClick}
                onPaneContextMenu={handlePaneContextMenu}
                onPaneClick={collapseAllExpandedButtons}
                onNodeDrag={handleNodeDrag}
                onNodeDragStop={handleNodeDragStop}
            />
            
            {/* Floating Add Data Button - Condensed with hover expand (two-click on mobile) */}
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              className="absolute bottom-8 right-8 z-10"
              onMouseEnter={() => !isTouchDevice && setAddButtonHovered(true)}
              onMouseLeave={() => { 
                setAddButtonHovered(false); 
                if (!isTouchDevice) setAddButtonExpanded(false); 
              }}
            >
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isTouchDevice && !addButtonExpanded) {
                    setAddButtonExpanded(true);
                  } else {
                    setIsAddModalOpen(true);
                    setAddButtonExpanded(false);
                  }
                }}
                className={cn(
                  "flex items-center justify-center h-12 rounded-xl shadow-lg border transition-all duration-200 overflow-hidden gap-2",
                  "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm",
                  "border-zinc-200 dark:border-zinc-700",
                  "hover:shadow-xl hover:border-violet-500/30 hover:bg-white dark:hover:bg-zinc-800",
                  (addButtonHovered || addButtonExpanded) ? "px-4" : "px-3 w-12"
                )}
                whileTap={{ scale: 0.95 }}
                data-testid="button-add-source"
              >
                {/* Icon container with database + plus overlay */}
                <div className="relative flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5 text-violet-500" />
                  {/* Plus badge overlay */}
                  <div className="absolute -bottom-1 -right-1.5 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-violet-500 shadow-sm border border-white dark:border-zinc-900">
                    <Plus className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                </div>
                
                {/* Text - fades in on hover or expanded */}
                <AnimatePresence>
                  {(addButtonHovered || addButtonExpanded) && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap overflow-hidden"
                    >
                      Add Data
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>

            <div className="absolute bottom-8 left-8 pointer-events-none z-10">
                <AnimatePresence>
                    {nodes.length === 0 && (
                        <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 20, opacity: 0 }}
                            className="glass-card px-4 py-2 rounded-lg flex items-center gap-2 pointer-events-auto"
                        >
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Start by adding a data source</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>

        <JoinPreviewPanel 
            nodes={nodes}
            edges={edges}
            isOpen={isJoinPreviewOpen}
            onOpenChange={setIsJoinPreviewOpen}
        />
        
        <ViewBuilderPanel 
            isOpen={isViewBuilderOpen} 
            onToggle={() => setIsViewBuilderOpen(!isViewBuilderOpen)} 
            nodes={nodes}
            edges={edges}
            runTriggered={runTriggered}
            onRunComplete={() => setRunTriggered(false)}
            collapseRequest={collapseRequest}
        />
        
        <AddSourceModal 
            open={isAddModalOpen} 
            onOpenChange={setIsAddModalOpen} 
            onAddTable={handleAddTable}
            existingNodes={nodes as TableNodeType[]}
        />

        <TableEditModal
            open={isEditModalOpen}
            onOpenChange={setIsEditModalOpen}
            node={selectedNode}
            allNodes={nodes}
            onJoin={handleJoinTable}
            onUpdateColumnType={handleUpdateColumnType}
            onToggleKey={handleToggleKey}
            onRenameColumn={handleRenameColumn}
            onDuplicateColumn={handleDuplicateColumn}
            onMoveColumn={handleMoveColumn}
            onDeleteColumn={handleDeleteColumn}
            onChangeIconColor={handleChangeIconColor}
        />

        <RelationshipModal
            open={isRelationshipModalOpen}
            onOpenChange={setIsRelationshipModalOpen}
            onConfirm={handleConfirmRelationship}
            onDelete={selectedEdgeId ? handleDeleteRelationship : undefined}
            isEditing={!!selectedEdgeId}
            sourceLabel={(() => {
              if (pendingConnection) {
                return nodes.find(n => n.id === pendingConnection.source)?.data.label || 'Source';
              }
              if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                return edge ? nodes.find(n => n.id === edge.source)?.data.label || 'Source' : 'Source';
              }
              return 'Source';
            })()}
            targetLabel={(() => {
              if (pendingConnection) {
                return nodes.find(n => n.id === pendingConnection.target)?.data.label || 'Target';
              }
              if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                return edge ? nodes.find(n => n.id === edge.target)?.data.label || 'Target' : 'Target';
              }
              return 'Target';
            })()}
            sourceFieldName={(() => {
              let sourceHandle: string | undefined;
              let sourceNodeId: string | undefined;
              if (pendingConnection) {
                sourceHandle = pendingConnection.sourceHandle || undefined;
                sourceNodeId = pendingConnection.source;
              } else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                sourceHandle = edge?.sourceHandle || undefined;
                sourceNodeId = edge?.source;
              }
              if (!sourceHandle || !sourceNodeId) return undefined;
              const sourceNode = nodes.find(n => n.id === sourceNodeId);
              const sourceColId = sourceHandle.replace('-source', '');
              const col = sourceNode?.data.columns.find(c => c.id === sourceColId);
              return col?.displayName || col?.name;
            })()}
            targetFieldName={(() => {
              let targetHandle: string | undefined;
              let targetNodeId: string | undefined;
              if (pendingConnection) {
                targetHandle = pendingConnection.targetHandle || undefined;
                targetNodeId = pendingConnection.target;
              } else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                targetHandle = edge?.targetHandle || undefined;
                targetNodeId = edge?.target;
              }
              if (!targetHandle || !targetNodeId) return undefined;
              const targetNode = nodes.find(n => n.id === targetNodeId);
              const targetColId = targetHandle.replace('-target', '');
              const col = targetNode?.data.columns.find(c => c.id === targetColId);
              return col?.displayName || col?.name;
            })()}
            sourceKeyFields={(() => {
              let sourceNodeId: string | undefined;
              let currentColId: string | undefined;
              if (pendingConnection) {
                sourceNodeId = pendingConnection.source;
                currentColId = pendingConnection.sourceHandle?.replace('-source', '');
              } else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                sourceNodeId = edge?.source;
                currentColId = edge?.sourceHandle?.replace('-source', '');
              }
              if (!sourceNodeId) return [];
              const sourceNode = nodes.find(n => n.id === sourceNodeId);
              if (!sourceNode) return [];
              
              // Include all key columns plus the currently connected column (even if not a key)
              const keyFields = sourceNode.data.columns.filter(c => c.isKey).map(c => ({
                id: c.id,
                name: c.name,
                displayName: c.displayName
              }));
              
              // Add current column if not already in list
              if (currentColId && !keyFields.find(f => f.id === currentColId)) {
                const currentCol = sourceNode.data.columns.find(c => c.id === currentColId);
                if (currentCol) {
                  keyFields.unshift({ id: currentCol.id, name: currentCol.name, displayName: currentCol.displayName });
                }
              }
              
              return keyFields;
            })()}
            targetKeyFields={(() => {
              let targetNodeId: string | undefined;
              let currentColId: string | undefined;
              if (pendingConnection) {
                targetNodeId = pendingConnection.target;
                currentColId = pendingConnection.targetHandle?.replace('-target', '');
              } else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                targetNodeId = edge?.target;
                currentColId = edge?.targetHandle?.replace('-target', '');
              }
              if (!targetNodeId) return [];
              const targetNode = nodes.find(n => n.id === targetNodeId);
              if (!targetNode) return [];
              
              // Include all key columns plus the currently connected column (even if not a key)
              const keyFields = targetNode.data.columns.filter(c => c.isKey).map(c => ({
                id: c.id,
                name: c.name,
                displayName: c.displayName
              }));
              
              // Add current column if not already in list
              if (currentColId && !keyFields.find(f => f.id === currentColId)) {
                const currentCol = targetNode.data.columns.find(c => c.id === currentColId);
                if (currentCol) {
                  keyFields.unshift({ id: currentCol.id, name: currentCol.name, displayName: currentCol.displayName });
                }
              }
              
              return keyFields;
            })()}
            currentSourceFieldId={(() => {
              let sourceHandle: string | undefined;
              if (pendingConnection) sourceHandle = pendingConnection.sourceHandle || undefined;
              else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                sourceHandle = edge?.sourceHandle || undefined;
              }
              return sourceHandle?.replace('-source', '');
            })()}
            currentTargetFieldId={(() => {
              let targetHandle: string | undefined;
              if (pendingConnection) targetHandle = pendingConnection.targetHandle || undefined;
              else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                targetHandle = edge?.targetHandle || undefined;
              }
              return targetHandle?.replace('-target', '');
            })()}
            initialType={selectedEdgeId ? (edges.find(e => e.id === selectedEdgeId)?.data as any)?.cardinalityType : undefined}
            initialJoinType={selectedEdgeId ? (edges.find(e => e.id === selectedEdgeId)?.data as any)?.joinType : undefined}
            sourceColumnData={(() => {
              let sourceNodeId: string | undefined;
              let sourceHandle: string | undefined;
              
              if (pendingConnection) {
                sourceNodeId = pendingConnection.source;
                sourceHandle = pendingConnection.sourceHandle || undefined;
              } else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                if (edge) {
                  sourceNodeId = edge.source;
                  sourceHandle = edge.sourceHandle || undefined;
                }
              }
              
              if (!sourceNodeId || !sourceHandle) return undefined;
              const sourceNode = nodes.find(n => n.id === sourceNodeId);
              const sourceColId = sourceHandle.replace('-source', '');
              const rawData = (sourceNode?.data as any)?.rawData;
              if (!sourceNode || !rawData) return undefined;
              const col = sourceNode.data.columns.find(c => c.id === sourceColId);
              if (!col) return undefined;
              return rawData.map((row: any) => row[col.name]);
            })()}
            targetColumnData={(() => {
              let targetNodeId: string | undefined;
              let targetHandle: string | undefined;
              
              if (pendingConnection) {
                targetNodeId = pendingConnection.target;
                targetHandle = pendingConnection.targetHandle || undefined;
              } else if (selectedEdgeId) {
                const edge = edges.find(e => e.id === selectedEdgeId);
                if (edge) {
                  targetNodeId = edge.target;
                  targetHandle = edge.targetHandle || undefined;
                }
              }
              
              if (!targetNodeId || !targetHandle) return undefined;
              const targetNode = nodes.find(n => n.id === targetNodeId);
              const targetColId = targetHandle.replace('-target', '');
              const rawData = (targetNode?.data as any)?.rawData;
              if (!targetNode || !rawData) return undefined;
              const col = targetNode.data.columns.find(c => c.id === targetColId);
              if (!col) return undefined;
              return rawData.map((row: any) => row[col.name]);
            })()}
        />

        {contextMenu && contextMenu.isOpen && (
            <FlowContextMenu 
                type={contextMenu.type}
                position={contextMenu.position}
                onClose={() => setContextMenu(null)}
                onAction={handleMenuAction}
            />
        )}

        {/* Onboarding Components */}
        <WelcomeModal
          isOpen={isWelcomeModalOpen}
          onClose={handleWelcomeClose}
          onStartTutorial={handleStartTutorial}
          onLoadSampleData={loadSampleData}
          onStartBlank={handleStartBlank}
        />

        <TutorialOverlay
          isOpen={isTutorialOpen}
          onClose={() => setIsTutorialOpen(false)}
          onComplete={handleTutorialComplete}
        />

        <SaveProjectModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={saveProjectToDatabase}
          onExportTemplate={exportProjectTemplate}
          currentName={currentProjectName}
          isNewProject={!currentProjectId}
        />

        <OpenProjectModal
          isOpen={isOpenModalOpen}
          onClose={() => setIsOpenModalOpen(false)}
          onOpenProject={loadProjectFromDatabase}
          onDeleteProject={deleteProjectFromDatabase}
          onImportTemplate={importProjectTemplate}
        />
      </div>
    </div>
  );
}

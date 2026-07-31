import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Node, Edge } from '@xyflow/react';
import { TableNodeType } from '@/components/flow/TableNode';
import { apiFetch } from '@/lib/local-api';

interface AutoSaveOptions {
  projectId: number | null;
  nodes: TableNodeType[];
  edges: Edge[];
  debounceMs?: number;
  enabled?: boolean;
}

interface AutoSaveState {
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  /** Non-null when the last save attempt failed. The UI must surface this. */
  saveError: string | null;
}

export function useAutoSave({ 
  projectId, 
  nodes, 
  edges, 
  debounceMs = 2000, 
  enabled = true 
}: AutoSaveOptions): AutoSaveState {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const previousNodesRef = useRef<string>('');
  const previousEdgesRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  const serializeState = useCallback(() => {
    const nodesState = nodes.map(n => ({
      id: n.id,
      position: n.position,
      displayLabel: n.data.displayLabel,
      iconColor: n.data.iconColor,
      columns: n.data.columns.map(c => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName,
        type: c.type,
        isKey: c.isKey
      }))
    }));
    
    const edgesState = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      data: e.data
    }));
    
    return {
      nodes: JSON.stringify(nodesState),
      edges: JSON.stringify(edgesState)
    };
  }, [nodes, edges]);

  const saveToServer = useCallback(async () => {
    if (!projectId || !enabled) return;
    
    setIsSaving(true);
    try {
      const snapshot = {
        project: {
          name: '',
          description: '',
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

      const response = await apiFetch(`/api/projects/${projectId}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });

      if (response.ok) {
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        setSaveError(null);
        const { nodes: nodesStr, edges: edgesStr } = serializeState();
        previousNodesRef.current = nodesStr;
        previousEdgesRef.current = edgesStr;
      } else {
        // A failed autosave used to be a console.error and nothing else — the status
        // pill kept saying "Saved" while work silently stopped persisting.
        const detail = await response.json().catch(() => ({}));
        setSaveError(
          detail?.code === 'StorageQuotaError'
            ? 'Your browser is out of storage space, so this project is no longer being saved. Export it to a file to avoid losing work.'
            : (detail?.error ?? 'Auto-save failed.'),
        );
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveError('Auto-save failed. Your recent changes are not saved yet.');
    } finally {
      setIsSaving(false);
    }
  }, [projectId, nodes, edges, enabled, serializeState]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      const { nodes: nodesStr, edges: edgesStr } = serializeState();
      previousNodesRef.current = nodesStr;
      previousEdgesRef.current = edgesStr;
      return;
    }

    if (!projectId || !enabled || nodes.length === 0) return;

    const { nodes: currentNodesStr, edges: currentEdgesStr } = serializeState();
    
    const nodesChanged = currentNodesStr !== previousNodesRef.current;
    const edgesChanged = currentEdgesStr !== previousEdgesRef.current;
    
    if (nodesChanged || edgesChanged) {
      setHasUnsavedChanges(true);
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveToServer();
      }, debounceMs);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, projectId, enabled, debounceMs, serializeState, saveToServer]);

  useEffect(() => {
    isFirstRender.current = true;
    setHasUnsavedChanges(false);
    setLastSaved(null);
    setSaveError(null);
    previousNodesRef.current = '';
    previousEdgesRef.current = '';
  }, [projectId]);

  return { isSaving, lastSaved, hasUnsavedChanges, saveError };
}

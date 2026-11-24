import React, { useState, useEffect, useRef } from 'react';
import { Workspace, Wire, LogicNode, Prefab, Camera, CustomICDef } from './types';
import { CustomICEditor } from './components/CustomICEditor';
import { getStarterWorkspace, getRegisterFileWorkspace, getMemoryMappedWorkspace } from './utils/starterDemo';
import { resolveCircuitSimulation, createNode } from './utils/logicSolver';
import { Sidebar } from './components/Sidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { LogicCanvas } from './components/LogicCanvas';
import { COLOR_PALETTES, ColorPalette } from './utils/themes';
import { exportToLogicly } from './utils/logiclyExporter';
import {
  Cpu,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  RotateCw,
  FolderPlus,
  Edit2,
  X,
  Plus,
  Minus,
  Download,
  UploadCloud,
  FileDown,
  Trash2,
  Copy,
  Clipboard,
  Workflow,
  Package,
  MousePointer,
  RotateCw as RotateIcon,
  HelpCircle,
  FileCode,
  Sparkles,
  Settings
} from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

// Helper to recursively update any nested custom_ic definitions in an icDef to match the latest list
function syncNestedICs(ic: CustomICDef, allIcs: CustomICDef[]): CustomICDef {
  let changed = false;
  const nextNodes = ic.nodes.map((node) => {
    if (node.type === 'custom_ic' && node.customState?.icId) {
      const latestDef = allIcs.find((item) => item.id === node.customState.icId);
      if (latestDef) {
        const syncedChildDef = syncNestedICs(latestDef, allIcs);
        changed = true;
        return {
          ...node,
          customState: {
            ...node.customState,
            icDef: syncedChildDef,
            internalNodes: undefined,
            internalWires: undefined
          }
        };
      }
    }
    return node;
  });

  if (changed) {
    return {
      ...ic,
      nodes: nextNodes
    };
  }
  return ic;
}

export default function App() {
  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Workspaces orchestrator
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceIdx, setActiveWorkspaceIdx] = useState(0);

  // Active workspace local states
  const [nodes, setNodesState] = useState<LogicNode[]>([]);
  const [wires, setWiresState] = useState<Wire[]>([]);
  const [camera, setCamera] = useState<Camera>({ x: 80, y: 50, zoom: 0.95 });

  // Tooling selection state
  const [activeTool, setActiveTool] = useState<'select' | 'route'>('select');
  const [selection, setSelection] = useState<string[]>([]);
  const [copyBuffer, setCopyBuffer] = useState<{ nodes: any[]; wires: any[] } | null>(null);
  const [customPrefabs, setCustomPrefabs] = useState<Prefab[]>([]);
  const [customICs, setCustomICs] = useState<CustomICDef[]>(() => {
    const saved = localStorage.getItem('Dash_logic_custom_ics');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as CustomICDef[];
      return parsed.map((ic) => syncNestedICs(ic, parsed));
    } catch {
      return [];
    }
  });
  const [isICEditorOpen, setIsICEditorOpen] = useState(false);
  const [editingICId, setEditingICId] = useState<string | null>(null);

  // Simulation controls state
  const [simRunning, setSimRunning] = useState(true);
  const [simSpeedHz, setSimSpeedHz] = useState(2); // slow-mo 2Hz by default

  // Modals settings
  const [prefabModalOpen, setPrefabNameModalOpen] = useState(false);
  const [prefabNameInput, setPrefabNameInput] = useState('');
  const [wsRenameModalOpen, setWsRenameModalOpen] = useState(false);
  const [wsRenameInput, setWsRenameInput] = useState('');

  // Settings & Palettes
  const [activePaletteId, setActivePaletteId] = useState<string>(() => {
    return localStorage.getItem('Dash_logic_palette') || 'catppuccin';
  });
  const [optimizeHighSpeed, setOptimizeHighSpeed] = useState<boolean>(() => {
    return localStorage.getItem('Dash_logic_high_speed_opt') !== 'false';
  });
  const [fancyRouting, setFancyRouting] = useState<boolean>(() => {
    return localStorage.getItem('Dash_logic_fancy_routing') === 'true';
  });
  const [multiDragEnabled, setMultiDragEnabled] = useState<boolean>(() => {
    return localStorage.getItem('Dash_logic_multi_drag') !== 'false';
  });
  const [exportMode, setExportMode] = useState<'txt' | 'logicly'>(() => {
    return (localStorage.getItem('Dash_logic_export_mode') as 'txt' | 'logicly') || 'txt';
  });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const activePalette = COLOR_PALETTES.find(p => p.id === activePaletteId) || COLOR_PALETTES[0];

  const changePalette = (id: string) => {
    setActivePaletteId(id);
    localStorage.setItem('Dash_logic_palette', id);
    showToast(`Color palette switched to ${COLOR_PALETTES.find(p => p.id === id)?.name || id}.`, 'success');
  };

  const changeOptimizeHighSpeed = (val: boolean) => {
    setOptimizeHighSpeed(val);
    localStorage.setItem('Dash_logic_high_speed_opt', val ? 'true' : 'false');
    showToast(val ? 'High-speed optimizations enabled!' : 'High-speed optimizations disabled.', val ? 'success' : 'error');
  };

  const changeFancyRouting = (val: boolean) => {
    setFancyRouting(val);
    localStorage.setItem('Dash_logic_fancy_routing', val ? 'true' : 'false');
    showToast(val ? 'A* Fancy trace wire auto-routing enabled!' : 'Fancy wire auto-routing disabled.', 'success');
  };

  const changeMultiDragEnabled = (val: boolean) => {
    setMultiDragEnabled(val);
    localStorage.setItem('Dash_logic_multi_drag', val ? 'true' : 'false');
    showToast(val ? 'Auto-multi-drag auto-wiring suggestion enabled!' : 'Auto-multi-drag auto-wiring disabled.', 'success');
  };

  const changeExportMode = (val: 'txt' | 'logicly') => {
    setExportMode(val);
    localStorage.setItem('Dash_logic_export_mode', val);
    showToast(val === 'txt' ? 'Export format: Full Workspace State' : 'Export format: Logic.ly XML Schematic', 'success');
  };

  // Refs for high performance loop evaluation
  const nodesRef = useRef<LogicNode[]>([]);
  const wiresRef = useRef<Wire[]>([]);

  const setNodes = (val: React.SetStateAction<LogicNode[]>) => {
    setNodesState(prev => {
      const next = typeof val === 'function' ? (val as Function)(prev) : val;
      nodesRef.current = next;
      return next;
    });
  };

  const setWires = (val: React.SetStateAction<Wire[]>) => {
    setWiresState(prev => {
      const next = typeof val === 'function' ? (val as Function)(prev) : val;
      wiresRef.current = next;
      return next;
    });
  };
  const simRunningRef = useRef(true);
  const simSpeedHzRef = useRef(2);
  const simTicksRef = useRef(0);

  // Initialize workspaces on startup
  useEffect(() => {
    const mmioBus = getMemoryMappedWorkspace();
    const regFile = getRegisterFileWorkspace();
    const demoGate = getStarterWorkspace();

    const snapMmio = JSON.stringify({
      nodes: mmioBus.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: JSON.parse(JSON.stringify(n.customState))
      })),
      wires: mmioBus.wires,
      customPrefabs: []
    });
    mmioBus.undoStack = [snapMmio];

    const snapReg = JSON.stringify({
      nodes: regFile.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: JSON.parse(JSON.stringify(n.customState))
      })),
      wires: regFile.wires,
      customPrefabs: []
    });
    regFile.undoStack = [snapReg];

    const snapGate = JSON.stringify({
      nodes: demoGate.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: JSON.parse(JSON.stringify(n.customState))
      })),
      wires: demoGate.wires,
      customPrefabs: []
    });
    demoGate.undoStack = [snapGate];

    setWorkspaces([mmioBus, regFile, demoGate]);
    setNodes(mmioBus.nodes);
    setWires(mmioBus.wires);
    setCamera(mmioBus.camera);
  }, []);

  // Sync state with mutable refs for simulation loop
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    wiresRef.current = wires;
  }, [wires]);

  useEffect(() => {
    simRunningRef.current = simRunning;
  }, [simRunning]);

  useEffect(() => {
    simSpeedHzRef.current = simSpeedHz;
  }, [simSpeedHz]);

  // Global Keyboard Shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [workspaces, activeWorkspaceIdx]);

  // Main decoupled 60 FPS tick execution simulation runner
  useEffect(() => {
    let lastTime = performance.now();
    let tickAccumulator = 0;
    let animId: number;

    const loop = (currentTime: number) => {
      if (simRunningRef.current) {
        const deltaTime = currentTime - lastTime;
        const ticksPerMs = simSpeedHzRef.current / 1000;
        tickAccumulator += deltaTime * ticksPerMs;

        const maxAccumulator = Math.max(simSpeedHzRef.current, 60);
        if (tickAccumulator > maxAccumulator) {
          tickAccumulator = maxAccumulator;
        }

        let ticksThisFrame = Math.floor(tickAccumulator);
        tickAccumulator -= ticksThisFrame;

        // Cap performance limits
        if (ticksThisFrame > 20000) ticksThisFrame = 20000;

        if (ticksThisFrame > 0) {
          const currentNodes = [...nodesRef.current];
          const currentWires = [...wiresRef.current];

          for (let i = 0; i < ticksThisFrame; i++) {
            simTicksRef.current++;
            // Circuit propagation resolver
            resolveCircuitSimulation(currentNodes, currentWires, simTicksRef.current);
          }

          // Trigger screen redraws without overwriting positions
          setNodesState((prev) => {
            const next = prev.map((pNode) => {
              const simNode = currentNodes.find((n) => n.id === pNode.id);
              if (simNode) {
                return {
                  ...pNode,
                  inputs: simNode.inputs,
                  outputs: simNode.outputs,
                  customState: {
                    ...pNode.customState,
                    ...simNode.customState
                  }
                };
              }
              return pNode;
            });
            nodesRef.current = next;
            return next;
          });
        }
      }

      lastTime = currentTime;
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Save current workspace state into undo snapshot histories
  const pushState = () => {
    if (workspaces.length === 0) return;
    const ws = workspaces[activeWorkspaceIdx];
    if (!ws) return;

    const snapshot = JSON.stringify({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: JSON.parse(JSON.stringify(n.customState || {}))
      })),
      wires,
      customPrefabs
    });

    if (ws.undoStack.length > 0 && ws.undoStack[ws.undoStack.length - 1] === snapshot) return;

    ws.undoStack.push(snapshot);
    if (ws.undoStack.length > 60) ws.undoStack.shift();
    ws.redoStack = []; // reset redo
  };

  const undo = () => {
    if (workspaces.length === 0) return;
    const ws = workspaces[activeWorkspaceIdx];
    if (!ws || ws.undoStack.length <= 1) {
      showToast('Nothing to undo.', 'error');
      return;
    }

    const current = ws.undoStack.pop()!;
    ws.redoStack.push(current);

    const prevStr = ws.undoStack[ws.undoStack.length - 1];
    const prev = JSON.parse(prevStr);

    const restoredNodes = prev.nodes.map((n: any) =>
      createNode(n.type, n.x, n.y, {
        id: n.id,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      })
    );

    setNodes(restoredNodes);
    setWires(prev.wires);
    if (prev.customPrefabs) setCustomPrefabs(prev.customPrefabs);
    setSelection([]);
    showToast('Undo performed.', 'success');
  };

  const redo = () => {
    if (workspaces.length === 0) return;
    const ws = workspaces[activeWorkspaceIdx];
    if (!ws || ws.redoStack.length === 0) {
      showToast('Nothing to redo.', 'error');
      return;
    }

    const nextStr = ws.redoStack.pop()!;
    ws.undoStack.push(nextStr);

    const next = JSON.parse(nextStr);
    const restoredNodes = next.nodes.map((n: any) =>
      createNode(n.type, n.x, n.y, {
        id: n.id,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      })
    );

    setNodes(restoredNodes);
    setWires(next.wires);
    if (next.customPrefabs) setCustomPrefabs(next.customPrefabs);
    setSelection([]);
    showToast('Redo performed.', 'success');
  };

  // Workspace swaps
  const handleSwitchWorkspace = (idx: number) => {
    // Save current active workspace parameters first
    const wsList = [...workspaces];
    wsList[activeWorkspaceIdx].nodes = nodes;
    wsList[activeWorkspaceIdx].wires = wires;
    wsList[activeWorkspaceIdx].camera = camera;

    setWorkspaces(wsList);
    setActiveWorkspaceIdx(idx);

    setNodes(wsList[idx].nodes);
    setWires(wsList[idx].wires);
    setCamera(wsList[idx].camera);
    setSelection([]);
  };

  const handleAddWorkspace = () => {
    const wsList = [...workspaces];
    // Save active prior
    if (wsList[activeWorkspaceIdx]) {
      wsList[activeWorkspaceIdx].nodes = nodes;
      wsList[activeWorkspaceIdx].wires = wires;
      wsList[activeWorkspaceIdx].camera = camera;
    }

    const newWs: Workspace = {
      id: 'ws_' + Math.random().toString(36).substring(2, 9),
      name: `Workspace ${wsList.length + 1}`,
      nodes: [],
      wires: [],
      camera: { x: 80, y: 50, zoom: 0.95 },
      undoStack: [],
      redoStack: []
    };

    const snap = JSON.stringify({
      nodes: [],
      wires: [],
      customPrefabs: []
    });
    newWs.undoStack = [snap];

    setWorkspaces([...wsList, newWs]);
    setActiveWorkspaceIdx(wsList.length);
    setNodes([]);
    setWires([]);
    setCamera(newWs.camera);
    setSelection([]);
    showToast('New board created successfully.', 'success');
  };

  const handleCloseWorkspace = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspaces.length === 1) return;

    const list = workspaces.filter((_, i) => i !== idx);
    let nextIdx = activeWorkspaceIdx;
    if (activeWorkspaceIdx >= list.length) {
      nextIdx = list.length - 1;
    } else if (activeWorkspaceIdx > idx) {
      nextIdx--;
    }

    setWorkspaces(list);
    setActiveWorkspaceIdx(nextIdx);

    setNodes(list[nextIdx].nodes);
    setWires(list[nextIdx].wires);
    setCamera(list[nextIdx].camera);
    setSelection([]);
    showToast('Workspace closed.', 'success');
  };

  const handleRenameWorkspaceSubmit = () => {
    const name = wsRenameInput.trim();
    if (name) {
      const list = [...workspaces];
      list[activeWorkspaceIdx].name = name;
      setWorkspaces(list);
      showToast('Workspace renamed.', 'success');
    }
    setWsRenameModalOpen(false);
  };

  // Clipboard managers
  const handleCopy = () => {
    if (selection.length === 0) {
      showToast('No components selected to copy.', 'error');
      return;
    }

    const selectedNodesObj = nodes.filter((n) => selection.includes(n.id));
    const nodeClones = selectedNodesObj.map((n) => ({
      id: n.id,
      type: n.type,
      x: n.x,
      y: n.y,
      label: n.label,
      inputsCount: n.inputsCount,
      customState: JSON.parse(JSON.stringify(n.customState || {}))
    }));

    const internalWires = wires.filter(
      (w) => selection.includes(w.from) && selection.includes(w.to)
    );

    setCopyBuffer({
      nodes: nodeClones,
      wires: internalWires
    });

    showToast(`Copied ${selectedNodesObj.length} items.`, 'success');
  };

  const handlePaste = () => {
    if (!copyBuffer) {
      showToast('Clipboard empty.', 'error');
      return;
    }

    pushState();
    const idMap: Record<string, string> = {};
    const pastedNodeIds: string[] = [];

    const newNodes = copyBuffer.nodes.map((n) => {
      const newId = 'node_' + Math.random().toString(36).substring(2, 11);
      idMap[n.id] = newId;
      pastedNodeIds.push(newId);

      return createNode(n.type, n.x + 50, n.y + 50, {
        id: newId,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      });
    });

    const newWires = copyBuffer.wires
      .map((w) => {
        const newFrom = idMap[w.from];
        const newTo = idMap[w.to];
        if (newFrom && newTo) {
          return {
            from: newFrom,
            fromPort: w.fromPort,
            to: newTo,
            toPort: w.toPort
          };
        }
        return null;
      })
      .filter((w) => w !== null) as Wire[];

    setNodes((prev) => [...prev, ...newNodes]);
    setWires((prev) => [...prev, ...newWires]);
    setSelection(pastedNodeIds);
    showToast(`Pasted ${newNodes.length} components.`, 'success');
  };

  const handleDelete = () => {
    if (selection.length === 0) return;
    pushState();

    setNodes((prev) => prev.filter((n) => !selection.includes(n.id)));
    setWires((prev) =>
      prev.filter((w) => !selection.includes(w.from) && !selection.includes(w.to))
    );
    setSelection([]);
    showToast('Deleted selection successfully.', 'success');
  };

  const handleClearAll = () => {
    pushState();
    setNodes([]);
    setWires([]);
    setSelection([]);
    showToast('Board layout cleared completely.', 'error');
  };

  // Rotating
  const handleRotate = () => {
    if (selection.length === 0) return;
    pushState();
    setNodes((prev) =>
      prev.map((n) => {
        if (selection.includes(n.id) && n.type !== 'junction') {
          const rot = ((n.customState?.rotation || 0) + 45) % 360;
          return {
            ...n,
            customState: { ...n.customState, rotation: rot }
          } as LogicNode;
        }
        return n;
      })
    );
  };

  // Prefab Packing
  const handleCreatePrefab = () => {
    const name = prefabNameInput.trim() || `Block Template ${customPrefabs.length + 1}`;
    const selectedNodesObj = nodes.filter((n) => selection.includes(n.id));

    if (selectedNodesObj.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    selectedNodesObj.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
    });

    const nodeClones = selectedNodesObj.map((n) => ({
      type: n.type,
      x: n.x - minX,
      y: n.y - minY,
      label: n.label,
      inputsCount: n.inputsCount,
      customState: JSON.parse(JSON.stringify(n.customState || {}))
    }));

    const internalWires: Array<{
      fromIndex: number;
      fromPort: number;
      toIndex: number;
      toPort: number;
    }> = [];

    wires.forEach((w) => {
      if (selection.includes(w.from) && selection.includes(w.to)) {
        const fromIdx = selectedNodesObj.findIndex((n) => n.id === w.from);
        const toIdx = selectedNodesObj.findIndex((n) => n.id === w.to);
        if (fromIdx !== -1 && toIdx !== -1) {
          internalWires.push({
            fromIndex: fromIdx,
            fromPort: w.fromPort,
            toIndex: toIdx,
            toPort: w.toPort
          });
        }
      }
    });

    const val: Prefab = {
      name,
      nodes: nodeClones,
      wires: internalWires
    };

    setCustomPrefabs((p) => [...p, val]);
    setPrefabNameModalOpen(false);
    showToast(`Custom IC Template "${name}" saved!`, 'success');
  };

  const handleSpawnPrefab = (idx: number) => {
    const prefab = customPrefabs[idx];
    if (!prefab) return;

    pushState();
    // Spawns in center focus coordinate views
    const cx = 350;
    const cy = 250;

    const idMap: Record<number, string> = {};
    const spawnedNodeIds: string[] = [];

    const newNodes = prefab.nodes.map((n, i) => {
      const newId = 'node_' + Math.random().toString(36).substring(2, 11);
      idMap[i] = newId;
      spawnedNodeIds.push(newId);

      return createNode(n.type, cx + n.x, cy + n.y, {
        id: newId,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      });
    });

    const newWires = prefab.wires.map((w) => ({
      from: idMap[w.fromIndex],
      fromPort: w.fromPort,
      to: idMap[w.toIndex],
      toPort: w.toPort
    }));

    setNodes((prev) => [...prev, ...newNodes]);
    setWires((prev) => [...prev, ...newWires]);
    setSelection(spawnedNodeIds);
    showToast(`Spawned custom template: "${prefab.name}"`, 'success');
  };

  const handleSaveIC = (icDef: CustomICDef) => {
    // Helper to recursively update nested custom IC definitions inside another IC definition
    const updateNestedICInDef = (targetDef: CustomICDef, updatedDef: CustomICDef): CustomICDef => {
      if (targetDef.id === updatedDef.id) {
        return updatedDef;
      }

      let changed = false;
      const nextNodes = targetDef.nodes.map((n) => {
        if (n.type === 'custom_ic' && n.customState?.icId === updatedDef.id) {
          changed = true;
          return {
            ...n,
            customState: {
              ...n.customState,
              icDef: updatedDef,
              internalNodes: undefined,
              internalWires: undefined
            }
          };
        } else if (n.type === 'custom_ic' && n.customState?.icDef) {
          const childDef = n.customState.icDef;
          const updatedChildDef = updateNestedICInDef(childDef, updatedDef);
          if (updatedChildDef !== childDef) {
            changed = true;
            return {
              ...n,
              customState: {
                ...n.customState,
                icDef: updatedChildDef,
                internalNodes: undefined,
                internalWires: undefined
              }
            };
          }
        }
        return n;
      });

      if (changed) {
        return {
          ...targetDef,
          nodes: nextNodes
        };
      }
      return targetDef;
    };

    // Helper to recursively update nested custom IC definitions inside an instantiated canvas LogicNode
    const updateNestedICInNode = (n: LogicNode, updatedDef: CustomICDef): LogicNode => {
      if (n.type !== 'custom_ic') {
        return n;
      }

      let changed = false;
      const nextCustomState = { ...n.customState };

      // 1. Direct match
      if (nextCustomState.icId === updatedDef.id) {
        changed = true;
        nextCustomState.icDef = updatedDef;
        nextCustomState.internalNodes = undefined;
        nextCustomState.internalWires = undefined;
        return createNode('custom_ic', n.x, n.y, {
          id: n.id,
          label: n.label,
          customState: nextCustomState
        });
      }

      // 2. Nested icDef inside customState
      if (nextCustomState.icDef) {
        const nextIcDef = updateNestedICInDef(nextCustomState.icDef, updatedDef);
        if (nextIcDef !== nextCustomState.icDef) {
          changed = true;
          nextCustomState.icDef = nextIcDef;
          nextCustomState.internalNodes = undefined;
          nextCustomState.internalWires = undefined;
        }
      }

      // 3. Nested internalNodes instances
      if (nextCustomState.internalNodes) {
        const nextInternalNodes = (nextCustomState.internalNodes as LogicNode[]).map((childNode) => {
          const updatedChildNode = updateNestedICInNode(childNode, updatedDef);
          if (updatedChildNode !== childNode) {
            changed = true;
          }
          return updatedChildNode;
        });
        if (changed) {
          nextCustomState.internalNodes = nextInternalNodes;
        }
      }

      if (changed) {
        return createNode('custom_ic', n.x, n.y, {
          id: n.id,
          label: n.label,
          customState: nextCustomState
        });
      }

      return n;
    };

    let isEdit = false;
    setCustomICs((prev) => {
      const exists = prev.some((ic) => ic.id === icDef.id);
      let next;
      if (exists) {
        isEdit = true;
        next = prev.map((ic) => (ic.id === icDef.id ? icDef : ic));
      } else {
        next = [...prev, icDef];
      }

      if (isEdit) {
        next = next.map((ic) => updateNestedICInDef(ic, icDef));
      }
      localStorage.setItem('Dash_logic_custom_ics', JSON.stringify(next));
      return next;
    });

    if (isEdit) {
      setWorkspaces((prevWs) =>
        prevWs.map((ws) => {
          const updatedNodes = ws.nodes.map((n) => updateNestedICInNode(n, icDef));
          return { ...ws, nodes: updatedNodes };
        })
      );

      setNodes((prevNodes) =>
        prevNodes.map((n) => updateNestedICInNode(n, icDef))
      );
    }

    setIsICEditorOpen(false);
    setEditingICId(null);
    showToast(
      isEdit
        ? `Custom IC "${icDef.name}" updated & hot-reloaded across all workspaces!`
        : `Custom IC "${icDef.name}" successfully registered!`,
      'success'
    );
  };

  const handleImportCustomICs = (imported: CustomICDef[]) => {
    setCustomICs((prev) => {
      const existingIds = new Set(prev.map((ic) => ic.id));
      const filtered = imported.filter((ic) => !existingIds.has(ic.id));
      if (filtered.length > 0) {
        const next = [...prev, ...filtered];
        localStorage.setItem('Dash_logic_custom_ics', JSON.stringify(next));
        return next;
      }
      return prev;
    });
  };

  const handleSpawnIC = (icDef: CustomICDef) => {
    pushState();
    const cx = 350;
    const cy = 250;
    const newNode = createNode('custom_ic', cx, cy, {
      customState: {
        icId: icDef.id,
        icDef
      }
    });
    setNodes((prev) => [...prev, newNode]);
    setSelection([newNode.id]);
    showToast(`Spawned "${icDef.name}" chip.`, 'success');
  };

  const handleEditIC = (id: string) => {
    setEditingICId(id);
    setIsICEditorOpen(true);
  };

  const handleDeleteIC = (id: string) => {
    setCustomICs((prev) => prev.filter((ic) => ic.id !== id));
    showToast('Custom IC definition deleted.', 'success');
  };

  // Export / Import App State
  const handleExportAppJSON = () => {
    // Save current indices first
    const list = [...workspaces];
    if (list[activeWorkspaceIdx]) {
      list[activeWorkspaceIdx].nodes = nodes;
      list[activeWorkspaceIdx].wires = wires;
      list[activeWorkspaceIdx].camera = camera;
    }

    if (exportMode === 'logicly') {
      try {
        const xmlContent = exportToLogicly(nodes, wires);
        const blob = new Blob([xmlContent], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DashLogic_Logicly_Export_${Date.now()}.logicly`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Successfully compiled and exported in Logic.ly format!', 'success');
      } catch (err: any) {
        console.error(err);
        showToast('Failed to compile nodes into Logic.ly format.', 'error');
      }
      return;
    }

    const data = {
      app: 'DashLogicSimulator',
      version: '1.7',
      workspaces: list.map((ws) => ({
        id: ws.id,
        name: ws.name,
        nodes: ws.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          x: n.x,
          y: n.y,
          label: n.label,
          inputsCount: n.inputsCount,
          customState: n.customState
        })),
        wires: ws.wires,
        camera: ws.camera
      })),
      customPrefabs,
      customICs
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DashLogic_FullSave_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Full workspace suite exported!', 'success');
  };

  const handleImportAppJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (fileEvent) => {
      try {
        const raw = JSON.parse(fileEvent.target?.result as string);
        if (raw.app !== 'DashLogicSimulator') {
          showToast('Invalid save file structure.', 'error');
          return;
        }

        const importedWorkspaces: Workspace[] = [];

        if (raw.workspaces) {
          raw.workspaces.forEach((ws: any) => {
            const listNodes = ws.nodes.map((n: any) =>
              createNode(n.type, n.x, n.y, {
                id: n.id,
                label: n.label,
                inputsCount: n.inputsCount,
                customState: n.customState
              })
            );

            const snap = JSON.stringify({
              nodes: listNodes.map((n: any) => ({
                id: n.id,
                type: n.type,
                x: n.x,
                y: n.y,
                label: n.label,
                inputsCount: n.inputsCount,
                customState: n.customState
              })),
              wires: ws.wires,
              customPrefabs: raw.customPrefabs || []
            });

            importedWorkspaces.push({
              id: ws.id,
              name: ws.name,
              nodes: listNodes,
              wires: ws.wires,
              camera: ws.camera || { x: 80, y: 50, zoom: 0.95 },
              undoStack: [snap],
              redoStack: []
            });
          });
        }

        if (importedWorkspaces.length > 0) {
          setWorkspaces(importedWorkspaces);
          setActiveWorkspaceIdx(0);
          setNodes(importedWorkspaces[0].nodes);
          setWires(importedWorkspaces[0].wires);
          setCamera(importedWorkspaces[0].camera);
          if (raw.customPrefabs) setCustomPrefabs(raw.customPrefabs);
          if (raw.customICs) setCustomICs(raw.customICs);
          setSelection([]);
          showToast('Wokspace archive imported!', 'success');
        }
      } catch (err: any) {
        showToast('Errors parsing file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="bg-[#11111b] text-[#cdd6f4] h-screen w-screen overflow-hidden flex flex-col font-sans select-none">
      
      {/* Toast Overlay alerts */}
      <div id="toast-container" className="fixed top-16 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`p-3 rounded-lg shadow-xl text-xs font-bold border flex items-center space-x-2 transition duration-300 transform animate-slide-in pointer-events-auto ${
              t.type === 'success'
                ? 'bg-[#1e2e21] text-emerald-400 border-emerald-900/50'
                : 'bg-[#2d1e25] text-rose-400 border-rose-900/50'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Primary Header actions list */}
      <header className="bg-[#181825] border-b border-[#313244] px-4 py-2 flex items-center justify-between z-10 shrink-0 select-none">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">DashLogic</h1>
            <p className="text-[10px] text-[#a6adc8] font-medium leading-none mt-0.5">
              Micro-Step Logic Gates &amp; High-Frequency CPU Simulator
            </p>
          </div>
        </div>

        {/* Action Controls Menu */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          {/* Active selection active tool */}
          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center space-x-1 border border-[#313244]">
            <button
              onClick={() => setActiveTool('select')}
              className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTool === 'select'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-[#cdd6f4] hover:bg-[#313244]'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" /> Select
            </button>
            <button
              onClick={() => {
                setActiveTool('route');
                showToast('Route Mode: Click a wire to reverse or branch.', 'success');
              }}
              className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTool === 'route'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-[#cdd6f4] hover:bg-[#313244]'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" /> Route
            </button>
          </div>

          {/* Running speed controls */}
          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center space-x-1 border border-[#313244]">
            <button
              onClick={() => setSimRunning(!simRunning)}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                simRunning
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
              }`}
            >
              {simRunning ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{simRunning ? 'Running' : 'Suspended'}</span>
            </button>

            <button
              onClick={() => {
                const wasOn = simRunning;
                setSimRunning(true);
                // Simple manual step tick
                const currentNodes = [...nodesRef.current];
                const currentWires = [...wiresRef.current];
                simTicksRef.current++;
                resolveCircuitSimulation(currentNodes, currentWires, simTicksRef.current);
                setNodes(currentNodes);
                setSimRunning(wasOn);
                showToast('Step completed.', 'success');
              }}
              title="Manual Trigger Step"
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-[1px] bg-[#313244] mx-1" />

            <div className="text-xs text-[#a6adc8] px-2 flex items-center gap-2">
              <span className="font-semibold text-[11px]">Speed:</span>
              <select
                value={simSpeedHz}
                onChange={(e) => setSimSpeedHz(parseInt(e.target.value))}
                className="bg-[#181825] border border-[#313244] rounded text-[#cdd6f4] text-xs px-1.5 py-0.5 focus:outline-none focus:border-indigo-600 font-bold"
              >
                <option value="2">2 Hz (Slow-Mo)</option>
                <option value="10">10 Hz</option>
                <option value="30">30 Hz</option>
                <option value="60">60 Hz (Realtime)</option>
                <option value="120">120 Hz</option>
                <option value="1000">1 kHz</option>
                <option value="5000">5 kHz</option>
                <option value="10000">10 kHz</option>
                <option value="50000">50 kHz</option>
                <option value="100000">100 kHz</option>
                <option value="500000">500 kHz</option>
                <option value="1000000">1 MHz (Max Speed)</option>
              </select>
            </div>
          </div>

          {/* History Operations */}
          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center space-x-1 border border-[#313244]">
            <button
              onClick={undo}
              title="Undo Action (Ctrl+Z)"
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo
            </button>
            <button
              onClick={redo}
              title="Redo Action (Ctrl+Y)"
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition flex items-center gap-1"
            >
              <RotateCw className="w-3.5 h-3.5" /> Redo
            </button>
          </div>

          {/* Copy-paste actions */}
          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center space-x-1 border border-[#313244]">
            <button
              onClick={() => {
                if (selection.length === 0) {
                  showToast('Please select elements first.', 'error');
                  return;
                }
                setPrefabNameInput('');
                setPrefabNameModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-violet-600 text-white hover:bg-violet-500 transition flex items-center gap-1"
              title="Pack selection into custom Templet / IC block"
            >
              <Package className="w-3.5 h-3.5" /> Create Prefab
            </button>

            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>

            <button
              onClick={handlePaste}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition flex items-center gap-1"
            >
              <Clipboard className="w-3.5 h-3.5" /> Paste
            </button>

            <button
              onClick={handleDelete}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-rose-950/40 text-rose-400 border border-rose-900/50 hover:bg-rose-900/40 transition flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>

            <button
              onClick={handleClearAll}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#f38ba8] hover:bg-red-950/20 transition"
            >
              Clear All
            </button>
          </div>

          {/* File Sync JSON saves */}
          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center space-x-1 border border-[#313244]">
            <button
              onClick={handleExportAppJSON}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export Session
            </button>
            <button
              onClick={() => document.getElementById('input-app-import-trigger')?.click()}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition flex items-center gap-1.5"
            >
              <UploadCloud className="w-3.5 h-3.5" /> Append File
            </button>
            <input
              type="file"
              id="input-app-import-trigger"
              className="hidden"
              accept=".txt"
              onChange={handleImportAppJSON}
            />
          </div>

          {/* Custom IC Maker Button */}
          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center border border-[#313244]">
            <button
              onClick={() => {
                setEditingICId(null);
                setIsICEditorOpen(true);
              }}
              className="px-3 py-1.5 rounded text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-[0_0_12px_rgba(225,29,72,0.2)]"
              title="Open Custom Integrated Circuit (IC) Maker & Editor"
            >
              <Cpu className="w-3.5 h-3.5 text-rose-200" />
              <span>Custom IC Maker</span>
            </button>
          </div>

          {/* Settings Menu Button */}
          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center border border-[#313244]">
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] hover:text-white transition flex items-center gap-1.5"
              title="Open Simulation & Canvas Theme Settings"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container screen areas split */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side toolbox catalog */}
        <Sidebar
          customPrefabs={customPrefabs}
          onSpawnPrefab={handleSpawnPrefab}
          customICs={customICs}
          onSpawnIC={handleSpawnIC}
          onEditIC={handleEditIC}
          onDeleteIC={handleDeleteIC}
        />

        {/* Center Grid Stage Area */}
        <main className="flex-1 relative overflow-hidden flex flex-col" style={{ backgroundColor: activePalette.bgColor }}>
          {/* Workspaces bar tabs */}
          <div
            id="workspace-tabs"
            className="w-full bg-[#181825] border-b border-[#313244] flex items-center shrink-0 overflow-x-auto h-8 px-2 space-x-1 z-20 shadow-md font-sans"
          >
            {workspaces.map((ws, idx) => {
              const isActive = idx === activeWorkspaceIdx;
              return (
                <div
                  key={ws.id}
                  onClick={() => handleSwitchWorkspace(idx)}
                  className={`flex items-center px-3 py-1 mt-1 rounded-t-md cursor-pointer text-[11px] font-bold select-none border-t border-l border-r transition ${
                    isActive
                      ? 'bg-[#1e1e2e] border-[#313244] text-[#cba6f7] pb-1.5 -mb-1 z-10'
                      : 'bg-[#11111b] border-transparent text-[#a6adc8] hover:text-white hover:bg-[#181825]'
                  }`}
                >
                  <span>{ws.name}</span>
                  {isActive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setWsRenameInput(ws.name);
                        setWsRenameModalOpen(true);
                      }}
                      className="ml-2.5 text-[#585b70] hover:text-[#cba6f7]"
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {workspaces.length > 1 && (
                    <button
                      onClick={(e) => handleCloseWorkspace(idx, e)}
                      className="ml-2 text-[#585b70] hover:text-rose-400 shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              onClick={handleAddWorkspace}
              className="px-2 py-1 text-[10px] text-[#a6adc8] hover:text-white hover:bg-[#313244] rounded transition"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Quick Overlay status bar overlay triggers */}
          <div className="absolute top-11 left-3 bg-[#11111b]/95 border border-[#313244] p-1.5 rounded-lg z-10 flex items-center space-x-3 shadow-2xl backdrop-blur select-none">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, 3.0) }))}
                className="bg-[#1e1e2e] hover:bg-[#313244] text-[#cdd6f4] p-1.5 rounded transition text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.max(prev.zoom / 1.2, 0.2) }))}
                className="bg-[#1e1e2e] hover:bg-[#313244] text-[#cdd6f4] p-1.5 rounded transition text-xs font-bold"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCamera((prev) => ({ ...prev, zoom: 1.0 }))}
                className="bg-[#1e1e2e] hover:bg-[#313244] text-[#cdd6f4] px-2 py-1 rounded transition text-xs font-semibold"
              >
                100%
              </button>
            </div>
            <div className="h-4 w-[1px] bg-[#313244]" />
            <div className="text-[11px] text-[#a6adc8] font-semibold">
              Zoom: {Math.round(camera.zoom * 100)}%
            </div>
            <div className="h-4 w-[1px] bg-[#313244]" />
            <div className="text-[11px] text-[#a6adc8] flex items-center gap-1 font-semibold">
              Drag Canvas to Pan (Middle Click / Drag Empty)
            </div>
          </div>

          {/* Short keyboard helper actions overlay */}
          <div className="absolute bottom-3 left-3 bg-[#11111b]/95 border border-[#313244] px-3 py-2 rounded-lg z-10 text-[11px] text-[#a6adc8] pointer-events-none shadow-xl flex flex-wrap gap-x-4 gap-y-1 max-w-[90%] font-medium">
            <div>
              <strong className="text-[#f9e2af]">Wire Split:</strong> Click hovered wire to insert Junction Dot
            </div>
            <div>
              <strong className="text-[#f9e2af]">Route Reverse:</strong> Active Route Tool (E) and click wire
            </div>
            <div>
              <strong className="text-[#a6e3a1]">Rotation:</strong> Select item(s) and press R key
            </div>
            <div>
              <strong className="text-white">Drawing:</strong> Drag output port hook dot directly to input port
            </div>
            <div>
              <strong className="text-white">Quick Select:</strong> Shift + Drag empty spaces
            </div>
          </div>

          {/* Core logic Canvas component */}
          <LogicCanvas
            nodes={nodes}
            setNodes={setNodes}
            wires={wires}
            setWires={setWires}
            camera={camera}
            setCamera={setCamera}
            selection={selection}
            setSelection={setSelection}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            simTicks={simTicksRef.current}
            pushState={pushState}
            showToast={showToast}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onDelete={handleDelete}
            onOpenPrefabModal={() => setPrefabNameModalOpen(true)}
            palette={activePalette}
            optimizeHighSpeed={optimizeHighSpeed}
            simSpeedHz={simSpeedHz}
            fancyRouting={fancyRouting}
            multiDragEnabled={multiDragEnabled}
            customICs={customICs}
          />
        </main>

        {/* Right Side Inspector Drawer */}
        <PropertiesPanel
          nodes={nodes}
          setNodes={setNodes}
          wires={wires}
          setWires={setWires}
          selection={selection}
          setSelection={setSelection}
          pushState={pushState}
          showToast={showToast}
          onRotate={handleRotate}
          onDelete={handleDelete}
        />
      </div>

      {/* Prefab save packaging custom prompt dialog modal */}
      {prefabModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#181825] border border-[#313244] p-5 rounded-xl shadow-2xl max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center space-x-2 text-violet-400">
              <Package className="w-5 h-5 text-violet-400" />
              <h3 className="font-bold text-white text-base">New Custom IC Premade</h3>
            </div>
            <p className="text-xs text-[#a6adc8] leading-relaxed">
              This will package up your highlighted gates and interlinking paths into a reusable block catalog.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#89b4fa]">Template Identifier Label</label>
              <input
                type="text"
                value={prefabNameInput}
                onChange={(e) => setPrefabNameInput(e.target.value)}
                className="w-full bg-[#1e1e2e] border border-[#313244] rounded p-2 text-xs text-[#cdd6f4] focus:outline-none focus:border-violet-500 font-semibold"
                placeholder="e.g. 4-bit Register ALU"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreatePrefab();
                }}
              />
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setPrefabNameModalOpen(false)}
                className="px-4 py-2 rounded bg-[#313244] text-[#cdd6f4] text-xs font-bold hover:bg-[#45475a] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePrefab}
                className="px-4 py-2 rounded bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition"
              >
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename tab board modal layout */}
      {wsRenameModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 border border-[#313244]">
          <div className="bg-[#181825] border border-[#313244] p-5 rounded-xl shadow-2xl max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center space-x-2 text-indigo-400">
              <Edit2 className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-white text-base">Rename Active Workspace</h3>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#89b4fa]">Tab Name</label>
              <input
                type="text"
                value={wsRenameInput}
                onChange={(e) => setWsRenameInput(e.target.value)}
                className="w-full bg-[#1e1e2e] border border-[#313244] rounded p-2 text-xs text-[#cdd6f4] focus:outline-none focus:border-indigo-500 font-semibold"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameWorkspaceSubmit();
                }}
              />
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setWsRenameModalOpen(false)}
                className="px-4 py-2 rounded bg-[#313244] text-[#cdd6f4] text-xs font-bold hover:bg-[#45475a] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameWorkspaceSubmit}
                className="px-4 py-2 rounded bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal Dialog */}
      {settingsModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
          <div className="bg-[#181825] border border-[#313244] p-6 rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto space-y-5 scrollbar-thin scrollbar-thumb-[#313244] scrollbar-track-transparent">
            <div className="flex items-center justify-between border-b border-[#313244] pb-4">
              <div className="flex items-center space-x-2 text-indigo-400">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">Simulator Settings</h3>
              </div>
              <button 
                onClick={() => setSettingsModalOpen(false)}
                className="text-[#a6adc8] hover:text-white p-1 rounded-lg hover:bg-[#313244] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Color Palettes Layout Selection */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-bold text-[#89b4fa] uppercase tracking-wider">Canvas Color Palette</h4>
                <p className="text-[11px] text-[#a6adc8] mt-0.5">Customize the color theme of the logic grid and trace lines.</p>
              </div>
              
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                {COLOR_PALETTES.map((pal) => {
                  const isSelected = pal.id === activePaletteId;
                  return (
                    <button
                      key={pal.id}
                      onClick={() => changePalette(pal.id)}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                        isSelected 
                          ? 'bg-[#1e1e2d] border-indigo-500 shadow-md ring-1 ring-indigo-500/20' 
                          : 'bg-[#1e1e2e]/50 border-[#313244] hover:bg-[#1e1e2e] hover:border-[#45475a]'
                      }`}
                    >
                      <span className="text-xs font-bold text-white mb-2">{pal.name}</span>
                      <div className="flex items-center space-x-1.5 self-stretch">
                        <div 
                          className="w-3.5 h-3.5 rounded-full border border-white/10" 
                          style={{ backgroundColor: pal.bgColor }}
                          title="Background"
                        />
                        <div 
                          className="w-3.5 h-3.5 rounded-full" 
                          style={{ backgroundColor: pal.wireHighColor }}
                          title="High Wire Signal"
                        />
                        <div 
                          className="w-3.5 h-3.5 rounded-full" 
                          style={{ backgroundColor: pal.wireLowColor }}
                          title="Low Wire Signal"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Performance High-Speed & Routing Toggles */}
            <div className="space-y-3 pt-3 border-t border-[#313244]">
              <h4 className="text-xs font-bold text-[#89b4fa] uppercase tracking-wider">Engine Performance &amp; Routing</h4>
              
              <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-xl bg-[#1e1e2e]/40 hover:bg-[#1e1e2e]/80 border border-[#313244] transition">
                <input
                  type="checkbox"
                  checked={optimizeHighSpeed}
                  onChange={(e) => changeOptimizeHighSpeed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#313244] bg-[#181825] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 focus:outline-none cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Optimize for High Hertz (&gt;120 Hz)</span>
                  </div>
                  <p className="text-[10px] text-[#a6adc8] mt-1 leading-relaxed">
                    Instantly optimizes rendering by suspending heavy grid dots, glowing canvas node drop shadows, and logic layout allocation pipelines during high-speed cycle runs.
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-xl bg-[#1e1e2e]/40 hover:bg-[#1e1e2e]/80 border border-[#313244] transition">
                <input
                  type="checkbox"
                  checked={fancyRouting}
                  onChange={(e) => changeFancyRouting(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#313244] bg-[#181825] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 focus:outline-none cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Workflow className="w-3 h-3 text-emerald-400" />
                    <span>A* Fancy Trace Routing (PCB Style)</span>
                  </div>
                  <p className="text-[10px] text-[#a6adc8] mt-1 leading-relaxed">
                    Utilizes an optimized A* shortest path routing algorithm to map schematic wires neatly around gates and other wiring paths, caching routes for butter-smooth rendering.
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-xl bg-[#1e1e2e]/40 hover:bg-[#1e1e2e]/80 border border-[#313244] transition">
                <input
                  type="checkbox"
                  checked={multiDragEnabled}
                  onChange={(e) => changeMultiDragEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#313244] bg-[#181825] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 focus:outline-none cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    <span>Auto-Multi-Drag Wire Suggestions</span>
                  </div>
                  <p className="text-[10px] text-[#a6adc8] mt-1 leading-relaxed">
                    Automatically detects parallel empty wiring paths (like 4, 8, or 16-bit data buses, gates, or ICs) and provides a fast one-click or press-Enter suggestion prompt to auto-connect them.
                  </p>
                </div>
              </label>

              <div className="p-3 rounded-xl bg-[#1e1e2e]/40 border border-[#313244] flex flex-col space-y-1.5">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Export File Mode</span>
                </div>
                <p className="text-[10px] text-[#a6adc8] leading-relaxed">
                  Choose formatting for session exports. The logic.ly option compiles unsupported cells (e.g. RAM cells) into equivalent basic logic gates.
                </p>
                <select
                  value={exportMode}
                  onChange={(e) => changeExportMode(e.target.value as 'txt' | 'logicly')}
                  className="w-full bg-[#181825] border border-[#313244] text-xs text-white rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 transition cursor-pointer font-medium"
                >
                  <option value="txt">Workspace State (.txt JSON)</option>
                  <option value="logicly">Logic.ly Native Format (.logicly XML)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#313244] text-[#cdd6f4] text-xs font-bold hover:bg-[#45475a] hover:text-white transition w-full shadow-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom IC Editor Modal/Overlay */}
      {isICEditorOpen && (
        <CustomICEditor
          initialICDef={editingICId ? customICs.find(ic => ic.id === editingICId) : undefined}
          workspaces={workspaces}
          customICs={customICs}
          onImportCustomICs={handleImportCustomICs}
          onSave={handleSaveIC}
          onCancel={() => {
            setIsICEditorOpen(false);
            setEditingICId(null);
          }}
          showToast={showToast}
          activePalette={activePalette}
          fancyRouting={fancyRouting}
        />
      )}

    </div>
  );
}

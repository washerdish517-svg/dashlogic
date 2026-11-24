import React, { useState, useEffect, useRef } from 'react';
import { LogicNode, Wire, Camera, CustomICDef, CustomICPin, Workspace } from '../types';
import { LogicCanvas } from './LogicCanvas';
import { createNode, resolveCircuitSimulation, updateDynamicGateHeight, recomputeDynamicBounds } from '../utils/logicSolver';
import { NodeArchetypes } from '../utils/nodeArchetypes';
import {
  ArrowLeft,
  Check,
  X,
  Cpu,
  MousePointer,
  Workflow,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  RotateCw,
  Plus,
  Sliders,
  HelpCircle,
  Clock,
  Settings,
  Trash2,
  Copy,
  ToggleRight,
  Radio,
  Lightbulb,
  Circle,
  Type,
  Database,
  Binary,
  Shuffle,
  Scale,
  Tv,
  Terminal,
  Package,
  Hash,
  FileDigit,
  LayoutGrid,
  Upload
} from 'lucide-react';

interface CustomICEditorProps {
  initialICDef?: CustomICDef; // undefined if making a new one
  workspaces: Workspace[];
  customICs: CustomICDef[];
  onImportCustomICs?: (imported: CustomICDef[]) => void;
  onSave: (icDef: CustomICDef) => void;
  onCancel: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  activePalette: any;
  fancyRouting: boolean;
}

export const CustomICEditor: React.FC<CustomICEditorProps> = ({
  initialICDef,
  workspaces,
  customICs,
  onImportCustomICs,
  onSave,
  onCancel,
  showToast,
  activePalette,
  fancyRouting
}) => {
  // IC Block Settings
  const [icName, setIcName] = useState(initialICDef?.name || 'My Custom IC');
  const [icColor, setIcColor] = useState(initialICDef?.color || '#2d3748');
  const [icWidth, setIcWidth] = useState(initialICDef?.width || 120);
  const [icHeight, setIcHeight] = useState(initialICDef?.height || 80);
  const [packageStyle, setPackageStyle] = useState<string>(initialICDef?.packageStyle || 'rectangle');
  const [ledPositions, setLedPositions] = useState<Record<string, { x: number; y: number }>>(initialICDef?.ledPositions || {});
  const [isShapeEditorOpen, setIsShapeEditorOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  // Canvas State
  const [nodes, setNodesState] = useState<LogicNode[]>([]);
  const [wires, setWiresState] = useState<Wire[]>([]);
  const [camera, setCamera] = useState<Camera>({ x: 100, y: 50, zoom: 0.95 });
  const [selection, setSelection] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<'select' | 'route'>('select');
  const [copyBuffer, setCopyBuffer] = useState<{ nodes: any[]; wires: any[] } | null>(null);

  // Simulation State
  const [simRunning, setSimRunning] = useState(true);
  const [simSpeedHz, setSimSpeedHz] = useState(60); // 60 Hz by default inside the editor

  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // Import selection
  const [selectedImportWsIdx, setSelectedImportWsIdx] = useState<number>(0);

  // Sync refs for decoupled simulation loop
  const nodesRef = useRef<LogicNode[]>([]);
  const wiresRef = useRef<Wire[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const simRunningRef = useRef(simRunning);
  const simSpeedHzRef = useRef(simSpeedHz);
  const simTicksRef = useRef(0);

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

  // Global Keyboard Shortcuts for Undo/Redo/Copy/Paste/Delete inside IC editor
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        handlePaste();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [undoStack, redoStack, selection, nodes, wires, copyBuffer]);

  // Initialize nodes and wires
  useEffect(() => {
    if (initialICDef) {
      // Load copies of nodes and wires
      const loadedNodes = (initialICDef.nodes || []).map((n: any) =>
        createNode(n.type, n.x, n.y, {
          id: n.id,
          label: n.label,
          inputsCount: n.inputsCount,
          customState: JSON.parse(JSON.stringify(n.customState || {}))
        })
      );
      setNodes(loadedNodes);
      setWires(JSON.parse(JSON.stringify(initialICDef.wires || [])));
    } else {
      // Fresh workspace
      setNodes([]);
      setWires([]);
    }
    pushStateDirect([], []);
  }, [initialICDef]);

  // Simulation Loop
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

        if (ticksThisFrame > 20000) ticksThisFrame = 20000;

        if (ticksThisFrame > 0) {
          const currentNodes = [...nodesRef.current];
          const currentWires = [...wiresRef.current];

          for (let i = 0; i < ticksThisFrame; i++) {
            simTicksRef.current++;
            resolveCircuitSimulation(currentNodes, currentWires, simTicksRef.current);
          }

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

  // History mechanics
  const pushState = () => {
    pushStateDirect(nodes, wires);
  };

  const pushStateDirect = (currentNodes: LogicNode[], currentWires: Wire[]) => {
    const snapStr = JSON.stringify({
      nodes: currentNodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      })),
      wires: currentWires
    });
    setUndoStack((prev) => [...prev, snapStr]);
    setRedoStack([]);
  };

  const undo = () => {
    if (undoStack.length <= 1) {
      showToast('Nothing to undo.', 'error');
      return;
    }
    const current = undoStack[undoStack.length - 1];
    const previous = undoStack[undoStack.length - 2];

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, current]);

    const parsed = JSON.parse(previous);
    const restoredNodes = parsed.nodes.map((n: any) =>
      createNode(n.type, n.x, n.y, {
        id: n.id,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      })
    );
    setNodes(restoredNodes);
    setWires(parsed.wires);
    setSelection([]);
    showToast('Undo performed inside IC editor.', 'success');
  };

  const redo = () => {
    if (redoStack.length === 0) {
      showToast('Nothing to redo.', 'error');
      return;
    }
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, next]);

    const parsed = JSON.parse(next);
    const restoredNodes = parsed.nodes.map((n: any) =>
      createNode(n.type, n.x, n.y, {
        id: n.id,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      })
    );
    setNodes(restoredNodes);
    setWires(parsed.wires);
    setSelection([]);
    showToast('Redo performed inside IC editor.', 'success');
  };

  // Add / Duplicate / Delete inside editor
  const handleAddPin = (type: 'ic_input_pin' | 'ic_output_pin') => {
    pushState();
    const isInput = type === 'ic_input_pin';
    const label = isInput ? `In${nodes.filter((n) => n.type === 'ic_input_pin').length + 1}` : `Out${nodes.filter((n) => n.type === 'ic_output_pin').length + 1}`;
    
    const newNode = createNode(type, 300, 200, {
      label,
      customState: {
        pinLabel: label,
        pinSide: isInput ? 'left' : 'right',
        pinOrder: nodes.filter((n) => n.type === type).length,
        value: false
      }
    });

    setNodes((prev) => [...prev, newNode]);
    setSelection([newNode.id]);
    showToast(`Added ${isInput ? 'Input' : 'Output'} boundary pin.`, 'success');
  };

  const handleDelete = () => {
    if (selection.length === 0) return;
    pushState();
    setNodes((prev) => prev.filter((n) => !selection.includes(n.id)));
    setWires((prev) => prev.filter((w) => !selection.includes(w.from) && !selection.includes(w.to)));
    setSelection([]);
    showToast('Selected elements deleted.', 'success');
  };

  const handleDuplicate = () => {
    if (selection.length !== 1) return;
    pushState();
    const sourceNode = nodes.find((n) => n.id === selection[0]);
    if (!sourceNode) return;

    const newId = 'node_' + Math.random().toString(36).substring(2, 11);
    const newNode = createNode(sourceNode.type, sourceNode.x + 40, sourceNode.y + 40, {
      id: newId,
      label: sourceNode.label,
      inputsCount: sourceNode.inputsCount,
      outputsCount: sourceNode.outputsCount,
      width: sourceNode.width,
      height: sourceNode.height,
      customState: JSON.parse(JSON.stringify(sourceNode.customState || {}))
    });

    if (sourceNode.type === 'ic_input_pin' || sourceNode.type === 'ic_output_pin') {
      const pinLabelCopy = (sourceNode.customState?.pinLabel || sourceNode.label) + '_copy';
      newNode.label = pinLabelCopy;
      newNode.customState.pinLabel = pinLabelCopy;
    }

    setNodes((p) => [...p, newNode]);
    setSelection([newNode.id]);
    showToast('Element duplicated.', 'success');
  };

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

      return createNode(n.type, n.x + 40, n.y + 40, {
        id: newId,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: JSON.parse(JSON.stringify(n.customState || {}))
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
      .filter((w): w is Wire => w !== null);

    setNodes((prev) => [...prev, ...newNodes]);
    setWires((prev) => [...prev, ...newWires]);
    setSelection(pastedNodeIds);
    showToast(`Pasted ${newNodes.length} items.`, 'success');
  };

  const handleRotate = () => {
    if (selection.length === 0) return;
    pushState();
    setNodes((prev) =>
      prev.map((n) => {
        if (selection.includes(n.id)) {
          const rot = ((n.customState?.rotation || 0) + 45) % 360;
          return {
            ...n,
            customState: { ...n.customState, rotation: rot }
          };
        }
        return n;
      })
    );
    showToast('Rotated component 45°', 'success');
  };

  const handleConvertInputsOutputsToPins = () => {
    pushState();
    let convertedIn = 0;
    let convertedOut = 0;
    setNodes((prev) =>
      prev.map((node) => {
        if (node.type === 'toggle' || node.type === 'pushbutton') {
          convertedIn++;
          const finalLabel = node.label && node.label !== 'Toggle Switch' && node.label !== 'Push Button' ? node.label : `In${convertedIn}`;
          return {
            ...node,
            type: 'ic_input_pin',
            label: finalLabel,
            inputs: [],
            outputs: [false],
            customState: {
              ...node.customState,
              pinLabel: finalLabel,
              pinSide: 'left',
              pinOrder: convertedIn - 1
            }
          };
        }
        if (node.type === 'lightbulb') {
          convertedOut++;
          const finalLabel = node.label && node.label !== 'LED Status Bulb' && node.label !== 'Light Bulb' ? node.label : `Out${convertedOut}`;
          return {
            ...node,
            type: 'ic_output_pin',
            label: finalLabel,
            inputs: [false],
            outputs: [],
            customState: {
              ...node.customState,
              pinLabel: finalLabel,
              pinSide: 'right',
              pinOrder: convertedOut - 1
            }
          };
        }
        return node;
      })
    );
    showToast(`Successfully converted ${convertedIn} Inputs and ${convertedOut} Outputs to external IC Pins!`, 'success');
  };

  // Import subcircuit
  const handleImportWorkspaceClick = () => {
    const ws = workspaces[selectedImportWsIdx];
    if (!ws) {
      showToast('Invalid workspace selected.', 'error');
      return;
    }
    if (ws.nodes.length === 0) {
      showToast('Selected workspace is empty.', 'error');
      return;
    }
    setShowImportConfirm(true);
  };

  const executeImportWorkspace = () => {
    const ws = workspaces[selectedImportWsIdx];
    if (!ws) return;
    pushState();

    // Copy nodes and wires with freshly generated IDs to prevent clashing with anything outside
    const idMap = new Map<string, string>();
    const importedNodes = ws.nodes.map((n) => {
      const newId = 'node_' + Math.random().toString(36).substring(2, 11);
      idMap.set(n.id, newId);
      return createNode(n.type, n.x, n.y, {
        id: newId,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: JSON.parse(JSON.stringify(n.customState || {}))
      });
    });

    const importedWires = ws.wires
      .map((w) => {
        const fromNew = idMap.get(w.from);
        const toNew = idMap.get(w.to);
        if (fromNew && toNew) {
          return {
            from: fromNew,
            fromPort: w.fromPort,
            to: toNew,
            toPort: w.toPort
          };
        }
        return null;
      })
      .filter((w): w is Wire => w !== null);

    setNodes(importedNodes);
    setWires(importedWires);
    setSelection([]);
    setShowImportConfirm(false);
    showToast(`Imported ${importedNodes.length} nodes from "${ws.name}" successfully!`, 'success');
  };

  // Upload/Import custom circuit save (.txt or .json) directly to the Custom IC Editor
  const handleUploadTxtCircuit = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        // Register any custom ICs globally
        if (raw.customICs && Array.isArray(raw.customICs) && onImportCustomICs) {
          onImportCustomICs(raw.customICs);
        }

        // Extract workspaces or nodes/wires
        let importedNodes: LogicNode[] = [];
        let importedWires: Wire[] = [];

        if (raw.workspaces && raw.workspaces.length > 0) {
          const ws = raw.workspaces[0];
          const idMap = new Map<string, string>();
          importedNodes = ws.nodes.map((n: any) => {
            const newId = 'node_' + Math.random().toString(36).substring(2, 11);
            idMap.set(n.id, newId);
            const customState = JSON.parse(JSON.stringify(n.customState || {}));
            if (n.type === 'custom_ic') {
              const icId = customState.icId;
              const icDef = raw.customICs?.find((ic: any) => ic.id === icId) || customICs?.find((ic: any) => ic.id === icId);
              if (icDef) {
                customState.icDef = icDef;
              }
            }
            return createNode(n.type, n.x, n.y, {
              id: newId,
              label: n.label,
              inputsCount: n.inputsCount,
              customState
            });
          });

          importedWires = ws.wires
            .map((w: any) => {
              const fromNew = idMap.get(w.from);
              const toNew = idMap.get(w.to);
              if (fromNew && toNew) {
                return {
                  from: fromNew,
                  fromPort: w.fromPort,
                  to: toNew,
                  toPort: w.toPort
                };
              }
              return null;
            })
            .filter((w: any): w is Wire => w !== null);
        } else if (raw.nodes) {
          const idMap = new Map<string, string>();
          importedNodes = raw.nodes.map((n: any) => {
            const newId = 'node_' + Math.random().toString(36).substring(2, 11);
            idMap.set(n.id, newId);
            const customState = JSON.parse(JSON.stringify(n.customState || {}));
            if (n.type === 'custom_ic') {
              const icId = customState.icId;
              const icDef = raw.customICs?.find((ic: any) => ic.id === icId) || customICs?.find((ic: any) => ic.id === icId);
              if (icDef) {
                customState.icDef = icDef;
              }
            }
            return createNode(n.type, n.x, n.y, {
              id: newId,
              label: n.label,
              inputsCount: n.inputsCount,
              customState
            });
          });

          importedWires = (raw.wires || [])
            .map((w: any) => {
              const fromNew = idMap.get(w.from);
              const toNew = idMap.get(w.to);
              if (fromNew && toNew) {
                return {
                  from: fromNew,
                  fromPort: w.fromPort,
                  to: toNew,
                  toPort: w.toPort
                };
              }
              return null;
            })
            .filter((w: any): w is Wire => w !== null);
        }

        if (importedNodes.length === 0) {
          showToast('No circuit components found in file.', 'error');
          return;
        }

        pushState();
        setNodes(importedNodes);
        setWires(importedWires);
        setSelection([]);
        showToast(`Imported ${importedNodes.length} nodes from file successfully!`, 'success');
      } catch (err: any) {
        showToast('Errors parsing file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Save the custom IC definition
  const handleSave = () => {
    const inputPinNodes = nodes.filter((n) => n.type === 'ic_input_pin');
    const outputPinNodes = nodes.filter((n) => n.type === 'ic_output_pin');

    if (inputPinNodes.length === 0 && outputPinNodes.length === 0) {
      showToast('An integrated circuit must contain at least one pin (input or output).', 'error');
      return;
    }

    // Check for empty or clashing labels
    const labelsSet = new Set<string>();
    let hasClash = false;
    let hasEmpty = false;

    const checkPin = (p: LogicNode) => {
      const lbl = (p.customState?.pinLabel || p.label || '').trim().toLowerCase();
      if (!lbl) {
        hasEmpty = true;
      }
      if (labelsSet.has(lbl)) {
        hasClash = true;
      }
      labelsSet.add(lbl);
    };

    inputPinNodes.forEach(checkPin);
    outputPinNodes.forEach(checkPin);

    if (hasEmpty) {
      showToast('All pins must have non-empty labels.', 'error');
      return;
    }
    if (hasClash) {
      showToast('Pin labels must be unique to prevent logical mapping clashes.', 'error');
      return;
    }

    // Map to pin definition arrays
    const inputPins: CustomICPin[] = inputPinNodes.map((n) => ({
      id: n.id,
      label: n.customState?.pinLabel || n.label || 'IN',
      side: n.customState?.pinSide || 'left',
      order: n.customState?.pinOrder || 0,
      internalNodeId: n.id
    }));

    const outputPins: CustomICPin[] = outputPinNodes.map((n) => ({
      id: n.id,
      label: n.customState?.pinLabel || n.label || 'OUT',
      side: n.customState?.pinSide || 'right',
      order: n.customState?.pinOrder || 0,
      internalNodeId: n.id
    }));

    // Create custom definition
    const def: CustomICDef = {
      id: initialICDef?.id || 'ic_' + Math.random().toString(36).substring(2, 11),
      name: icName.trim() || 'Custom IC',
      color: icColor,
      width: icWidth,
      height: icHeight,
      inputPins,
      outputPins,
      packageStyle,
      ledPositions,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        label: n.label,
        inputsCount: n.inputsCount,
        customState: n.customState
      })),
      wires
    };

    onSave(def);
  };

  // Property Changes for selected nodes
  const selectedNode = nodes.find((n) => n.id === selection[0]);

  const handlePinLabelChange = (val: string) => {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            label: val,
            customState: { ...n.customState, pinLabel: val }
          };
        }
        return n;
      })
    );
  };

  const handlePinSideChange = (val: 'left' | 'right' | 'top' | 'bottom') => {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            customState: { ...n.customState, pinSide: val }
          };
        }
        return n;
      })
    );
  };

  const handlePinOrderChange = (val: number) => {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            customState: { ...n.customState, pinOrder: val }
          };
        }
        return n;
      })
    );
  };

  const handlePinTestToggle = () => {
    if (!selectedNode || selectedNode.type !== 'ic_input_pin') return;
    pushState();
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === selectedNode.id) {
          const newVal = !n.customState?.value;
          // Set output to reflect in subcircuit
          const updated = {
            ...n,
            customState: { ...n.customState, value: newVal }
          };
          if (!updated.outputs || updated.outputs.length === 0) {
            updated.outputs = [newVal];
          } else {
            updated.outputs[0] = newVal;
          }
          return updated;
        }
        return n;
      })
    );
  };

  // RAM File I/O inside Custom IC Editor
  const handleRAMFileLoad = (file: File) => {
    if (!selectedNode) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      if (!e.target?.result || typeof e.target.result !== 'string') return;
      try {
        const rawLines = e.target.result.split(/\r\n|\r|\n/);
        const lines = rawLines
          .map((l) => l.trim().replace(/[^01]/g, ''))
          .filter((l) => l.length > 0);

        if (lines.length === 0) {
          showToast('The text file does not contain any valid binary sequences.', 'error');
          return;
        }

        pushState();

        const maxLineLen = Math.max(...lines.map((l) => l.length));
        const fileWordSize = Math.min(16, Math.max(1, maxLineLen));
        const fileLinesCount = lines.length;
        const fileAddrSize = Math.min(8, Math.max(1, Math.ceil(Math.log2(fileLinesCount))));

        const currentAddrSize = selectedNode.customState?.addressSize || 4;
        const currentWordSize = selectedNode.customState?.wordSize || 8;

        const finalAddrSize = Math.max(currentAddrSize, fileAddrSize);
        const finalWordSize = Math.max(currentWordSize, fileWordSize);

        const memory: Record<number, boolean[]> = {};

        lines.forEach((line, index) => {
          let paddedLine = line.padStart(finalWordSize, '0');
          if (paddedLine.length > finalWordSize) {
            paddedLine = paddedLine.substring(paddedLine.length - finalWordSize);
          }

          const rowBits: boolean[] = [];
          for (let i = finalWordSize - 1; i >= 0; i--) {
            rowBits.push(paddedLine[i] === '1');
          }
          memory[index] = rowBits;
        });

        selectedNode.customState = {
          ...selectedNode.customState,
          addressSize: finalAddrSize,
          wordSize: finalWordSize,
          memory
        };

        const tapped = selectedNode.customState?.tappedAddresses || [];
        selectedNode.inputsCount = finalAddrSize + finalWordSize + 2;
        selectedNode.outputsCount = finalWordSize + finalWordSize * tapped.length;
        recomputeDynamicBounds(selectedNode);

        setWires((prev) =>
          prev.filter(
            (w) =>
              !(
                (w.to === selectedNode.id && w.toPort >= selectedNode.inputsCount) ||
                (w.from === selectedNode.id && w.fromPort >= selectedNode.outputsCount)
              )
          )
        );

        setNodes((prev) =>
          prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
        );

        showToast(
          `Successfully loaded ${lines.length} memory registers. RAM auto-configured to ${finalWordSize}-bit words with ${finalAddrSize}-bit address bus.`,
          'success'
        );
      } catch (err: any) {
        showToast('Failed loading binary text file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleRAMFileDownload = () => {
    if (!selectedNode) return;
    const addrSize = selectedNode.customState?.addressSize || 4;
    const wordSize = selectedNode.customState?.wordSize || 8;
    const maxAddr = Math.pow(2, addrSize);

    const outLines: string[] = [];
    for (let i = 0; i < maxAddr; i++) {
      const rowBits =
        selectedNode.customState?.memory?.[i] || Array(wordSize).fill(false);
      const rowStr = [...rowBits]
        .reverse()
        .map((b) => (b ? '1' : '0'))
        .join('');
      outLines.push(rowStr);
    }

    const blob = new Blob([outLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RAM_Data_${maxAddr}x${wordSize}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('RAM data exported successfully.', 'success');
  };

  const handleRamZeroRegisterChange = (checked: boolean) => {
    if (!selectedNode) return;
    pushState();
    selectedNode.customState = {
      ...selectedNode.customState,
      zeroRegisterEnabled: checked
    };
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  const handleRamTappedAddressesChange = (val: string) => {
    if (!selectedNode) return;
    pushState();
    const parts = val.split(',').map((p) => p.trim()).filter((p) => p !== '');
    const tapped: number[] = [];
    const maxAddr = Math.pow(2, selectedNode.customState?.addressSize || 4) - 1;
    for (const p of parts) {
      const num = parseInt(p, 10);
      if (!isNaN(num) && num >= 0 && num <= maxAddr) {
        if (!tapped.includes(num)) {
          tapped.push(num);
        }
      }
    }

    selectedNode.customState = {
      ...selectedNode.customState,
      tappedAddressesRaw: val,
      tappedAddresses: tapped
    };

    const wordSize = selectedNode.customState?.wordSize || 8;
    selectedNode.outputsCount = wordSize + wordSize * tapped.length;
    recomputeDynamicBounds(selectedNode);

    setWires((prev) =>
      prev.filter((w) => !(w.from === selectedNode.id && w.fromPort >= selectedNode.outputsCount))
    );

    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  // Drag Start from sidebar
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, type: string, icId?: string) => {
    e.dataTransfer.setData('nodeType', type);
    if (icId) {
      e.dataTransfer.setData('icId', icId);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#07090e] z-50 flex flex-col text-slate-200 select-none animate-fade-in font-sans">
      {/* IC Editor Header */}
      <header className="bg-[#181825] border-b border-[#313244] px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Custom IC Maker
            </h1>
            <p className="text-[10px] text-[#a6adc8] font-medium leading-none mt-0.5">
              Model internal logic routing and place boundary contact pins
            </p>
          </div>
        </div>

        {/* Import tools */}
        <div className="flex items-center space-x-2 bg-[#1e1e2e] border border-[#313244] p-1 rounded-lg">
          <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5">
            Import:
          </span>
          <select
            value={selectedImportWsIdx}
            onChange={(e) => setSelectedImportWsIdx(parseInt(e.target.value))}
            className="bg-[#181825] border border-[#313244] text-xs px-2 py-1 rounded text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
          >
            {workspaces.map((ws, i) => (
              <option key={ws.id} value={i}>
                {ws.name} ({ws.nodes.length} nodes)
              </option>
            ))}
          </select>
          <button
            onClick={handleImportWorkspaceClick}
            className="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white px-2.5 py-1 text-xs font-bold rounded transition"
          >
            Import Circuit
          </button>

          <div className="w-[1px] h-4 bg-[#313244]" />

          <label className="bg-cyan-600/30 hover:bg-cyan-600 text-cyan-200 hover:text-white px-2.5 py-1 text-xs font-bold rounded transition cursor-pointer flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload .txt Save</span>
            <input
              type="file"
              accept=".txt,.json"
              onChange={handleUploadTxtCircuit}
              className="hidden"
            />
          </label>
        </div>

        {/* Action button triggers */}
        <div className="flex items-center space-x-2">
          {/* Sim Speed Toggle */}
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
                const currentNodes = [...nodesRef.current];
                const currentWires = [...wiresRef.current];
                simTicksRef.current++;
                resolveCircuitSimulation(currentNodes, currentWires, simTicksRef.current);
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
                setSimRunning(wasOn);
                showToast('Step completed.', 'success');
              }}
              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition"
              title="Manual Tick Step"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-[#1e1e2e] rounded-lg p-1 flex items-center space-x-1 border border-[#313244]">
            <button
              onClick={undo}
              title="Undo"
              className="px-2 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              title="Redo"
              className="px-2 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg shadow-md hover:shadow-cyan-500/20 transition flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Save IC Definition
          </button>
        </div>
      </header>

      {/* Editor Body Splitter */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left IC Editor Toolbox */}
        <aside className="w-80 bg-[#0a0c11] border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
          {/* IC Boundary Pin Placer */}
          <div className="p-3 border-b border-slate-800 bg-[#0f1118]/40">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2.5 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              IC Boundary Parts
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div
                onClick={() => handleAddPin('ic_input_pin')}
                className="group bg-[#0d0f14] p-3 rounded border border-slate-800 hover:border-rose-500 hover:shadow-[0_0_10px_rgba(243,139,168,0.15)] cursor-pointer transition flex flex-col items-center text-center"
              >
                <Plus className="w-5 h-5 text-[#cba6f7] group-hover:scale-105 transition" />
                <span className="text-[11px] font-bold mt-1 text-slate-200">IC Input Pin</span>
              </div>

              <div
                onClick={() => handleAddPin('ic_output_pin')}
                className="group bg-[#0d0f14] p-3 rounded border border-slate-800 hover:border-rose-500 hover:shadow-[0_0_10px_rgba(243,139,168,0.15)] cursor-pointer transition flex flex-col items-center text-center"
              >
                <Plus className="w-5 h-5 text-[#f38ba8] group-hover:scale-105 transition" />
                <span className="text-[11px] font-bold mt-1 text-slate-200">IC Output Pin</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex flex-col gap-2">
              <button
                onClick={() => setIsShapeEditorOpen(true)}
                className="w-full bg-[#11111b] hover:bg-cyan-600 border border-slate-850 hover:border-cyan-500 text-slate-300 hover:text-white py-2 px-3 rounded text-xs font-semibold transition flex items-center justify-center gap-2 shadow-inner"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                <span>Edit IC Shape &amp; Pin Sides</span>
              </button>

              <button
                onClick={handleConvertInputsOutputsToPins}
                className="w-full bg-[#11111b] hover:bg-emerald-600 border border-slate-850 hover:border-emerald-500 text-slate-300 hover:text-white py-2 px-3 rounded text-xs font-semibold transition flex items-center justify-center gap-2 shadow-inner"
                title="Convert all standard toggle inputs to IC Input Pins, and all lightbulb outputs to IC Output Pins."
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Convert Switches &amp; LEDs to Pins</span>
              </button>
            </div>
            <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">
              * Boundary pins map internal subcircuit logic values directly onto the external contact pads of your completed integrated circuit.
            </p>
          </div>

          {/* Interactive Inputs/Outputs list */}
          <div className="p-3 border-b border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <ToggleRight className="w-3.5 h-3.5 text-cyan-400" />
              Standard Inputs/Outputs
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div
                className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
                draggable
                onDragStart={(e) => handleDragStart(e, 'toggle')}
              >
                <ToggleRight className="w-5 h-5 text-[#a6e3a1]" />
                <span className="text-[10px] font-medium mt-1 text-slate-300">Switch Input</span>
              </div>
              <div
                className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
                draggable
                onDragStart={(e) => handleDragStart(e, 'pushbutton')}
              >
                <Radio className="w-5 h-5 text-[#f9e2af]" />
                <span className="text-[10px] font-medium mt-1 text-slate-300">Push Button</span>
              </div>
              <div
                className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
                draggable
                onDragStart={(e) => handleDragStart(e, 'lightbulb')}
              >
                <Lightbulb className="w-5 h-5 text-cyan-400" />
                <span className="text-[10px] font-medium mt-1 text-slate-300">LED Output</span>
              </div>
              <div
                className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
                draggable
                onDragStart={(e) => handleDragStart(e, 'clock')}
              >
                <Clock className="w-5 h-5 text-cyan-500" />
                <span className="text-[10px] font-medium mt-1 text-slate-300">System Clock</span>
              </div>
            </div>
          </div>

          {/* Logic Gates list */}
          <div className="p-3 border-b border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Logic Gates
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'and_gate', name: 'AND Gate' },
                { type: 'or_gate', name: 'OR Gate' },
                { type: 'not_gate', name: 'NOT Gate', count: '1-in' },
                { type: 'xor_gate', name: 'XOR Gate' },
                { type: 'nand_gate', name: 'NAND Gate' },
                { type: 'nor_gate', name: 'NOR Gate' },
                { type: 'xnor_gate', name: 'XNOR Gate', colSpan: true }
              ].map((g) => (
                <div
                  key={g.type}
                  className={`group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 cursor-grab active:cursor-grabbing transition flex items-center justify-between ${
                    g.colSpan ? 'col-span-2' : ''
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, g.type)}
                >
                  <span className="text-xs font-bold text-slate-300">{g.name}</span>
                  <span className="text-[9px] text-slate-400 bg-slate-800 px-1 py-0.5 rounded">
                    {g.count || '2-in'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Configurable Modules */}
          <div className="p-3 border-b border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-rose-400" />
              Advanced Modules
            </h3>
            <div className="space-y-1.5">
              {[
                { type: 'configurable_ram', name: 'Configurable RAM', icon: Database, color: 'text-rose-400' },
                { type: 'configurable_decoder', name: 'Binary Decoder', icon: Binary, color: 'text-sky-400' },
                { type: 'configurable_mux', name: 'Configurable MUX', icon: Shuffle, color: 'text-amber-500' },
                { type: 'comparator', name: '8-Bit Comparator', icon: Scale, color: 'text-indigo-400' }
              ].map((m) => (
                <div
                  key={m.type}
                  className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 cursor-grab active:cursor-grabbing transition flex items-center gap-2"
                  draggable
                  onDragStart={(e) => handleDragStart(e, m.type)}
                >
                  <m.icon className={`w-4 h-4 ${m.color}`} />
                  <span className="text-xs font-bold text-slate-300">{m.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Displays & Advanced ICs */}
          <div className="p-3 border-b border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              Displays &amp; Advanced ICs
            </h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {[
                { type: 'pixel_display', name: '256x256 GPU Screen', icon: Tv, color: 'text-cyan-400' },
                { type: 'ascii_display', name: 'ASCII Terminal Readout', icon: Terminal, color: 'text-emerald-400' },
                { type: 'prefab_8bit_dlatch', name: '8-Bit D-Latch Register', icon: Package, color: 'text-rose-400' },
                { type: 'prefab_8bit_cla', name: '8-Bit CLA Adder', icon: Cpu, color: 'text-sky-400' },
                { type: 'prefab_8bit_cla_sub', name: '8-Bit CLA Subtractor', icon: Cpu, color: 'text-indigo-400' },
                { type: 'prefab_8bit_mult', name: '8-Bit High-Speed Mult', icon: Cpu, color: 'text-[#eba0ac]' },
                { type: 'prefab_8bit_div', name: '8-Bit High-Speed Div', icon: Cpu, color: 'text-[#f5c2e7]' },
                { type: 'dec_to_bin', name: 'Decimal Numpad Input', icon: Hash, color: 'text-emerald-400' },
                { type: 'display_decimal', name: 'Binary to Dec Display', icon: FileDigit, color: 'text-fuchsia-400' },
                { type: 'seven_segment', name: '7-Segment Hex Display', icon: LayoutGrid, color: 'text-pink-400' }
              ].map((m) => (
                <div
                  key={m.type}
                  className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 cursor-grab active:cursor-grabbing transition flex items-center gap-2"
                  draggable
                  onDragStart={(e) => handleDragStart(e, m.type)}
                >
                  <m.icon className={`w-4 h-4 ${m.color}`} />
                  <span className="text-xs font-bold text-slate-300">{m.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Nested Custom ICs list */}
          <div className="p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Nested Custom ICs
            </h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {customICs.filter((ic) => ic.id !== initialICDef?.id).length === 0 ? (
                <div className="text-center py-4 text-[10px] text-slate-500 border border-dashed border-slate-800 rounded bg-[#0d0f14] leading-relaxed">
                  No other custom ICs created yet to nest.
                </div>
              ) : (
                customICs
                  .filter((ic) => ic.id !== initialICDef?.id)
                  .map((ic) => (
                    <div
                      key={ic.id}
                      className="flex items-center justify-between p-2 bg-[#0d0f14] hover:bg-[#1e1e2e] border border-slate-800 hover:border-rose-500 rounded transition group cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => {
                        handleDragStart(e, 'custom_ic', ic.id);
                      }}
                    >
                      <div className="flex items-center space-x-2 text-rose-300 w-full overflow-hidden">
                        <div
                          className="w-3.5 h-3.5 rounded-sm shrink-0 border border-[#45475a]/60 shadow-inner"
                          style={{ backgroundColor: ic.color || '#1e1e2e' }}
                        />
                        <div className="truncate flex flex-col">
                          <span className="text-xs font-bold text-white leading-tight truncate">
                            {ic.name}
                          </span>
                          <span className="text-[9px] text-[#a6adc8] leading-none mt-0.5 font-mono font-bold">
                            {ic.inputPins?.length || 0} In / {ic.outputPins?.length || 0} Out
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </aside>

        {/* Central Editor Canvas */}
        <main className="flex-1 relative overflow-hidden flex flex-col" style={{ backgroundColor: activePalette.bgColor }}>
          <div className="absolute top-3 left-3 bg-[#11111b]/95 border border-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-300 z-10 flex items-center gap-3 shadow-lg">
            <div className="flex items-center gap-1.5">
              <MousePointer className="w-3 h-3 text-cyan-400" /> Select (Q)
            </div>
            <div className="w-[1px] h-3 bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <Workflow className="w-3 h-3 text-cyan-400" /> Wire Routing (W)
            </div>
            <div className="w-[1px] h-3 bg-slate-800" />
            <div className="text-slate-500">
              Select items &amp; press R to rotate, Delete to remove.
            </div>
          </div>

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
            onOpenPrefabModal={() => {}}
            palette={activePalette}
            optimizeHighSpeed={false}
            simSpeedHz={simSpeedHz}
            fancyRouting={fancyRouting}
            multiDragEnabled={true}
            customICs={customICs}
          />
        </main>

        {/* Right IC Property Editor */}
        <aside className="w-80 bg-[#0a0c11] border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto">
          {selectedNode ? (
            /* Selected component config */
            <div className="p-4 space-y-5 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Selected Element
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {NodeArchetypes[selectedNode.type]?.name || 'Unknown'}
                  </div>
                </div>

                <hr className="border-slate-800" />

                {/* Pin labels / routing configuration */}
                {(selectedNode.type === 'ic_input_pin' || selectedNode.type === 'ic_output_pin') ? (
                  <div className="space-y-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                      Pin Contact Settings
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Pin Label / Port ID
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={selectedNode.customState?.pinLabel || selectedNode.label || ''}
                        onChange={(e) => handlePinLabelChange(e.target.value)}
                        className="w-full bg-[#0d0f14] border border-slate-850 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono font-bold"
                        placeholder="e.g. CLK"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Contact Placement Side
                      </label>
                      <select
                        value={selectedNode.customState?.pinSide || (selectedNode.type === 'ic_input_pin' ? 'left' : 'right')}
                        onChange={(e) => handlePinSideChange(e.target.value as any)}
                        className="w-full bg-[#0d0f14] border border-slate-850 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-bold"
                      >
                        <option value="left">Left Boundary</option>
                        <option value="right">Right Boundary</option>
                        <option value="top">Top Boundary</option>
                        <option value="bottom">Bottom Boundary</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Alignment Order Index
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={selectedNode.customState?.pinOrder || 0}
                        onChange={(e) => handlePinOrderChange(parseInt(e.target.value) || 0)}
                        className="w-full bg-[#0d0f14] border border-slate-850 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-bold"
                      />
                      <p className="text-[9px] text-slate-500 mt-1 leading-normal">
                        Order index determines sequential positioning along the boundary. Lower numbers sort to the top/left.
                      </p>
                    </div>

                    {selectedNode.type === 'ic_input_pin' && (
                      <div className="pt-2">
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                          Signal Testing Driver
                        </label>
                        <button
                          onClick={handlePinTestToggle}
                          className={`w-full py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            selectedNode.customState?.value
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Test Signal: {selectedNode.customState?.value ? 'HIGH (1)' : 'LOW (0)'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Editing normal selected logic node inside IC */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Node Label
                      </label>
                      <input
                        type="text"
                        value={selectedNode.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...n, label: val } : n)));
                        }}
                        className="w-full bg-[#0d0f14] border border-slate-850 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
                      />
                    </div>

                    {['and_gate', 'or_gate', 'xor_gate', 'nand_gate', 'nor_gate', 'xnor_gate'].includes(selectedNode.type) && (
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-400">
                          Gate Inputs (2-8)
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="2"
                            max="8"
                            value={selectedNode.inputsCount}
                            onChange={(e) => {
                              pushState();
                              const val = parseInt(e.target.value);
                              selectedNode.inputsCount = val;
                              updateDynamicGateHeight(selectedNode);
                              setWires((prev) => prev.filter((w) => !(w.to === selectedNode.id && w.toPort >= val)));
                              setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                            }}
                            className="flex-1 accent-cyan-500 h-1 bg-slate-800 rounded-lg"
                          />
                          <span className="bg-[#0d0f14] border px-2 py-0.5 rounded text-xs font-bold text-white w-8 text-center shrink-0">
                            {selectedNode.inputsCount}
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'clock' && (
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-400">
                          Clock Period (Ticks)
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="1"
                            max="60"
                            value={selectedNode.customState?.period || 5}
                            onChange={(e) => {
                              pushState();
                              const val = parseInt(e.target.value);
                              if (!selectedNode.customState) selectedNode.customState = {};
                              selectedNode.customState.period = val;
                              setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                            }}
                            className="flex-1 accent-cyan-500 h-1 bg-slate-800 rounded-lg"
                          />
                          <span className="bg-[#0d0f14] border px-2 py-0.5 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                            {selectedNode.customState?.period || 5} ticks
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'configurable_decoder' && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-400">
                          Input Selection Address Bits (1 to 8)
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="1"
                            max="8"
                            value={selectedNode.customState?.inputBits || 3}
                            onChange={(e) => {
                              pushState();
                              const val = parseInt(e.target.value);
                              if (!selectedNode.customState) selectedNode.customState = {};
                              selectedNode.customState.inputBits = val;
                              selectedNode.inputsCount = val;
                              selectedNode.outputsCount = Math.pow(2, val);
                              recomputeDynamicBounds(selectedNode);

                              setWires((prev) =>
                                prev.filter(
                                  (w) =>
                                    !(
                                      (w.to === selectedNode.id && w.toPort >= selectedNode.inputsCount) ||
                                      (w.from === selectedNode.id && w.fromPort >= selectedNode.outputsCount)
                                    )
                                )
                              );
                              setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                            }}
                            className="flex-1 accent-cyan-500 h-1 bg-slate-800 rounded-lg"
                          />
                          <span className="bg-[#0d0f14] border px-2 py-0.5 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                            {selectedNode.customState?.inputBits || 3} bits
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold">
                          Generates exactly {Math.pow(2, selectedNode.customState?.inputBits || 3)} output pins
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'configurable_mux' && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-400">
                          Decoder Address Selector Bits (1 to 4)
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="1"
                            max="4"
                            value={selectedNode.customState?.selectBits || 2}
                            onChange={(e) => {
                              pushState();
                              const val = parseInt(e.target.value);
                              const dataBits = Math.pow(2, val);
                              if (!selectedNode.customState) selectedNode.customState = {};
                              selectedNode.customState.selectBits = val;
                              selectedNode.inputsCount = dataBits + val;
                              selectedNode.outputsCount = 1;
                              recomputeDynamicBounds(selectedNode);

                              setWires((prev) =>
                                prev.filter((w) => !(w.to === selectedNode.id && w.toPort >= selectedNode.inputsCount))
                              );
                              setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                            }}
                            className="flex-1 accent-amber-500 h-1 bg-slate-800 rounded-lg"
                          />
                          <span className="bg-[#0d0f14] border px-2 py-0.5 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                            {selectedNode.customState?.selectBits || 2} bits
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold">
                          Routes exactly {Math.pow(2, selectedNode.customState?.selectBits || 2)} input channels
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'configurable_ram' && (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-400">
                            Address Bus Width (1 to 8 bits)
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="range"
                              min="1"
                              max="8"
                              value={selectedNode.customState?.addressSize || 4}
                              onChange={(e) => {
                                pushState();
                                const val = parseInt(e.target.value);
                                const wordSize = selectedNode.customState?.wordSize || 8;
                                const tapped = selectedNode.customState?.tappedAddresses || [];
                                if (!selectedNode.customState) selectedNode.customState = {};
                                selectedNode.customState.addressSize = val;
                                selectedNode.inputsCount = val + wordSize + 2;
                                selectedNode.outputsCount = wordSize + wordSize * tapped.length;
                                recomputeDynamicBounds(selectedNode);

                                setWires((prev) =>
                                  prev.filter((w) => !(w.to === selectedNode.id && w.toPort >= selectedNode.inputsCount))
                                );
                                setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                              }}
                              className="flex-1 accent-rose-500 h-1 bg-slate-800 rounded-lg"
                            />
                            <span className="bg-[#0d0f14] border px-2 py-0.5 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                              {selectedNode.customState?.addressSize || 4} bits
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Allows {Math.pow(2, selectedNode.customState?.addressSize || 4)} discrete registers
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-400">
                            Word Size (1 to 16 bits)
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="range"
                              min="1"
                              max="16"
                              value={selectedNode.customState?.wordSize || 8}
                              onChange={(e) => {
                                pushState();
                                const val = parseInt(e.target.value);
                                const addrSize = selectedNode.customState?.addressSize || 4;
                                const tapped = selectedNode.customState?.tappedAddresses || [];
                                if (!selectedNode.customState) selectedNode.customState = {};
                                selectedNode.customState.wordSize = val;
                                selectedNode.inputsCount = addrSize + val + 2;
                                selectedNode.outputsCount = val + val * tapped.length;
                                recomputeDynamicBounds(selectedNode);

                                setWires((prev) =>
                                  prev.filter(
                                    (w) =>
                                      !(
                                        (w.to === selectedNode.id && w.toPort >= selectedNode.inputsCount) ||
                                        (w.from === selectedNode.id && w.fromPort >= selectedNode.outputsCount)
                                      )
                                  )
                                );
                                setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                              }}
                              className="flex-1 accent-rose-500 h-1 bg-slate-800 rounded-lg"
                            />
                            <span className="bg-[#0d0f14] border px-2 py-0.5 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                              {selectedNode.customState?.wordSize || 8} bits
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-2.5 bg-[#0d0f14] border border-slate-800 rounded gap-3">
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-slate-200">Hardwired Zero Reg</div>
                            <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">Address 0 ignores all writes and always outputs 0.</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={!!selectedNode.customState?.zeroRegisterEnabled}
                              onChange={(e) => handleRamZeroRegisterChange(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white"></div>
                          </label>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-slate-800">
                          <label className="block text-xs font-semibold text-slate-400">
                            Tapped Addresses (comma separated)
                          </label>
                          <input
                            type="text"
                            value={selectedNode.customState?.tappedAddressesRaw || ''}
                            onChange={(e) => handleRamTappedAddressesChange(e.target.value)}
                            className="w-full bg-[#0d0f14] border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                            placeholder="e.g. 240, 255"
                          />
                          <p className="text-[10px] text-slate-500 leading-normal">
                            Exposes dynamic output pins `T_addr[bit]` for tapping specific memory register cells.
                          </p>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-slate-800">
                          <div className="text-xs font-semibold text-slate-400">
                            Live Register Memory Grid
                          </div>
                          <div className="max-h-48 overflow-y-auto border border-slate-800 rounded bg-[#07080c] p-2 text-[10px] font-mono space-y-1 select-none">
                            <div className="grid grid-cols-4 gap-1 font-bold text-slate-500 border-b border-slate-800 pb-1 mb-1">
                              <div>Addr</div>
                              <div>Hex</div>
                              <div>Binary</div>
                              <div>Value</div>
                            </div>
                            {(() => {
                              const addrSize = selectedNode.customState?.addressSize || 4;
                              const wordSize = selectedNode.customState?.wordSize || 8;
                              const maxAddr = Math.pow(2, addrSize);
                              
                              const rows = [];
                              for (let i = 0; i < maxAddr; i++) {
                                const rowBits = selectedNode.customState?.memory?.[i] || Array(wordSize).fill(false);
                                const isZero = rowBits.every((b: boolean) => !b);
                                const activeAddr = selectedNode.customState?.activeAddrDecimal || 0;
                                
                                let decVal = 0;
                                for (let b = 0; b < wordSize; b++) {
                                  if (rowBits[b]) {
                                    decVal += Math.pow(2, b);
                                  }
                                }
                                
                                const binStr = [...rowBits].reverse().map(b => b ? '1' : '0').join('');
                                
                                rows.push(
                                  <div key={i} className={`grid grid-cols-4 gap-1 py-0.5 px-1 rounded ${
                                    i === activeAddr 
                                      ? 'bg-rose-500/25 text-rose-300 font-bold border border-rose-500/30' 
                                      : isZero 
                                        ? 'text-slate-600' 
                                        : 'text-slate-300'
                                  }`}>
                                    <div>R{i}</div>
                                    <div>0x{i.toString(16).toUpperCase().padStart(2, '0')}</div>
                                    <div>{binStr}</div>
                                    <div>{decVal}</div>
                                  </div>
                                );
                              }
                              return rows;
                            })()}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-800 space-y-2.5">
                          <label className="block text-xs font-semibold text-slate-400">
                            Upload RAM Preset (.txt)
                          </label>
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border border-dashed border-slate-700 hover:border-cyan-500 rounded p-4 text-center cursor-pointer transition bg-[#0d0f14] hover:bg-slate-900/50"
                          >
                            <Upload className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                            <p className="text-[10px] text-slate-400 font-medium">Click to select .txt file</p>
                            <p className="text-[9px] text-slate-500 mt-1">Raw line break binary sequences (e.g. 10101010)</p>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".txt"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.length) {
                                  handleRAMFileLoad(e.target.files[0]);
                                }
                              }}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleRAMFileDownload}
                            className="w-full mt-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 py-2 rounded text-[11px] font-bold transition flex items-center justify-center gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5 text-cyan-400 rotate-180" /> Export RAM Contents
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'dec_to_bin' && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-400">
                          Binary Output Width (1 to 16 bits)
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="1"
                            max="16"
                            value={selectedNode.outputsCount}
                            onChange={(e) => {
                              pushState();
                              const val = parseInt(e.target.value);
                              if (!selectedNode.customState) selectedNode.customState = {};
                              selectedNode.customState.outputBits = val;
                              selectedNode.outputsCount = val;
                              selectedNode.height = Math.max(165, (val + 1) * 16);

                              setWires((prev) =>
                                prev.filter((w) => !(w.from === selectedNode.id && w.fromPort >= val))
                              );
                              setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                            }}
                            className="flex-1 accent-emerald-500 h-1 bg-slate-800 rounded-lg"
                          />
                          <span className="bg-[#0d0f14] border px-2 py-0.5 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                            {selectedNode.outputsCount} bits
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'prefab_8bit_cla_sub' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-2.5 bg-[#0d0f14] border border-slate-800 rounded gap-3">
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-slate-200">Underflow Safety</div>
                            <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">Clamps difference outputs to 0 if subtraction goes below zero.</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={selectedNode.customState?.underflowSafety !== false}
                              onChange={(e) => {
                                pushState();
                                if (!selectedNode.customState) selectedNode.customState = {};
                                selectedNode.customState.underflowSafety = e.target.checked;
                                setNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n)));
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white"></div>
                          </label>
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'custom_ic' && (
                      <div className="bg-[#0d0f14]/55 p-3 rounded-lg border border-slate-850 space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                          IC Chip Specifications
                        </div>
                        <div className="text-[11px] text-slate-300">
                          <span className="font-semibold text-slate-500">Package Type:</span> {selectedNode.customState?.icDef?.name || 'Custom IC'}
                        </div>
                        <div className="text-[11px] text-slate-300">
                          <span className="font-semibold text-slate-500">Pins Layout:</span> {selectedNode.customState?.icDef?.inputPins?.length || 0} Inputs, {selectedNode.customState?.icDef?.outputPins?.length || 0} Outputs
                        </div>
                        <div className="text-[11px] text-slate-300">
                          <span className="font-semibold text-slate-500">Internal Density:</span> {selectedNode.customState?.icDef?.nodes?.length || 0} components
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Duplicate / Delete selection */}
              <div className="space-y-2 pt-4 border-t border-slate-800 mt-auto">
                <button
                  type="button"
                  onClick={handleRotate}
                  className="w-full bg-[#0d0f14] hover:bg-slate-800 text-slate-200 border border-slate-850 py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400" /> Rotate 45°
                </button>
                <button
                  onClick={handleDuplicate}
                  className="w-full py-2 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-cyan-400" /> Duplicate Pin/Node
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full py-2 rounded text-xs font-bold bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 border border-rose-900/30 transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Delete Pin/Node
                </button>
              </div>
            </div>
          ) : (
            /* General IC Box configuration properties */
            <div className="p-4 space-y-5">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" />
                  IC Outer Box Settings
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Customize the appearance and geometry of the completed IC block
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Integrated Circuit Name
                  </label>
                  <input
                    type="text"
                    value={icName}
                    onChange={(e) => setIcName(e.target.value)}
                    className="w-full bg-[#0d0f14] border border-slate-850 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
                    placeholder="e.g. 8-Bit ALU"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    IC Package Background Color
                  </label>
                  <div className="flex items-center space-x-2.5">
                    <input
                      type="color"
                      value={icColor}
                      onChange={(e) => setIcColor(e.target.value)}
                      className="w-10 h-8 bg-transparent border-0 cursor-pointer shrink-0 outline-none"
                    />
                    <input
                      type="text"
                      value={icColor}
                      onChange={(e) => setIcColor(e.target.value)}
                      className="w-full bg-[#0d0f14] border border-slate-850 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-400">
                    IC Block Width ({icWidth}px)
                  </label>
                  <input
                    type="range"
                    min="80"
                    max="300"
                    step="10"
                    value={icWidth}
                    onChange={(e) => setIcWidth(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-400">
                    IC Block Height ({icHeight}px)
                  </label>
                  <input
                    type="range"
                    min="60"
                    max="300"
                    step="10"
                    value={icHeight}
                    onChange={(e) => setIcHeight(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <hr className="border-slate-800" />

              <div className="p-3 bg-[#0d0f14] border border-slate-850 rounded-lg">
                <h4 className="text-xs font-bold text-white mb-1.5 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  IC Editor Guidelines
                </h4>
                <ul className="text-[10px] text-slate-400 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li>Place <strong>IC Input Pins</strong> to define input pins for the external logic connections.</li>
                  <li>Place <strong>IC Output Pins</strong> to propagate signals computed by the internal gates back out.</li>
                  <li>Any standard <strong>LED Status Bulb</strong> placed inside the subcircuit will render and glow on the outer face of the IC automatically!</li>
                  <li>Change pin layout sides (Left/Right/Top/Bottom) and indices inside the properties drawer by clicking on each pin.</li>
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>

      {isShapeEditorOpen && (
        <ICShapeEditorModal
          nodes={nodes}
          icWidth={icWidth}
          icHeight={icHeight}
          icColor={icColor}
          packageStyle={packageStyle}
          ledPositions={ledPositions}
          onSave={(w, h, s, lp, updatedPins) => {
            setIcWidth(w);
            setIcHeight(h);
            setPackageStyle(s);
            setLedPositions(lp);

            // Sync pin side, order, and labels back into the internal nodes state
            setNodes((prev) =>
              prev.map((n) => {
                const match = updatedPins.find((up) => up.id === n.id);
                if (match) {
                  return {
                    ...n,
                    label: match.label,
                    customState: {
                      ...n.customState,
                      pinLabel: match.label,
                      pinSide: match.side,
                      pinOrder: match.order
                    }
                  };
                }
                return n;
              })
            );
            setIsShapeEditorOpen(false);
            showToast('IC package style and pin mappings saved successfully!', 'success');
          }}
          onClose={() => setIsShapeEditorOpen(false)}
          activePalette={activePalette}
        />
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1e1e2e] border border-slate-800 p-6 rounded-xl max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <Cpu className="w-5 h-5 text-amber-500" />
              Exit Custom IC Maker?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              All unsaved changes to this IC definition will be permanently discarded. Are you sure you want to exit?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="px-4 py-2 text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-slate-300 rounded-lg transition"
              >
                Keep Editing
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  onCancel();
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-lg shadow-rose-600/20 transition"
              >
                Yes, Discard &amp; Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1e1e2e] border border-slate-800 p-6 rounded-xl max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <Upload className="w-5 h-5 text-indigo-400" />
              Import Subcircuit?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Importing this workspace will replace all current elements inside the custom IC editor. This action cannot be undone. Are you sure you want to proceed?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowImportConfirm(false)}
                className="px-4 py-2 text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-slate-300 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={executeImportWorkspace}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-600/20 transition"
              >
                Yes, Import &amp; Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ICShapeEditorModalProps {
  nodes: LogicNode[];
  icWidth: number;
  icHeight: number;
  icColor: string;
  packageStyle: string;
  ledPositions: Record<string, { x: number; y: number }>;
  onSave: (
    width: number,
    height: number,
    style: string,
    ledPos: Record<string, { x: number; y: number }>,
    pins: { id: string; label: string; side: 'left' | 'right' | 'top' | 'bottom'; order: number }[]
  ) => void;
  onClose: () => void;
  activePalette: any;
}

export const ICShapeEditorModal: React.FC<ICShapeEditorModalProps> = ({
  nodes,
  icWidth,
  icHeight,
  icColor,
  packageStyle,
  ledPositions,
  onSave,
  onClose,
  activePalette
}) => {
  const [width, setWidth] = useState(icWidth);
  const [height, setHeight] = useState(icHeight);
  const [style, setStyle] = useState(packageStyle);
  const [ledPos, setLedPos] = useState<Record<string, { x: number; y: number }>>({ ...ledPositions });

  // Load all boundary pins
  const [pins, setPins] = useState(() => [
    ...nodes.filter((n) => n.type === 'ic_input_pin').map((n) => ({
      id: n.id,
      label: n.customState?.pinLabel || n.label || 'IN',
      side: (n.customState?.pinSide || 'left') as 'left' | 'right' | 'top' | 'bottom',
      order: n.customState?.pinOrder || 0,
      isInput: true
    })),
    ...nodes.filter((n) => n.type === 'ic_output_pin').map((n) => ({
      id: n.id,
      label: n.customState?.pinLabel || n.label || 'OUT',
      side: (n.customState?.pinSide || 'right') as 'left' | 'right' | 'top' | 'bottom',
      order: n.customState?.pinOrder || 0,
      isInput: false
    }))
  ]);

  // Load all internal LEDs
  const ledBulbs = nodes.filter((n) => n.type === 'lightbulb');

  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedLedId, setSelectedLedId] = useState<string | null>(null);

  // Dragging states
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [draggingLedId, setDraggingLedId] = useState<string | null>(null);

  // References for container size
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Helper to re-order pins sequentially on a given side
  const normalizeOrders = (pinList: typeof pins) => {
    const sides: ('left' | 'right' | 'top' | 'bottom')[] = ['left', 'right', 'top', 'bottom'];
    const updated = [...pinList];
    sides.forEach((s) => {
      const sideItems = updated.filter((p) => p.side === s).sort((a, b) => a.order - b.order);
      sideItems.forEach((item, idx) => {
        item.order = idx;
      });
    });
    return updated;
  };

  const handlePinSideChange = (pinId: string, side: 'left' | 'right' | 'top' | 'bottom') => {
    setPins((prev) => {
      const next = prev.map((p) => (p.id === pinId ? { ...p, side, order: 999 } : p));
      return normalizeOrders(next);
    });
  };

  const handlePinOrderChange = (pinId: string, direction: 'up' | 'down') => {
    setPins((prev) => {
      const pin = prev.find((p) => p.id === pinId);
      if (!pin) return prev;
      const sidePins = prev.filter((p) => p.side === pin.side).sort((a, b) => a.order - b.order);
      const idx = sidePins.findIndex((p) => p.id === pinId);
      if (idx === -1) return prev;

      if (direction === 'up' && idx > 0) {
        // Swap order with previous pin
        const prevPin = sidePins[idx - 1];
        const oldOrder = pin.order;
        pin.order = prevPin.order;
        prevPin.order = oldOrder;
      } else if (direction === 'down' && idx < sidePins.length - 1) {
        // Swap order with next pin
        const nextPin = sidePins[idx + 1];
        const oldOrder = pin.order;
        pin.order = nextPin.order;
        nextPin.order = oldOrder;
      }
      return [...prev];
    });
  };

  const handleResetLEDs = () => {
    setLedPos({});
    setSelectedLedId(null);
  };

  const handleSaveClick = () => {
    onSave(width, height, style, ledPos, pins);
  };

  // Drag interaction handlers
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const icLeft = cx - (width * 1.5) / 2;
    const icTop = cy - (height * 1.5) / 2;

    if (draggingLedId) {
      // Local coordinate within the IC body relative to scale (1.5x)
      const localX = (mouseX - icLeft) / 1.5;
      const localY = (mouseY - icTop) / 1.5;
      const clampedX = Math.max(10, Math.min(localX, width - 10));
      const clampedY = Math.max(10, Math.min(localY, height - 10));
      setLedPos((prev) => ({
        ...prev,
        [draggingLedId]: { x: Math.round(clampedX), y: Math.round(clampedY) }
      }));
    }

    if (draggingPinId) {
      // Calculate closest side
      const localX = (mouseX - icLeft) / 1.5;
      const localY = (mouseY - icTop) / 1.5;

      const dLeft = Math.abs(localX);
      const dRight = Math.abs(width - localX);
      const dTop = Math.abs(localY);
      const dBottom = Math.abs(height - localY);

      const minDist = Math.min(dLeft, dRight, dTop, dBottom);
      let side: 'left' | 'right' | 'top' | 'bottom' = 'left';

      if (minDist === dLeft) side = 'left';
      else if (minDist === dRight) side = 'right';
      else if (minDist === dTop) side = 'top';
      else if (minDist === dBottom) side = 'bottom';

      // Within side, determine order based on relative mouse ratio
      let relativeRatio = 0.5;
      if (side === 'left' || side === 'right') {
        relativeRatio = localY / height;
      } else {
        relativeRatio = localX / width;
      }
      relativeRatio = Math.max(0, Math.min(relativeRatio, 1));

      setPins((prev) => {
        const next = prev.map((p) => {
          if (p.id === draggingPinId) {
            return { ...p, side, order: relativeRatio * 1000 };
          }
          return p;
        });
        return normalizeOrders(next);
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingPinId(null);
    setDraggingLedId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="bg-[#0f111a] border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-850 flex items-center justify-between bg-[#131622]">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">IC Package &amp; Pin Layout Designer</h2>
              <p className="text-[10px] text-slate-400">Design custom shapes, configure pin sides/order, and position status LEDs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Body Splitter */}
        <div className="flex-1 flex overflow-hidden">
          {/* Controls sidebar */}
          <div className="w-80 border-r border-slate-850 p-4 space-y-5 overflow-y-auto bg-[#0d0f15]">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Geometry &amp; Shape
              </h3>

              {/* Package style selection */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Package Shape</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'rectangle', name: 'Rectangle', desc: 'Standard Dual In-Line Chip' },
                    { id: 'sleek', name: 'Sleek Cyber', desc: 'Sleek cyber corners' },
                    { id: 'circle', name: 'Circle/Oval', desc: 'Curved module' },
                    { id: 'hexagon', name: 'Hexagon', desc: 'Futuristic hexagon block' }
                  ].map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => setStyle(pkg.id)}
                      className={`p-2 rounded-lg border text-left transition ${
                        style === pkg.id
                          ? 'border-cyan-500 bg-cyan-950/20 text-white'
                          : 'border-slate-800 bg-[#0d0f14] hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{pkg.name}</div>
                      <div className="text-[8px] text-slate-500 leading-tight">{pkg.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dimension controls */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                    <span>Width</span>
                    <span className="text-cyan-400 font-mono">{width}px</span>
                  </div>
                  <input
                    type="range"
                    min="80"
                    max="280"
                    step="10"
                    value={width}
                    onChange={(e) => setWidth(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                    <span>Height</span>
                    <span className="text-cyan-400 font-mono">{height}px</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="280"
                    step="10"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Selection details */}
            <div className="pt-4 border-t border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                <Settings className="w-3.5 h-3.5 text-rose-400" />
                Component Inspector
              </h3>

              {selectedPinId ? (() => {
                const pin = pins.find((p) => p.id === selectedPinId);
                if (!pin) return <p className="text-[10px] text-slate-500">Select a pin to edit</p>;
                return (
                  <div className="space-y-3 bg-[#11131c] p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${pin.isInput ? 'bg-[#cba6f7]' : 'bg-[#f38ba8]'}`} />
                      <span className="text-xs font-bold text-white">{pin.isInput ? 'Input Pin' : 'Output Pin'}</span>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Pin Label</label>
                      <input
                        type="text"
                        value={pin.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPins((prev) => prev.map((p) => (p.id === pin.id ? { ...p, label: val } : p)));
                        }}
                        className="w-full bg-[#0d0f14] border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Pin Boundary Side</label>
                      <div className="grid grid-cols-4 gap-1">
                        {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
                          <button
                            key={side}
                            onClick={() => handlePinSideChange(pin.id, side)}
                            className={`p-1 text-[9px] font-bold rounded capitalize border transition ${
                              pin.side === side
                                ? 'bg-cyan-600 border-cyan-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            {side}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Move Pin Side Order</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePinOrderChange(pin.id, 'up')}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs py-1 rounded transition font-bold"
                        >
                          Move Up / Left
                        </button>
                        <button
                          onClick={() => handlePinOrderChange(pin.id, 'down')}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs py-1 rounded transition font-bold"
                        >
                          Move Down / Right
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })() : selectedLedId ? (() => {
                const ledIdx = ledBulbs.findIndex((l) => l.id === selectedLedId);
                const led = ledBulbs[ledIdx];
                if (!led) return <p className="text-[10px] text-slate-500">Select an element to inspect</p>;
                return (
                  <div className="space-y-3 bg-[#11131c] p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-white">Status LED Placement</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      This LED displays state for internal lightbulb <strong>"{led.label || 'LED'}"</strong>. Drag it anywhere inside the IC package block to customize its placement!
                    </p>
                    <div className="flex justify-between items-center bg-[#0d0f14] p-1.5 rounded border border-slate-800 text-[10px] font-mono text-slate-400">
                      <span>Coordinates:</span>
                      <span className="text-cyan-400 font-bold">X: {ledPos[led.id]?.x ?? 'Auto'}, Y: {ledPos[led.id]?.y ?? 'Auto'}</span>
                    </div>
                    <button
                      onClick={() => {
                        const next = { ...ledPos };
                        delete next[led.id];
                        setLedPos(next);
                      }}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] py-1.5 rounded transition font-semibold"
                    >
                      Reset LED Position to Auto
                    </button>
                  </div>
                );
              })() : (
                <div className="text-center p-6 border border-dashed border-slate-800 rounded-lg bg-slate-900/10">
                  <HelpCircle className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                  <p className="text-[10px] text-slate-400">Click any pin or LED to customize details. Drag pins to sides to snap.</p>
                </div>
              )}
            </div>

            {/* LEDs Reset options */}
            {ledBulbs.length > 0 && (
              <div className="pt-4 border-t border-slate-800">
                <button
                  onClick={handleResetLEDs}
                  className="w-full bg-[#1e1e2e]/40 hover:bg-[#1e1e2e] border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-[10px] py-2 px-3 rounded transition font-semibold"
                >
                  Reset All LED Placements
                </button>
              </div>
            )}
          </div>

          {/* Canvas Interactive Viewport */}
          <div className="flex-1 bg-slate-950 flex flex-col relative" ref={previewContainerRef}>
            <div className="absolute top-3 left-3 bg-[#11111b]/80 border border-slate-800/80 px-2.5 py-1.5 rounded text-[10px] font-medium text-slate-400 z-10 space-y-1 select-none">
              <div className="flex items-center gap-1.5 text-white font-bold mb-0.5">🚀 Interactive Sandbox</div>
              <div>• Drag pins on the sides to re-order or switch boundary sides.</div>
              <div>• Drag internal status LEDs (green dots) to arrange them inside.</div>
              <div>• Click components to select and edit properties.</div>
            </div>

            {/* Central Stage */}
            <div className="flex-1 flex items-center justify-center relative select-none">
              {/* Dynamic Package Drawing */}
              <div
                className="relative shadow-2xl transition-all duration-100 border border-white/10"
                style={{
                  width: `${width * 1.5}px`,
                  height: `${height * 1.5}px`,
                  backgroundColor: icColor,
                  borderRadius: style === 'circle' ? '50%' : style === 'hexagon' ? '24px' : style === 'sleek' ? '12px' : '6px',
                  clipPath: style === 'hexagon'
                    ? 'polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%)'
                    : style === 'sleek'
                      ? 'polygon(12px 0px, 100% 0px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0px 100%, 0px 12px)'
                      : 'none'
                }}
              >
                {/* IC Name Label */}
                <div className="absolute inset-x-0 top-1/4 text-center pointer-events-none px-4">
                  <div className="text-white text-xs font-black tracking-wider uppercase truncate">{nodes.length > 0 ? (nodes[0]?.customState?.icDef?.name || 'Custom IC') : 'Custom IC'}</div>
                  <div className="text-[8px] text-slate-400/80 font-semibold font-mono tracking-widest mt-0.5">PACKAGE PREVIEW</div>
                </div>

                {/* Render Draggable Status LEDs */}
                {ledBulbs.map((led, idx) => {
                  const custom = ledPos[led.id];
                  let rx = (width * 1.5) / 2;
                  let ry = (height * 1.5) / 2 + 15;

                  if (custom) {
                    rx = custom.x * 1.5;
                    ry = custom.y * 1.5;
                  } else {
                    // fall back auto layout (spread horizontal row in preview)
                    if (ledBulbs.length > 1) {
                      const pctX = idx / (ledBulbs.length - 1 || 1);
                      rx = 25 + pctX * (width * 1.5 - 50);
                    }
                  }

                  const isSelected = selectedLedId === led.id;

                  return (
                    <div
                      key={led.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedPinId(null);
                        setSelectedLedId(led.id);
                        setDraggingLedId(led.id);
                      }}
                      className={`absolute w-4 h-4 rounded-full bg-emerald-500 border border-slate-900 cursor-move flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 ${
                        isSelected ? 'ring-2 ring-cyan-400 scale-110' : 'opacity-85'
                      }`}
                      style={{
                        left: `${rx - 8}px`,
                        top: `${ry - 8}px`,
                        boxShadow: '0 0 10px rgba(16,185,129,0.6)'
                      }}
                      title={led.label}
                    >
                      <div className="absolute top-4 text-[7px] text-slate-400 font-bold whitespace-nowrap bg-slate-950/70 px-1 rounded pointer-events-none">{led.label || 'LED'}</div>
                    </div>
                  );
                })}

                {/* Render pins around edges */}
                {pins.map((pin) => {
                  const sidePins = pins.filter((p) => p.side === pin.side).sort((a, b) => a.order - b.order);
                  const pinIdxOnSide = sidePins.findIndex((p) => p.id === pin.id);
                  const countOnSide = sidePins.length;

                  let left = 0;
                  let top = 0;
                  const factor = (pinIdxOnSide + 1) / (countOnSide + 1);

                  const previewW = width * 1.5;
                  const previewH = height * 1.5;

                  if (pin.side === 'left') {
                    left = -16;
                    top = previewH * factor - 7;
                  } else if (pin.side === 'right') {
                    left = previewW;
                    top = previewH * factor - 7;
                  } else if (pin.side === 'top') {
                    left = previewW * factor - 16;
                    top = -14;
                  } else if (pin.side === 'bottom') {
                    left = previewW * factor - 16;
                    top = previewH;
                  }

                  const isSelected = selectedPinId === pin.id;
                  const isHoriz = pin.side === 'top' || pin.side === 'bottom';

                  return (
                    <div
                      key={pin.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedLedId(null);
                        setSelectedPinId(pin.id);
                        setDraggingPinId(pin.id);
                      }}
                      className={`absolute cursor-move flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                        isHoriz ? 'w-8 h-3.5 flex-col' : 'w-4 h-3.5 flex-row'
                      } ${isSelected ? 'z-20 scale-105' : 'z-10'}`}
                      style={{ left: `${left}px`, top: `${top}px` }}
                    >
                      {/* Visual contact metal pad pin */}
                      <div
                        className={`bg-slate-300 border border-slate-500 text-[8px] font-mono font-bold text-slate-900 shadow flex items-center justify-center rounded-sm select-none ${
                          isHoriz ? 'w-6 h-2' : 'w-3 h-3'
                        } ${isSelected ? 'bg-cyan-400 border-cyan-500 text-cyan-950 ring-2 ring-cyan-400/50' : 'hover:bg-white'}`}
                      >
                        <span className="scale-75 text-[7px]">{pin.order}</span>
                      </div>

                      {/* Label badge */}
                      <div
                        className="absolute text-[8px] font-bold text-slate-300 pointer-events-none px-1 rounded bg-slate-950/80 max-w-[50px] truncate"
                        style={{
                          transform:
                            pin.side === 'left'
                              ? 'translateX(20px)'
                              : pin.side === 'right'
                                ? 'translateX(-20px)'
                                : pin.side === 'top'
                                  ? 'translateY(16px)'
                                  : 'translateY(-16px)'
                        }}
                      >
                        {pin.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-850 bg-[#131622] flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveClick}
            className="px-5 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center gap-1.5 transition shadow-lg shadow-cyan-500/15"
          >
            <Check className="w-4 h-4" />
            Apply Shape Customizations
          </button>
        </div>
      </div>
    </div>
  );
};

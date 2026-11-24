import React, { useRef, useEffect, useState } from 'react';
import { Camera, Wire, LogicNode, CustomICDef } from '../types';
import { NodeArchetypes } from '../utils/nodeArchetypes';
import {
  snap,
  screenToWorld,
  getPortPosition,
  getAngledWirePoints,
  getDistanceToSegment
} from '../utils/geometry';
import { createNode } from '../utils/logicSolver';
import { ColorPalette } from '../utils/themes';
import { routeAStar, Point } from '../utils/astarRouter';
import { Check, Sparkles, X } from 'lucide-react';

interface LogicCanvasProps {
  nodes: LogicNode[];
  setNodes: React.Dispatch<React.SetStateAction<LogicNode[]>>;
  wires: Wire[];
  setWires: React.Dispatch<React.SetStateAction<Wire[]>>;
  camera: Camera;
  setCamera: React.Dispatch<React.SetStateAction<Camera>>;
  selection: string[];
  setSelection: React.Dispatch<React.SetStateAction<string[]>>;
  activeTool: 'select' | 'route';
  setActiveTool: (tool: 'select' | 'route') => void;
  simTicks: number;
  pushState: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onOpenPrefabModal: () => void;
  palette: ColorPalette;
  optimizeHighSpeed: boolean;
  simSpeedHz: number;
  fancyRouting: boolean;
  multiDragEnabled: boolean;
  customICs?: CustomICDef[];
}

function lineRectIntersects(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
  if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (y1 === y2) {
    const y = y1;
    if (y >= ry && y <= ry + rh) {
      if (maxX >= rx && minX <= rx + rw) {
        return true;
      }
    }
  } else if (x1 === x2) {
    const x = x1;
    if (x >= rx && x <= rx + rw) {
      if (maxY >= ry && minY <= ry + rh) {
        return true;
      }
    }
  } else {
    if (lineLineIntersects(x1, y1, x2, y2, rx, ry, rx + rw, ry)) return true;
    if (lineLineIntersects(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh)) return true;
    if (lineLineIntersects(x1, y1, x2, y2, rx, ry, rx, ry + rh)) return true;
    if (lineLineIntersects(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) return true;
  }
  return false;
}

function lineLineIntersects(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (det === 0) return false;
  const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
  const gamma = ((y1 - y2) * (x4 - x1) + (x1 - x2) * (y4 - y1)) / det;
  return (0 <= lambda && lambda <= 1) && (0 <= gamma && gamma <= 1);
}

export const LogicCanvas: React.FC<LogicCanvasProps> = ({
  nodes,
  setNodes,
  wires,
  setWires,
  camera,
  setCamera,
  selection,
  setSelection,
  activeTool,
  setActiveTool,
  simTicks,
  pushState,
  showToast,
  onCopy,
  onPaste,
  onDelete,
  onOpenPrefabModal,
  palette,
  optimizeHighSpeed,
  simSpeedHz,
  fancyRouting,
  multiDragEnabled,
  customICs = []
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const astarCacheRef = useRef<Map<string, Point[]>>(new Map());

  // Keep track of previous nodes to detect added, deleted, or moved nodes
  const prevNodesRef = useRef<LogicNode[]>([]);

  // Initialize prevNodesRef on mount
  useEffect(() => {
    prevNodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const prevNodes = prevNodesRef.current;
    if (nodes.length === 0) {
      astarCacheRef.current.clear();
      prevNodesRef.current = [];
      return;
    }
    if (prevNodes.length === 0) {
      prevNodesRef.current = nodes;
      return;
    }

    // Identify changed nodes (added, deleted, moved)
    const changedRects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const padding = 24; // Padding around the nodes' bounds to clean the safe routing zone

    // 1. Check current nodes to find added or moved nodes
    nodes.forEach(node => {
      const prev = prevNodes.find(pn => pn.id === node.id);
      if (!prev) {
        // Added node
        changedRects.push({
          x: node.x - padding,
          y: node.y - padding,
          w: node.width + 2 * padding,
          h: node.height + 2 * padding
        });
      } else if (prev.x !== node.x || prev.y !== node.y) {
        // Moved node
        changedRects.push({
          x: prev.x - padding,
          y: prev.y - padding,
          w: prev.width + 2 * padding,
          h: prev.height + 2 * padding
        });
        changedRects.push({
          x: node.x - padding,
          y: node.y - padding,
          w: node.width + 2 * padding,
          h: node.height + 2 * padding
        });
      }
    });

    // 2. Check previous nodes to find deleted nodes
    prevNodes.forEach(prev => {
      const exists = nodes.some(n => n.id === prev.id);
      if (!exists) {
        // Deleted node
        changedRects.push({
          x: prev.x - padding,
          y: prev.y - padding,
          w: prev.width + 2 * padding,
          h: prev.height + 2 * padding
        });
      }
    });

    // If there are any changed areas, invalidate overlapping paths in our cache!
    if (changedRects.length > 0) {
      const cache = astarCacheRef.current;
      const keysToInvalidate: string[] = [];

      cache.forEach((pts, key) => {
        let intersects = false;
        for (const rect of changedRects) {
          for (let i = 0; i < pts.length - 1; i++) {
            if (lineRectIntersects(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, rect.x, rect.y, rect.w, rect.h)) {
              intersects = true;
              break;
            }
          }
          if (intersects) break;
        }

        if (intersects) {
          keysToInvalidate.push(key);
        }
      });

      if (keysToInvalidate.length > 0) {
        keysToInvalidate.forEach(k => cache.delete(k));
      }
    }

    prevNodesRef.current = nodes;
  }, [nodes]);

  // Drag and connection states
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [isDraggingNodes, setIsDraggingNodes] = useState(false);
  const [isDrawingWire, setIsDrawingWire] = useState(false);
  const [boxSelecting, setBoxSelecting] = useState(false);
  const [activePressedInputNodeId, setActivePressedInputNodeId] = useState<string | null>(null);

  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedNodesStartPos, setDraggedNodesStartPos] = useState<Record<string, { x: number; y: number }>>({});
  const isDraggingNodesRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodesStartPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const dragSelectionRef = useRef<string[]>([]);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [boxSelectStart, setBoxSelectStart] = useState({ x: 0, y: 0 });
  const [boxSelectEnd, setBoxSelectEnd] = useState({ x: 0, y: 0 });

  const [wireStartPort, setWireStartPort] = useState<{
    nodeId: string;
    type: 'input' | 'output';
    index: number;
  } | null>(null);

  const [activePortHover, setActivePortHover] = useState<{
    nodeId: string;
    type: 'input' | 'output';
    index: number;
  } | null>(null);

  const [hoveredWire, setHoveredWire] = useState<{
    wire: Wire;
    pt: { x: number; y: number };
  } | null>(null);

  const [suggestions, setSuggestions] = useState<Wire[]>([]);

  const acceptSuggestions = () => {
    if (suggestions.length === 0) return;
    pushState();
    setWires(prev => [
      ...prev,
      ...suggestions
    ]);
    showToast(`Successfully auto-wired ${suggestions.length} parallel connection${suggestions.length > 1 ? 's' : ''}!`, 'success');
    setSuggestions([]);
  };

  // Helper to find parallel wire suggestions based on logical rank order and bus alignments
  const findParallelSuggestions = (
    newWire: Wire,
    nodes: LogicNode[],
    wiresList: Wire[]
  ): Wire[] => {
    const startNode = nodes.find(n => n.id === newWire.from);
    const endNode = nodes.find(n => n.id === newWire.to);
    if (!startNode || !endNode) return [];

    // --- 1. COLLECT SOURCE NODES ---
    // We want to find nodes that are part of the same logical source bus.
    // Start with nodes of the same type/archetype as startNode that are aligned.
    let sourceNodes = nodes.filter(n => {
      if (n.outputsCount === 0) return false;
      if (n.type !== startNode.type) return false;
      const isAlignedX = Math.abs(n.x - startNode.x) < 120;
      const isAlignedY = Math.abs(n.y - startNode.y) < 120;
      return isAlignedX || isAlignedY;
    });

    // Fallback: if we only found startNode, allow any node with output ports that is aligned.
    if (sourceNodes.length <= 1) {
      sourceNodes = nodes.filter(n => {
        if (n.outputsCount === 0) return false;
        const isAlignedX = Math.abs(n.x - startNode.x) < 120;
        const isAlignedY = Math.abs(n.y - startNode.y) < 120;
        return isAlignedX || isAlignedY;
      });
    }

    if (!sourceNodes.some(n => n.id === startNode.id)) {
      sourceNodes.push(startNode);
    }

    // --- 2. COLLECT DESTINATION NODES ---
    // Similarly, find nodes that are part of the same logical destination bus.
    let destNodes = nodes.filter(n => {
      if (n.inputsCount === 0) return false;
      if (n.type !== endNode.type) return false;
      const isAlignedX = Math.abs(n.x - endNode.x) < 120;
      const isAlignedY = Math.abs(n.y - endNode.y) < 120;
      return isAlignedX || isAlignedY;
    });

    if (destNodes.length <= 1) {
      destNodes = nodes.filter(n => {
        if (n.inputsCount === 0) return false;
        const isAlignedX = Math.abs(n.x - endNode.x) < 120;
        const isAlignedY = Math.abs(n.y - endNode.y) < 120;
        return isAlignedX || isAlignedY;
      });
    }

    if (!destNodes.some(n => n.id === endNode.id)) {
      destNodes.push(endNode);
    }

    // --- 3. FLAT LIST OF ALL PORTS ---
    interface PortItem {
      nodeId: string;
      index: number;
      pos: Point;
    }

    const sourcePorts: PortItem[] = [];
    sourceNodes.forEach(node => {
      const isJunction = node.type === 'junction';
      const count = isJunction ? 1 : node.outputsCount;
      for (let i = 0; i < count; i++) {
        sourcePorts.push({
          nodeId: node.id,
          index: i,
          pos: getPortPosition(node, false, i)
        });
      }
    });

    const destPorts: PortItem[] = [];
    destNodes.forEach(node => {
      const isJunction = node.type === 'junction';
      const count = isJunction ? 1 : node.inputsCount;
      for (let i = 0; i < count; i++) {
        destPorts.push({
          nodeId: node.id,
          index: i,
          pos: getPortPosition(node, isJunction ? false : true, i)
        });
      }
    });

    if (sourcePorts.length === 0 || destPorts.length === 0) return [];

    // --- 4. DETERMINE ALIGNMENT DIRECTION & SORT ---
    const srcXCoords = sourcePorts.map(p => p.pos.x);
    const srcYCoords = sourcePorts.map(p => p.pos.y);
    const minSrcX = Math.min(...srcXCoords);
    const maxSrcX = Math.max(...srcXCoords);
    const minSrcY = Math.min(...srcYCoords);
    const maxSrcY = Math.max(...srcYCoords);

    const xRange = maxSrcX - minSrcX;
    const yRange = maxSrcY - minSrcY;

    // If yRange is greater, sort by Y ascending; otherwise sort by X ascending
    const sortByY = yRange >= xRange;

    if (sortByY) {
      sourcePorts.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
      destPorts.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    } else {
      sourcePorts.sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
      destPorts.sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    }

    // --- 5. FIND ALIGNED MATCHES IN ORDER ---
    const srcIdx = sourcePorts.findIndex(p => p.nodeId === newWire.from && p.index === newWire.fromPort);
    const destIdx = destPorts.findIndex(p => p.nodeId === newWire.to && p.index === newWire.toPort);

    if (srcIdx === -1 || destIdx === -1) return [];

    const suggestions: Wire[] = [];
    const maxOffset = Math.max(sourcePorts.length, destPorts.length);

    for (let offset = -maxOffset; offset <= maxOffset; offset++) {
      if (offset === 0) continue;

      const sIndex = srcIdx + offset;
      const dIndex = destIdx + offset;

      if (sIndex >= 0 && sIndex < sourcePorts.length && dIndex >= 0 && dIndex < destPorts.length) {
        const src = sourcePorts[sIndex];
        const dest = destPorts[dIndex];

        if (src.nodeId === dest.nodeId) continue;

        // Verify not already connected
        const alreadyConnected = wiresList.some(
          w => w.from === src.nodeId && w.fromPort === src.index && w.to === dest.nodeId && w.toPort === dest.index
        );
        if (alreadyConnected) continue;

        // If dest is not a junction, check if occupied
        const isDestJunction = nodes.find(n => n.id === dest.nodeId)?.type === 'junction';
        if (!isDestJunction) {
          const destOccupied = wiresList.some(w => w.to === dest.nodeId && w.toPort === dest.index);
          if (destOccupied) continue;
        }

        suggestions.push({
          from: src.nodeId,
          fromPort: src.index,
          to: dest.nodeId,
          toPort: dest.index
        });
      }
    }

    return suggestions;
  };

  // Setup high DPI canvas scaling
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Return port coordinates under cursor
  const getPortAtPosition = (worldPos: { x: number; y: number }) => {
    for (const node of nodes) {
      const threshold = node.type === 'junction' ? 7 : 12;

      for (let i = 0; i < node.inputsCount; i++) {
        const pos = getPortPosition(node, true, i);
        const dist = Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y);
        if (dist < threshold) {
          return { nodeId: node.id, type: 'input' as const, index: i };
        }
      }

      for (let i = 0; i < node.outputsCount; i++) {
        const pos = getPortPosition(node, false, i);
        const dist = Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y);
        if (dist < threshold) {
          return { nodeId: node.id, type: 'output' as const, index: i };
        }
      }
    }
    return null;
  };

  // Return node coordinates under cursor (inverting rotation math)
  const getNodeAtPosition = (worldPos: { x: number; y: number }) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const rotation = n.customState?.rotation || 0;

      let checkX = worldPos.x;
      let checkY = worldPos.y;

      if (rotation !== 0) {
        const cx = n.x + n.width / 2;
        const cy = n.y + n.height / 2;
        const rad = (-rotation * Math.PI) / 180;
        checkX = cx + (worldPos.x - cx) * Math.cos(rad) - (worldPos.y - cy) * Math.sin(rad);
        checkY = cy + (worldPos.x - cx) * Math.sin(rad) + (worldPos.y - cy) * Math.cos(rad);
      }

      if (
        checkX >= n.x &&
        checkX <= n.x + n.width &&
        checkY >= n.y &&
        checkY <= n.y + n.height
      ) {
        return n;
      }
    }
    return null;
  };

  // Check if pointer is hovering a wire segment to highlight splitting
  const checkWireHover = (worldPos: { x: number; y: number }) => {
    const hoverThreshold = 7;
    let closestWire: Wire | null = null;
    let minDist = Infinity;
    let splitPt = null;

    wires.forEach(wire => {
      const fromNode = nodes.find(n => n.id === wire.from);
      const toNode = nodes.find(n => n.id === wire.to);
      if (!fromNode || !toNode) return;

      const pStart = getPortPosition(fromNode, false, wire.fromPort);
      const pEnd = getPortPosition(toNode, true, wire.toPort);

      const pts = getAngledWirePoints(pStart.x, pStart.y, pEnd.x, pEnd.y);
      for (let i = 0; i < pts.length - 1; i++) {
        const dist = getDistanceToSegment(
          worldPos.x,
          worldPos.y,
          pts[i].x,
          pts[i].y,
          pts[i + 1].x,
          pts[i + 1].y
        );
        if (dist < hoverThreshold && dist < minDist) {
          minDist = dist;
          closestWire = wire;
          const x1 = pts[i].x,
            y1 = pts[i].y,
            x2 = pts[i + 1].x,
            y2 = pts[i + 1].y;
          const dx = x2 - x1,
            dy = y2 - y1;
          const len_sq = dx * dx + dy * dy;
          let param =
            len_sq === 0
              ? 0
              : ((worldPos.x - x1) * dx + (worldPos.y - y1) * dy) / len_sq;
          param = Math.max(0, Math.min(1, param));
          splitPt = {
            x: snap(x1 + param * dx),
            y: snap(y1 + param * dy)
          };
        }
      }
    });

    if (closestWire && minDist < hoverThreshold && splitPt) {
      setHoveredWire({ wire: closestWire, pt: splitPt });
    } else {
      setHoveredWire(null);
    }
  };

  const disconnectWireAtPort = (nodeId: string, type: 'input' | 'output', index: number) => {
    pushState();
    if (type === 'input') {
      setWires(prev => prev.filter(w => !(w.to === nodeId && w.toPort === index)));
    } else {
      setWires(prev => prev.filter(w => !(w.from === nodeId && w.fromPort === index)));
    }
    showToast('Wire disconnected.', 'success');
  };

  const performWireBranch = (wire: Wire, pt: { x: number; y: number }) => {
    pushState();

    if (activeTool === 'route') {
      // Reverse wire direction
      setWires(prev =>
        prev.map(w => {
          if (
            w.from === wire.from &&
            w.fromPort === wire.fromPort &&
            w.to === wire.to &&
            w.toPort === wire.toPort
          ) {
            return {
              from: wire.to,
              fromPort: wire.toPort,
              to: wire.from,
              toPort: wire.fromPort
            };
          }
          return w;
        })
      );
      showToast('Wire direction reversed.', 'success');
    } else {
      // Create junction split
      const junction = createNode('junction', pt.x - 7, pt.y - 7, { label: '' });

      setNodes(prev => [...prev, junction]);
      setWires(prev =>
        prev
          .filter(
            w =>
              !(
                w.from === wire.from &&
                w.fromPort === wire.fromPort &&
                w.to === wire.to &&
                w.toPort === wire.toPort
              )
          )
          .concat([
            { from: wire.from, fromPort: wire.fromPort, to: junction.id, toPort: 0 },
            { from: junction.id, fromPort: 0, to: wire.to, toPort: wire.toPort }
          ])
      );

      setSelection([junction.id]);
      showToast('Split wire. Branching junction dot inserted.', 'success');
    }

    setHoveredWire(null);
  };

  // Keyboard and canvas action callbacks
  const rotateSelection = () => {
    if (selection.length === 0) return;
    pushState();
    setNodes(prev =>
      prev.map(n => {
        if (selection.includes(n.id) && n.type !== 'junction') {
          const rotation = ((n.customState?.rotation || 0) + 45) % 360;
          return {
            ...n,
            customState: {
              ...n.customState,
              rotation
            }
          } as LogicNode;
        }
        return n;
      })
    );
    showToast('Selection rotated.', 'success');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Auto-multi-drag accept/dismiss handlers
      if (suggestions.length > 0) {
        if (e.key === 'Enter') {
          e.preventDefault();
          acceptSuggestions();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSuggestions([]);
          return;
        }
      }

      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
        return;
      }

      // Hotkey V / E
      if (e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      }
      if (e.key.toLowerCase() === 'e') {
        setActiveTool('route');
        showToast('Route Tool: Click a wire to reverse or branch.', 'success');
      }

      // Rotate layout
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        rotateSelection();
      }

      // Delete commands
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete();
      }

      // Copy commands
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        onCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        onPaste();
      }

      // Nudges
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selection.length > 0) {
        e.preventDefault();
        pushState();
        let dx = 0,
          dy = 0;
        const step = e.shiftKey ? 50 : 10;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;

        setNodes(prev =>
          prev.map(n => {
            if (selection.includes(n.id)) {
              return {
                ...n,
                x: snap(n.x + dx),
                y: snap(n.y + dy)
              } as LogicNode;
            }
            return n;
          })
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selection, activeTool, nodes, wires, suggestions]);

  // Main canvas rendering effect loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Clear everything and fill canvas backbuffer with palette background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = palette.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    // Scale for high-DPI displays so drawing coordinates map 1-to-1 with CSS sizes
    ctx.scale(dpr, dpr);

    // Context camera coordinates transformation
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Dynamic Optimization Check
    const activeHighSpeedOptimize = optimizeHighSpeed && simSpeedHz > 120;

    // Draw scrollable and zoomable background grid lines
    const gridStep = 40;
    const canvasWidth = rect.width / camera.zoom;
    const canvasHeight = rect.height / camera.zoom;
    const startX = Math.floor(-camera.x / camera.zoom / gridStep) * gridStep - gridStep * 2;
    const endX = startX + canvasWidth + gridStep * 4;
    const startY = Math.floor(-camera.y / camera.zoom / gridStep) * gridStep - gridStep * 2;
    const endY = startY + canvasHeight + gridStep * 4;

    // Draw horizontal & vertical grid lines
    ctx.strokeStyle = palette.gridLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < endX; x += gridStep) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y < endY; y += gridStep) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Draw subtle grid dots at intersections - SKIP IF OPTIMIZED HIGH SPEED
    if (!activeHighSpeedOptimize) {
      ctx.fillStyle = palette.gridDotColor;
      for (let x = startX; x < endX; x += gridStep) {
        for (let y = startY; y < endY; y += gridStep) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Fast HashMap lookup for render nodes
    const renderNodeMap = new Map<string, LogicNode>();
    for (let i = 0; i < nodes.length; i++) {
      renderNodeMap.set(nodes[i].id, nodes[i]);
    }

    // 1. Render Wires trace
    interface ProcessedWire {
      wire: Wire;
      pts: Point[];
      isHigh: boolean;
    }
    const processedWires: ProcessedWire[] = [];

    wires.forEach(wire => {
      const fromNode = renderNodeMap.get(wire.from);
      const toNode = renderNodeMap.get(wire.to);

      if (fromNode && toNode) {
        const pStart = getPortPosition(fromNode, false, wire.fromPort);
        const pEnd = getPortPosition(toNode, true, wire.toPort);

        const isHigh = !!fromNode.outputs[wire.fromPort];

        const isDragging = isDraggingNodesRef.current || isDraggingNodes;
        const isWireConnectedToDragged = isDragging && (
          dragSelectionRef.current.includes(wire.from) ||
          dragSelectionRef.current.includes(wire.to)
        );

        let pts: Point[] = [];
        const isConnectedToPressedInput = activePressedInputNodeId && (
          wire.from === activePressedInputNodeId || wire.to === activePressedInputNodeId
        );

        if (fancyRouting && !isWireConnectedToDragged && !isConnectedToPressedInput) {
          const cacheKey = `${wire.from}_${wire.fromPort}_${wire.to}_${wire.toPort}_${fromNode.x}_${fromNode.y}_${toNode.x}_${toNode.y}`;
          let cached = astarCacheRef.current.get(cacheKey);
          if (!cached) {
            // Collect other paths for A* obstacle-avoidance routing
            const otherPaths: Point[][] = [];
            wires.forEach(w => {
              if (w === wire) return;
              const oFrom = renderNodeMap.get(w.from);
              const oTo = renderNodeMap.get(w.to);
              if (oFrom && oTo) {
                const oCacheKey = `${w.from}_${w.fromPort}_${w.to}_${w.toPort}_${oFrom.x}_${oFrom.y}_${oTo.x}_${oTo.y}`;
                const oCached = astarCacheRef.current.get(oCacheKey);
                if (oCached) {
                  otherPaths.push(oCached);
                } else {
                  const oStart = getPortPosition(oFrom, false, w.fromPort);
                  const oEnd = getPortPosition(oTo, true, w.toPort);
                  otherPaths.push(getAngledWirePoints(oStart.x, oStart.y, oEnd.x, oEnd.y));
                }
              }
            });

            cached = routeAStar(pStart, pEnd, wire.from, wire.to, nodes, otherPaths);
            astarCacheRef.current.set(cacheKey, cached);
          }
          pts = cached;
        } else {
          pts = getAngledWirePoints(pStart.x, pStart.y, pEnd.x, pEnd.y);
        }

        processedWires.push({ wire, pts, isHigh });
      }
    });

    processedWires.forEach(({ wire, pts, isHigh }) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      // Render segments with beautiful jump-overs
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        if (p1.y === p2.y) {
          // Horizontal segment: find all vertical crossings of OTHER wires
          const intersections: number[] = [];

          processedWires.forEach(other => {
            if (other.wire === wire) return; // skip self
            
            const otherPts = other.pts;
            for (let j = 0; j < otherPts.length - 1; j++) {
              const q1 = otherPts[j];
              const q2 = otherPts[j + 1];

              // If other segment is vertical
              if (q1.x === q2.x) {
                const otherX = q1.x;
                const otherYMin = Math.min(q1.y, q2.y);
                const otherYMax = Math.max(q1.y, q2.y);

                const curXMin = Math.min(p1.x, p2.x);
                const curXMax = Math.max(p1.x, p2.x);

                if (otherX > curXMin && otherX < curXMax && p1.y > otherYMin && p1.y < otherYMax) {
                  intersections.push(otherX);
                }
              }
            }
          });

          // Remove duplicate x-coordinates and sort them based on movement direction
          const uniqueIntersections = Array.from(new Set(intersections));
          if (p1.x < p2.x) {
            uniqueIntersections.sort((a, b) => a - b);
          } else {
            uniqueIntersections.sort((a, b) => b - a);
          }

          let currX = p1.x;
          const R = 6; // jump-over arc radius

          uniqueIntersections.forEach(intX => {
            const distToJump = Math.abs(intX - currX);
            const distToRemainingEnd = Math.abs(p2.x - intX);

            if (distToJump > R && distToRemainingEnd > R) {
              const sign = p1.x < p2.x ? 1 : -1;

              // Draw straight line up to the jump arc
              ctx.lineTo(intX - sign * R, p1.y);

              // Draw the jump-over arc arching upwards (negative Y in canvas coordinates)
              if (sign === 1) {
                ctx.arc(intX, p1.y, R, Math.PI, 0, true);
              } else {
                ctx.arc(intX, p1.y, R, 0, Math.PI, true);
              }

              currX = intX + sign * R;
            }
          });

          // Final segment line to p2
          ctx.lineTo(p2.x, p2.y);
        } else {
          // Vertical segment is drawn straight (horizontal lines jump over it)
          ctx.lineTo(p2.x, p2.y);
        }
      }

      ctx.lineWidth = isHigh ? 3 : 1.5;
      ctx.strokeStyle = isHigh ? palette.wireHighColor : palette.wireLowColor;
      ctx.stroke();

      // Draw active flow arrows in Route active mode
      if (activeTool === 'route' && hoveredWire && hoveredWire.wire === wire) {
        ctx.fillStyle = '#f9e2af';
        for (let i = 0; i < pts.length - 1; i++) {
          const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
          if (segLen > 20) {
            const midX = (pts[i].x + pts[i + 1].x) / 2;
            const midY = (pts[i].y + pts[i + 1].y) / 2;
            const angle = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);

            ctx.save();
            ctx.translate(midX, midY);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(6, 0);
            ctx.lineTo(-4, -6);
            ctx.lineTo(-4, 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }
    });

    // 1b. Render Suggestion Wires trace (dashed, neon cyan, glowing)
    if (suggestions.length > 0) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      suggestions.forEach(wire => {
        const fromNode = renderNodeMap.get(wire.from);
        const toNode = renderNodeMap.get(wire.to);
        if (fromNode && toNode) {
          const pStart = getPortPosition(fromNode, false, wire.fromPort);
          const pEnd = getPortPosition(toNode, true, wire.toPort);

          const pts = getAngledWirePoints(pStart.x, pStart.y, pEnd.x, pEnd.y);

          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }

          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#06b6d4'; // Bright Cyberpunk Cyan
          ctx.stroke();

          // Draw a small pulse dot along each proposed path
          const midIdx = Math.floor(pts.length / 2);
          if (pts[midIdx]) {
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(pts[midIdx].x, pts[midIdx].y, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      ctx.restore();
    }

    // 2. Hovered wire highlight anchor dot
    if (hoveredWire && !isDraggingNodes && !isDraggingCanvas) {
      if (activeTool === 'select') {
        ctx.beginPath();
        ctx.arc(hoveredWire.pt.x, hoveredWire.pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#f9e2af';
        ctx.strokeStyle = palette.bgColor;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }
    }

    // 3. Draft Wire
    if (isDrawingWire && wireStartPort) {
      const startNode = renderNodeMap.get(wireStartPort.nodeId);
      if (startNode) {
        const pStart = getPortPosition(
          startNode,
          wireStartPort.type === 'input',
          wireStartPort.index
        );
        const pEnd = screenToWorld(dragOffset.x, dragOffset.y, camera);

        ctx.beginPath();
        const pts = getAngledWirePoints(pStart.x, pStart.y, pEnd.x, pEnd.y);
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#f9e2af';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 4. Render Logic Gates / Component Panels
    nodes.forEach(node => {
      const arch = NodeArchetypes[node.type];
      if (!arch) return;
      const isSelected = selection.includes(node.id);
      const rotation = node.customState?.rotation || 0;

      // Special rendering design for compact junctions
      if (node.type === 'junction') {
        ctx.beginPath();
        ctx.arc(node.x + node.width / 2, node.y + node.height / 2, 6, 0, Math.PI * 2);
        const isHigh = node.inputs[0];
        ctx.fillStyle = isHigh ? palette.junctionHighColor : palette.junctionLowColor;
        
        if (isHigh && palette.glowing && !activeHighSpeedOptimize) {
          ctx.shadowColor = palette.junctionHighColor;
          ctx.shadowBlur = 12;
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = isSelected ? '#22d3ee' : '#1e293b';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.stroke();
        return;
      }

      ctx.save();
      // Apply translation matrix and rotate appropriately
      if (rotation !== 0) {
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }

      // Text label annotation styling
      if (node.type === 'text_label') {
        ctx.font = 'bold 16px sans-serif';
        const metrics = ctx.measureText(node.label);
        node.width = Math.max(60, metrics.width + 20);

        ctx.beginPath();
        ctx.roundRect(node.x, node.y, node.width, node.height, 4);
        ctx.fillStyle = isSelected ? 'rgba(34, 211, 238, 0.1)' : 'transparent';
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x + node.width / 2, node.y + node.height / 2);

        ctx.textBaseline = 'alphabetic';
        ctx.restore();
        return;
      }

      const isBasicGate = [
        'and_gate',
        'or_gate',
        'not_gate',
        'xor_gate',
        'nand_gate',
        'nor_gate',
        'xnor_gate'
      ].includes(node.type);

      if (isBasicGate) {
        // Render IEEE classical curves gate symbol drawings
        ctx.beginPath();
        ctx.fillStyle = 'rgba(13, 15, 20, 0.95)';
        ctx.strokeStyle = isSelected ? '#22d3ee' : arch.color || '#475569';
        ctx.lineWidth = isSelected ? 3 : 2;

        const { x, y, width, height } = node;
        const halfH = height / 2;

        if (node.type === 'and_gate' || node.type === 'nand_gate') {
          ctx.moveTo(x, y);
          ctx.lineTo(x + width * 0.5, y);
          ctx.arc(x + width * 0.5, y + halfH, halfH, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(x, y + height);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          if (node.type === 'nand_gate') {
            ctx.beginPath();
            ctx.arc(x + width + 4, y + halfH, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#181825';
            ctx.fill();
            ctx.stroke();
          }
        } else if (node.type === 'or_gate' || node.type === 'nor_gate') {
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + width * 0.25, y + halfH, x, y + height);
          ctx.quadraticCurveTo(x + width * 0.6, y + height * 0.95, x + width, y + halfH);
          ctx.quadraticCurveTo(x + width * 0.6, y + height * 0.05, x, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          if (node.type === 'nor_gate') {
            ctx.beginPath();
            ctx.arc(x + width + 4, y + halfH, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#181825';
            ctx.fill();
            ctx.stroke();
          }
        } else if (node.type === 'xor_gate' || node.type === 'xnor_gate') {
          ctx.moveTo(x + 5, y);
          ctx.quadraticCurveTo(x + width * 0.25 + 5, y + halfH, x + 5, y + height);
          ctx.quadraticCurveTo(x + width * 0.6, y + height * 0.95, x + width, y + halfH);
          ctx.quadraticCurveTo(x + width * 0.6, y + height * 0.05, x + 5, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + width * 0.25, y + halfH, x, y + height);
          ctx.stroke();

          if (node.type === 'xnor_gate') {
            ctx.beginPath();
            ctx.arc(x + width + 4, y + halfH, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#181825';
            ctx.fill();
            ctx.stroke();
          }
        } else if (node.type === 'not_gate') {
          ctx.moveTo(x, y);
          ctx.lineTo(x + width - 8, y + halfH);
          ctx.lineTo(x, y + height);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x + width - 4, y + halfH, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#0a0c11';
          ctx.fill();
          ctx.stroke();
        }
      } else {
        // Draw standard rectangular card panel box
        if (node.type === 'custom_ic') {
          const icDef = node.customState?.icDef;
          const bodyColor = icDef?.color || '#1e1e2e';
          const pkg = icDef?.packageStyle || 'rectangle';

          ctx.fillStyle = bodyColor;
          ctx.strokeStyle = isSelected ? '#22d3ee' : '#313244';
          ctx.lineWidth = isSelected ? 3 : 1.5;

          ctx.beginPath();
          if (pkg === 'circle') {
            ctx.ellipse(node.x + node.width / 2, node.y + node.height / 2, node.width / 2, node.height / 2, 0, 0, Math.PI * 2);
          } else if (pkg === 'hexagon') {
            ctx.moveTo(node.x + node.width * 0.15, node.y);
            ctx.lineTo(node.x + node.width * 0.85, node.y);
            ctx.lineTo(node.x + node.width, node.y + node.height * 0.5);
            ctx.lineTo(node.x + node.width * 0.85, node.y + node.height);
            ctx.lineTo(node.x + node.width * 0.15, node.y + node.height);
            ctx.lineTo(node.x, node.y + node.height * 0.5);
            ctx.closePath();
          } else if (pkg === 'sleek') {
            ctx.moveTo(node.x + 12, node.y);
            ctx.lineTo(node.x + node.width, node.y);
            ctx.lineTo(node.x + node.width, node.y + node.height - 12);
            ctx.lineTo(node.x + node.width - 12, node.y + node.height);
            ctx.lineTo(node.x, node.y + node.height);
            ctx.lineTo(node.x, node.y + 12);
            ctx.closePath();
          } else {
            ctx.roundRect(node.x, node.y, node.width, node.height, 6);
          }
          ctx.fill();
          ctx.stroke();

          // Draw IC label name inside
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.label || icDef?.name || 'Custom IC', node.x + node.width / 2, node.y + 18);

          // Draw active LEDs inside custom IC on the outside body
          const ledStates = node.customState?.ledStates || [];
          if (ledStates.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            ledStates.forEach((led: any) => {
              if (led.x < minX) minX = led.x;
              if (led.x > maxX) maxX = led.x;
              if (led.y < minY) minY = led.y;
              if (led.y > maxY) maxY = led.y;
            });

            ledStates.forEach((led: any, idx: number) => {
              let rx = node.x + node.width / 2;
              let ry = node.y + node.height / 2 + 10;

              const customPos = icDef?.ledPositions?.[led.id];
              if (customPos) {
                rx = node.x + customPos.x;
                ry = node.y + customPos.y;
              } else {
                if (maxX !== minX) {
                  const pctX = (led.x - minX) / (maxX - minX);
                  rx = node.x + 15 + pctX * (node.width - 30);
                } else if (ledStates.length > 1) {
                  rx = node.x + 15 + (idx / (ledStates.length - 1)) * (node.width - 30);
                }

                if (maxY !== minY) {
                  const pctY = (led.y - minY) / (maxY - minY);
                  ry = node.y + 32 + pctY * (node.height - 47);
                } else if (ledStates.length > 1) {
                  ry = node.y + 32 + (idx / (ledStates.length - 1)) * (node.height - 47);
                }
              }

              // Draw miniature LED
              ctx.beginPath();
              ctx.arc(rx, ry, 6, 0, Math.PI * 2);
              ctx.fillStyle = led.isHigh ? '#a6e3a1' : '#313244';
              ctx.shadowColor = led.isHigh ? '#a6e3a1' : 'transparent';
              ctx.shadowBlur = led.isHigh ? 12 : 0;
              ctx.fill();
              ctx.shadowBlur = 0;
              ctx.strokeStyle = '#45475a';
              ctx.lineWidth = 1;
              ctx.stroke();

              // Draw LED Label
              if (led.label) {
                ctx.fillStyle = '#a6adc8';
                ctx.font = '7px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                let shortLabel = led.label;
                if (shortLabel.length > 8) shortLabel = shortLabel.substring(0, 6) + '..';
                ctx.fillText(shortLabel, rx, ry + 7);
              }
            });
          }
        } else if (node.type === 'ic_input_pin' || node.type === 'ic_output_pin') {
          ctx.fillStyle = node.type === 'ic_input_pin' ? '#cba6f7' : '#f38ba8';
          ctx.strokeStyle = isSelected ? '#22d3ee' : '#313244';
          ctx.lineWidth = isSelected ? 3 : 1.5;

          ctx.beginPath();
          ctx.roundRect(node.x, node.y, node.width, node.height, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#11111b';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            (node.customState?.pinLabel || node.label || 'PIN').toUpperCase(),
            node.x + node.width / 2,
            node.y + node.height / 2
          );

          ctx.fillStyle = '#a6adc8';
          ctx.font = '8px sans-serif';
          const side = node.customState?.pinSide || (node.type === 'ic_input_pin' ? 'left' : 'right');
          const order = node.customState?.pinOrder || 0;
          ctx.fillText(
            `${side.toUpperCase()} #${order}`,
            node.x + node.width / 2,
            node.y + node.height + 8
          );
        } else {
          ctx.fillStyle = '#0d0f14';
          ctx.strokeStyle = isSelected ? '#22d3ee' : '#1e293b';
          ctx.lineWidth = isSelected ? 3 : 1.5;

          ctx.beginPath();
          ctx.roundRect(node.x, node.y, node.width, node.height, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = arch.color || '#334155';
          ctx.beginPath();
          ctx.roundRect(node.x, node.y, node.width, 10, [6, 6, 0, 0]);
          ctx.fill();
        }
      }

      // Draw custom renders inside specialized components
      if (node.type === 'pixel_display') {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.roundRect(node.x + 27, node.y + 60, 256, 256, 4);
        ctx.fill();

        ctx.fillStyle = '#a6e3a1';
        if (node.customState?.frontBuffer) {
          for (const key in node.customState.frontBuffer) {
            if (node.customState.frontBuffer[key]) {
              const k = parseInt(key);
              const px = k & 0xff;
              const py = k >> 8;
              ctx.fillRect(node.x + 27 + px, node.y + 60 + py, 1, 1);
            }
          }
        }

        ctx.strokeStyle = '#45475a';
        ctx.strokeRect(node.x + 27, node.y + 60, 256, 256);
      } else if (node.type === 'ascii_display') {
        ctx.fillStyle = '#11111b';
        ctx.beginPath();
        ctx.roundRect(node.x + 20, node.y + 40, node.width - 40, node.height - 60, 4);
        ctx.fill();
        ctx.strokeStyle = '#45475a';
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.rect(node.x + 22, node.y + 42, node.width - 44, node.height - 64);
        ctx.clip();

        ctx.fillStyle = '#a6e3a1';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const lines = (node.customState?.text || '').split('\n');
        const wrappedLines: string[] = [];
        lines.forEach(line => {
          for (let i = 0; i < line.length; i += 22) {
            wrappedLines.push(line.slice(i, i + 22));
          }
          if (line.length === 0) wrappedLines.push('');
        });

        const maxLines = 8;
        const displayLines = wrappedLines.slice(-maxLines);

        displayLines.forEach((l, idx) => {
          ctx.fillText(l, node.x + 25, node.y + 45 + idx * 14);
        });
        ctx.restore();
      } else if (node.type === 'lightbulb') {
        const isHigh = node.inputs[0];
        ctx.beginPath();
        ctx.arc(node.x + node.width / 2, node.y + node.height / 2 + 3, 14, 0, Math.PI * 2);
        ctx.fillStyle = isHigh ? '#a6e3a1' : '#313244';
        ctx.shadowColor = isHigh ? '#a6e3a1' : 'transparent';
        ctx.shadowBlur = isHigh ? 20 : 0;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#45475a';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (node.type === 'toggle') {
        const isHigh = node.customState?.value;
        ctx.fillStyle = '#313244';
        ctx.beginPath();
        ctx.roundRect(node.x + 10, node.y + 20, 30, 16, 8);
        ctx.fill();

        ctx.fillStyle = isHigh ? '#a6e3a1' : '#f38ba8';
        ctx.beginPath();
        ctx.arc(node.x + (isHigh ? 32 : 18), node.y + 28, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (node.type === 'pushbutton') {
        const isPressed = node.customState?.value;
        ctx.fillStyle = isPressed ? '#f9e2af' : '#45475a';
        ctx.beginPath();
        ctx.roundRect(node.x + 12, node.y + 18, 26, 22, 4);
        ctx.fill();
      } else if (node.type === 'display_decimal') {
        ctx.fillStyle = '#11111b';
        ctx.beginPath();
        ctx.roundRect(node.x + 10, node.y + 40, node.width - 20, 40, 4);
        ctx.fill();

        ctx.fillStyle = '#f5c2e7';
        ctx.font = 'bold 22px Courier New';
        ctx.textAlign = 'center';
        const displayVal =
          node.customState?.renderedDecimalValue !== undefined
            ? node.customState.renderedDecimalValue
            : 0;
        ctx.fillText(displayVal.toString(), node.x + node.width / 2, node.y + 68);
      } else if (node.type === 'seven_segment') {
        const val = node.customState?.currentHexVal || 0;

        ctx.fillStyle = '#11111b';
        ctx.beginPath();
        ctx.roundRect(node.x + 20, node.y + 35, node.width - 40, node.height - 50, 4);
        ctx.fill();

        const hexSegments = [
          [1, 1, 1, 1, 1, 1, 0], // 0
          [0, 1, 1, 0, 0, 0, 0], // 1
          [1, 1, 0, 1, 1, 0, 1], // 2
          [1, 1, 1, 1, 0, 0, 1], // 3
          [0, 1, 1, 0, 0, 1, 1], // 4
          [1, 0, 1, 1, 0, 1, 1], // 5
          [1, 0, 1, 1, 1, 1, 1], // 6
          [1, 1, 1, 0, 0, 0, 0], // 7
          [1, 1, 1, 1, 1, 1, 1], // 8
          [1, 1, 1, 1, 0, 1, 1], // 9
          [1, 1, 1, 0, 1, 1, 1], // A
          [0, 0, 1, 1, 1, 1, 1], // b
          [1, 0, 0, 1, 1, 1, 0], // C
          [0, 1, 1, 1, 1, 0, 1], // d
          [1, 0, 0, 1, 1, 1, 1], // E
          [1, 0, 0, 0, 1, 1, 1]  // F
        ];

        const activeSegs = hexSegments[val] || [0, 0, 0, 0, 0, 0, 0];
        const segColor = '#f5a97f';
        const dimColor = '#1e1e2e';
        const drawSeg = (
          sx: number,
          sy: number,
          sw: number,
          sh: number,
          active: number
        ) => {
          ctx.fillStyle = active ? segColor : dimColor;
          ctx.beginPath();
          ctx.roundRect(sx, sy, sw, sh, 2);
          ctx.fill();
        };

        const dx = node.x + 35;
        const dy = node.y + 45;

        drawSeg(dx + 5, dy, 30, 6, activeSegs[0]); // top
        drawSeg(dx + 35, dy + 5, 6, 35, activeSegs[1]); // top-right
        drawSeg(dx + 35, dy + 45, 6, 35, activeSegs[2]); // bottom-right
        drawSeg(dx + 5, dy + 80, 30, 6, activeSegs[3]); // bottom
        drawSeg(dx, dy + 45, 6, 35, activeSegs[4]); // bottom-left
        drawSeg(dx, dy + 5, 6, 35, activeSegs[5]); // top-left
        drawSeg(dx + 5, dy + 40, 30, 6, activeSegs[6]); // middle
      } else if (node.type === 'dec_to_bin') {
        ctx.fillStyle = '#11111b';
        ctx.beginPath();
        ctx.roundRect(node.x + 8, node.y + 35, 84, 22, 3);
        ctx.fill();

        const activeVal = node.customState?.activeDecimalValue || 0;
        ctx.fillStyle = '#a6e3a1';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(activeVal.toString(), node.x + 88, node.y + 46);

        const layout = [
          ['7', '8', '9'],
          ['4', '5', '6'],
          ['1', '2', '3'],
          ['C', '0']
        ];

        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';

        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < layout[row].length; col++) {
            const key = layout[row][col];
            const bx = node.x + 8 + col * 30;
            const by = node.y + 65 + row * 24;
            let bw = 24;
            const bh = 18;

            if (key === '0') {
              bw = 54;
            }

            ctx.fillStyle = key === 'C' ? '#4a1b2a' : '#313244';
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 3);
            ctx.fill();

            ctx.fillStyle = key === 'C' ? '#f38ba8' : '#cdd6f4';
            ctx.fillText(key, bx + bw / 2, by + bh / 2 + 1);
          }
        }
        ctx.textBaseline = 'alphabetic';
      } else if (node.type === 'configurable_ram') {
        ctx.fillStyle = '#11111b';
        ctx.beginPath();
        ctx.roundRect(node.x + 15, node.y + 45, node.width - 30, node.height - 60, 4);
        ctx.fill();

        ctx.fillStyle = '#f5a97f';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        const addrSize = node.customState?.addressSize || 4;
        const wordSize = node.customState?.wordSize || 8;
        const activeAddr = node.customState?.activeAddrDecimal || 0;

        ctx.fillText(`Word Width: ${wordSize}b`, node.x + node.width / 2, node.y + 60);
        ctx.fillText(
          `Address: 0x${activeAddr.toString(16).toUpperCase().padStart(2, '0')}`,
          node.x + node.width / 2,
          node.y + 75
        );

        const dataBin = node.customState?.activeDataOut || Array(wordSize).fill(false);
        const dataStr = [...dataBin]
          .reverse()
          .map(v => (v ? '1' : '0'))
          .join('');

        ctx.fillStyle = '#cdd6f4';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`Val: ${dataStr}`, node.x + node.width / 2, node.y + 95);

        ctx.font = '8px monospace';
        ctx.fillStyle = '#6c7086';

        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const rad = (-rotation * Math.PI) / 180;

        for (let i = 0; i < addrSize; i++) {
          const p = getPortPosition(node, true, i);
          const px = cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad);
          const py = cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad);
          ctx.textAlign = 'left';
          ctx.fillText(`A${i}`, px + 8, py + 3);
        }

        for (let i = 0; i < wordSize; i++) {
          const p = getPortPosition(node, true, addrSize + i);
          const px = cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad);
          const py = cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad);
          ctx.textAlign = 'left';
          ctx.fillText(`D${i}`, px + 8, py + 3);
        }

        const wePort = getPortPosition(node, true, addrSize + wordSize);
        const clkPort = getPortPosition(node, true, addrSize + wordSize + 1);
        const pxWe = cx + (wePort.x - cx) * Math.cos(rad) - (wePort.y - cy) * Math.sin(rad);
        const pyWe = cy + (wePort.x - cx) * Math.sin(rad) + (wePort.y - cy) * Math.cos(rad);
        const pxClk = cx + (clkPort.x - cx) * Math.cos(rad) - (clkPort.y - cy) * Math.sin(rad);
        const pyClk = cy + (clkPort.x - cx) * Math.sin(rad) + (clkPort.y - cy) * Math.cos(rad);

        ctx.textAlign = 'left';
        ctx.fillText('WE', pxWe + 8, pyWe + 3);
        ctx.fillText('CLK', pxClk + 8, pyClk + 3);

        for (let i = 0; i < node.outputsCount; i++) {
          const p = getPortPosition(node, false, i);
          const px = cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad);
          const py = cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad);
          ctx.textAlign = 'right';
          if (i < wordSize) {
            ctx.fillText(`Q${i}`, px - 8, py + 3);
          } else {
            const tapIdx = Math.floor((i - wordSize) / wordSize);
            const bitIdx = (i - wordSize) % wordSize;
            const tAddr = (node.customState?.tappedAddresses || [])[tapIdx];
            ctx.fillStyle = '#a6e3a1';
            ctx.fillText(`T${tAddr}[${bitIdx}]`, px - 8, py + 3);
            ctx.fillStyle = '#6c7086';
          }
        }
      } else if (node.type === 'configurable_decoder') {
        ctx.fillStyle = '#11111b';
        ctx.beginPath();
        ctx.roundRect(node.x + 10, node.y + 40, node.width - 20, node.height - 50, 4);
        ctx.fill();

        ctx.fillStyle = '#89dceb';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        const inBits = node.customState?.inputBits || 3;
        const activeIdx = node.customState?.activeIdx || 0;
        ctx.fillText(
          `Decoder: ${inBits} to ${Math.pow(2, inBits)}`,
          node.x + node.width / 2,
          node.y + 60
        );

        ctx.fillStyle = '#cdd6f4';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`Out: ${activeIdx}`, node.x + node.width / 2, node.y + 85);

        // Draw input labels (Address pins)
        ctx.font = '8px monospace';
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const rad = (-rotation * Math.PI) / 180;

        for (let i = 0; i < inBits; i++) {
          const p = getPortPosition(node, true, i);
          const px = cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad);
          const py = cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad);
          ctx.fillStyle = '#6c7086';
          ctx.textAlign = 'left';
          ctx.fillText(`A${i}`, px + 8, py + 3);
        }

        // Draw output labels (Select lines)
        const outCount = Math.pow(2, inBits);
        for (let i = 0; i < outCount; i++) {
          const p = getPortPosition(node, false, i);
          const px = cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad);
          const py = cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad);
          
          if (outCount <= 16 || i === activeIdx || i % 8 === 0) {
            ctx.fillStyle = i === activeIdx ? '#a6e3a1' : '#6c7086';
            ctx.textAlign = 'right';
            ctx.fillText(`Q${i}`, px - 8, py + 3);
          }
        }
      } else if (node.type === 'configurable_mux') {
        ctx.fillStyle = '#11111b';
        ctx.beginPath();
        ctx.roundRect(node.x + 10, node.y + 40, node.width - 20, node.height - 50, 4);
        ctx.fill();

        ctx.fillStyle = '#f9e2af';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        const selBits = node.customState?.selectBits || 2;
        const dataBits = Math.pow(2, selBits);

        let selValue = 0;
        for (let i = 0; i < selBits; i++) {
          if (node.inputs[dataBits + i]) {
            selValue += Math.pow(2, i);
          }
        }
        const activeIdx = selValue;

        ctx.fillText(`MUX ${dataBits}:1`, node.x + node.width / 2, node.y + 60);
        ctx.fillStyle = '#cdd6f4';
        ctx.fillText(`Sel: ${selValue}`, node.x + node.width / 2, node.y + 75);

        ctx.font = '8px monospace';
        ctx.fillStyle = '#6c7086';

        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const rad = (-rotation * Math.PI) / 180;

        for (let i = 0; i < dataBits; i++) {
          const p = getPortPosition(node, true, i);
          const px = cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad);
          const py = cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad);

          ctx.fillStyle = i === activeIdx ? '#a6e3a1' : '#6c7086';
          ctx.textAlign = 'left';
          ctx.fillText(`D${i}`, px + 8, py + 3);
        }
        ctx.fillStyle = '#6c7086';

        for (let i = 0; i < selBits; i++) {
          const p = getPortPosition(node, true, dataBits + i);
          const px = cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad);
          const py = cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad);
          ctx.textAlign = 'left';
          ctx.fillText(`S${i}`, px + 8, py + 3);
        }

        const pOut = getPortPosition(node, false, 0);
        const pxOut = cx + (pOut.x - cx) * Math.cos(rad) - (pOut.y - cy) * Math.sin(rad);
        const pyOut = cy + (pOut.x - cx) * Math.sin(rad) + (pOut.y - cy) * Math.cos(rad);
        ctx.textAlign = 'right';
        ctx.fillText('Q', pxOut - 8, pyOut + 3);
      }

      ctx.fillStyle = '#cdd6f4';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';

      if (isBasicGate) {
        ctx.fillStyle = '#a6adc8';
        ctx.font = '9px sans-serif';
        let lbl = node.label;
        if (lbl.length > 18) lbl = lbl.substring(0, 16) + '..';
        ctx.fillText(lbl, node.x + node.width / 2, node.y + node.height + 11);
      } else if (node.type !== 'text_label') {
        let coreSymbol = arch.name;
        if (node.type === 'configurable_ram') coreSymbol = 'RAM STORAGE';
        if (node.type === 'configurable_decoder') coreSymbol = 'DECODER';
        if (node.type === 'configurable_mux') coreSymbol = 'MULTIPLEXER';
        if (node.type === 'pixel_display') coreSymbol = 'GPU & SCREEN';
        if (node.type === 'ascii_display') coreSymbol = 'TERMINAL';

        ctx.fillText(coreSymbol, node.x + node.width / 2, node.y + 24);

        ctx.fillStyle = '#a6adc8';
        ctx.font = '9px sans-serif';
        let lbl = node.label;
        if (lbl.length > 20) lbl = lbl.substring(0, 18) + '..';
        ctx.fillText(lbl, node.x + node.width / 2, node.y + 36);
      }

      ctx.restore();

      // Render ports hooks
      for (let i = 0; i < node.inputsCount; i++) {
        const pos = getPortPosition(node, true, i);
        const isHigh = node.inputs[i];

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = isHigh ? '#a6e3a1' : '#45475a';
        ctx.fill();
        ctx.strokeStyle = '#11111b';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (node.type === 'custom_ic') {
          const pin = node.customState?.icDef?.inputPins?.[i];
          if (pin && pin.label) {
            ctx.fillStyle = '#cdd6f4';
            ctx.font = 'bold 8px monospace';
            if (pin.side === 'left') {
              ctx.textAlign = 'left';
              ctx.fillText(pin.label, pos.x + 8, pos.y + 3);
            } else if (pin.side === 'right') {
              ctx.textAlign = 'right';
              ctx.fillText(pin.label, pos.x - 8, pos.y + 3);
            } else if (pin.side === 'top') {
              ctx.textAlign = 'center';
              ctx.fillText(pin.label, pos.x, pos.y + 12);
            } else if (pin.side === 'bottom') {
              ctx.textAlign = 'center';
              ctx.fillText(pin.label, pos.x, pos.y - 8);
            }
          }
        } else if (
          !isBasicGate &&
          node.type !== 'configurable_ram' &&
          node.type !== 'configurable_decoder' &&
          node.type !== 'configurable_mux' &&
          arch.inputLabels &&
          arch.inputLabels[i]
        ) {
          ctx.fillStyle = '#9399b2';
          ctx.font = '8px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(arch.inputLabels[i], pos.x + 8, pos.y + 3);
        }
      }

      for (let i = 0; i < node.outputsCount; i++) {
        const pos = getPortPosition(node, false, i);
        const isHigh = node.outputs[i];

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = isHigh ? '#a6e3a1' : '#45475a';
        ctx.fill();
        ctx.strokeStyle = '#11111b';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (node.type === 'custom_ic') {
          const pin = node.customState?.icDef?.outputPins?.[i];
          if (pin && pin.label) {
            ctx.fillStyle = '#cdd6f4';
            ctx.font = 'bold 8px monospace';
            if (pin.side === 'left') {
              ctx.textAlign = 'left';
              ctx.fillText(pin.label, pos.x + 8, pos.y + 3);
            } else if (pin.side === 'right') {
              ctx.textAlign = 'right';
              ctx.fillText(pin.label, pos.x - 8, pos.y + 3);
            } else if (pin.side === 'top') {
              ctx.textAlign = 'center';
              ctx.fillText(pin.label, pos.x, pos.y + 12);
            } else if (pin.side === 'bottom') {
              ctx.textAlign = 'center';
              ctx.fillText(pin.label, pos.x, pos.y - 8);
            }
          }
        } else if (
          !isBasicGate &&
          node.type !== 'configurable_ram' &&
          node.type !== 'configurable_decoder' &&
          node.type !== 'configurable_mux' &&
          arch.outputLabels &&
          arch.outputLabels[i]
        ) {
          ctx.fillStyle = '#9399b2';
          ctx.font = '8px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(arch.outputLabels[i], pos.x - 8, pos.y + 3);
        }
      }
    });

    // 5. Highlighting hovered port
    if (activePortHover) {
      const hoverNode = nodes.find(n => n.id === activePortHover.nodeId);
      if (hoverNode) {
        const pos = getPortPosition(
          hoverNode,
          activePortHover.type === 'input',
          activePortHover.index
        );

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#f38ba8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 6. Draw active box selection
    if (boxSelecting) {
      const pStart = screenToWorld(boxSelectStart.x, boxSelectStart.y, camera);
      const pEnd = screenToWorld(boxSelectEnd.x, boxSelectEnd.y, camera);

      ctx.fillStyle = 'rgba(137, 180, 250, 0.15)';
      ctx.strokeStyle = 'rgba(137, 180, 250, 0.6)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.roundRect(
        Math.min(pStart.x, pEnd.x),
        Math.min(pStart.y, pEnd.y),
        Math.abs(pEnd.x - pStart.x),
        Math.abs(pEnd.y - pStart.y),
        4
      );
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }, [camera, nodes, wires, selection, activePortHover, hoveredWire, activeTool, boxSelecting, isDrawingWire, dragOffset, suggestions]);

  // Mouse coordinate conversions
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (suggestions.length > 0) {
      setSuggestions([]);
    }

    const mPos = getMousePos(e);
    const worldPos = screenToWorld(mPos.x, mPos.y, camera);

    // Middle click pan
    if (e.button === 1) {
      setIsDraggingCanvas(true);
      setDragStart(mPos);
      return;
    }

    const port = getPortAtPosition(worldPos);
    const clickedNode = getNodeAtPosition(worldPos);

    // Shift select
    if (e.shiftKey && clickedNode) {
      pushState();
      const updated = selection.includes(clickedNode.id)
        ? selection.filter(id => id !== clickedNode.id)
        : [...selection, clickedNode.id];
      setSelection(updated);
      
      const startPositions: Record<string, { x: number; y: number }> = {};
      nodes.forEach(n => {
        if (updated.includes(n.id) || n.id === clickedNode.id) {
          startPositions[n.id] = { x: n.x, y: n.y };
        }
      });
      
      draggedNodesStartPosRef.current = startPositions;
      dragSelectionRef.current = updated;
      isDraggingNodesRef.current = true;
      dragStartRef.current = worldPos;

      setDraggedNodesStartPos(startPositions);
      setIsDraggingNodes(true);
      setDragStart(worldPos);
      return;
    }

    // Route Mode
    if (activeTool === 'route') {
      if (hoveredWire) {
        performWireBranch(hoveredWire.wire, hoveredWire.pt);
      } else if (!e.shiftKey) {
        setIsDraggingCanvas(true);
        setDragStart(mPos);
      }
      return;
    }

    // Ports logic
    if (port) {
      const portNode = nodes.find(n => n.id === port.nodeId);
      if (portNode && portNode.type === 'junction' && selection.includes(portNode.id)) {
        // Fall through node drags
      } else {
        if (port.type === 'input' && portNode && portNode.type !== 'junction') {
          disconnectWireAtPort(port.nodeId, 'input', port.index);
        }
        setIsDrawingWire(true);
        setWireStartPort(port);
        setDragOffset(mPos);
        setDragStart(mPos);
        return;
      }
    }

    // Click interactive and select
    if (clickedNode) {
      const arch = NodeArchetypes[clickedNode.type];
      if (arch && arch.interactive) {
        pushState();
        let checkX = worldPos.x;
        let checkY = worldPos.y;
        const rotation = clickedNode.customState?.rotation || 0;

        if (rotation !== 0) {
          const cx = clickedNode.x + clickedNode.width / 2;
          const cy = clickedNode.y + clickedNode.height / 2;
          const rad = (-rotation * Math.PI) / 180;
          checkX = cx + (worldPos.x - cx) * Math.cos(rad) - (worldPos.y - cy) * Math.sin(rad);
          checkY = cy + (worldPos.x - cx) * Math.sin(rad) + (worldPos.y - cy) * Math.cos(rad);
        }

        const localX = checkX - clickedNode.x;
        const localY = checkY - clickedNode.y;

        if (arch.onClick) arch.onClick(clickedNode, localX, localY);
        if (arch.onPress) arch.onPress(clickedNode, localX, localY);

        setActivePressedInputNodeId(clickedNode.id);
        
        // Notify React nodes of update
        setNodes(prev => prev.map(n => (n.id === clickedNode.id ? clickedNode : n)));
      }

      let activeSel = selection;
      if (!selection.includes(clickedNode.id)) {
        activeSel = [clickedNode.id];
        setSelection(activeSel);
      }

      const startPositions: Record<string, { x: number; y: number }> = {};
      nodes.forEach(n => {
        if (activeSel.includes(n.id) || n.id === clickedNode.id) {
          startPositions[n.id] = { x: n.x, y: n.y };
        }
      });
      
      draggedNodesStartPosRef.current = startPositions;
      dragSelectionRef.current = activeSel;
      isDraggingNodesRef.current = true;
      dragStartRef.current = worldPos;

      setDraggedNodesStartPos(startPositions);
      setIsDraggingNodes(true);
      setDragStart(worldPos);
      return;
    }

    // Wire branch hover
    if (hoveredWire && !e.shiftKey) {
      performWireBranch(hoveredWire.wire, hoveredWire.pt);
      return;
    }

    if (!e.shiftKey) {
      setSelection([]);
      setIsDraggingCanvas(true);
      setDragStart(mPos);
    } else {
      setBoxSelecting(true);
      setBoxSelectStart(mPos);
      setBoxSelectEnd(mPos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mPos = getMousePos(e);
    const worldPos = screenToWorld(mPos.x, mPos.y, camera);

    const hoveredPort = getPortAtPosition(worldPos);
    setActivePortHover(hoveredPort);

    if (!isDraggingCanvas && !isDraggingNodes && !boxSelecting && !isDrawingWire) {
      checkWireHover(worldPos);
    } else {
      setHoveredWire(null);
    }

    if (isDraggingCanvas) {
      const dx = mPos.x - dragStart.x;
      const dy = mPos.y - dragStart.y;
      setCamera(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setDragStart(mPos);
      return;
    }

    if (isDrawingWire) {
      setDragOffset(mPos);
      return;
    }

    if (isDraggingNodesRef.current && dragSelectionRef.current.length > 0) {
      const deltaWorld = {
        x: worldPos.x - dragStartRef.current.x,
        y: worldPos.y - dragStartRef.current.y
      };

      setNodes(prev =>
        prev.map(n => {
          const sel = dragSelectionRef.current;
          const start = draggedNodesStartPosRef.current[n.id];
          if (sel.includes(n.id) && start) {
            return {
              ...n,
              x: snap(start.x + deltaWorld.x),
              y: snap(start.y + deltaWorld.y)
            } as LogicNode;
          }
          return n;
        })
      );
      return;
    }

    if (boxSelecting) {
      setBoxSelectEnd(mPos);
      const pStart = screenToWorld(boxSelectStart.x, boxSelectStart.y, camera);
      const pEnd = worldPos;

      const left = Math.min(pStart.x, pEnd.x);
      const right = Math.max(pStart.x, pEnd.x);
      const top = Math.min(pStart.y, pEnd.y);
      const bottom = Math.max(pStart.y, pEnd.y);

      const foundNodeIds: string[] = [];
      nodes.forEach(n => {
        const cx = n.x + n.width / 2;
        const cy = n.y + n.height / 2;
        if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
          foundNodeIds.push(n.id);
        }
      });

      setSelection(foundNodeIds);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Interactive component release triggers
    if (isDraggingNodes) {
      pushState();
      nodes.forEach(node => {
        if (selection.includes(node.id)) {
          const arch = NodeArchetypes[node.type];
          if (arch && arch.onRelease) {
            let cxW = screenToWorld(getMousePos(e).x, getMousePos(e).y, camera).x;
            let cyW = screenToWorld(getMousePos(e).x, getMousePos(e).y, camera).y;
            const rotation = node.customState?.rotation || 0;

            if (rotation !== 0) {
              const cx = node.x + node.width / 2;
              const cy = node.y + node.height / 2;
              const rad = (-rotation * Math.PI) / 180;
              cxW = cx + (cxW - cx) * Math.cos(rad) - (cyW - cy) * Math.sin(rad);
              cyW = cy + (cxW - cx) * Math.sin(rad) + (cyW - cy) * Math.cos(rad);
            }

            const lx = cxW - node.x;
            const ly = cyW - node.y;

            arch.onRelease(node, lx, ly);
          }
        }
      });
      
      // Sync list state
      setNodes([...nodes]);
    }

    setIsDraggingCanvas(false);
    setIsDraggingNodes(false);
    setBoxSelecting(false);
    isDraggingNodesRef.current = false;
    dragSelectionRef.current = [];
    draggedNodesStartPosRef.current = {};

    if (isDrawingWire && wireStartPort) {
      const mPos = getMousePos(e);
      const dist = Math.hypot(mPos.x - dragStart.x, mPos.y - dragStart.y);
      const worldPos = screenToWorld(mPos.x, mPos.y, camera);
      const endPort = getPortAtPosition(worldPos);

      pushState();

      if (dist < 5) {
        disconnectWireAtPort(wireStartPort.nodeId, wireStartPort.type, wireStartPort.index);
      } else if (endPort) {
        if (endPort.nodeId !== wireStartPort.nodeId) {
          const startNode = nodes.find(n => n.id === wireStartPort.nodeId);
          const endNode = nodes.find(n => n.id === endPort.nodeId);

          const isStartJunction = startNode && startNode.type === 'junction';
          const isEndJunction = endNode && endNode.type === 'junction';

          let valid = false;
          let finalOutPort = null;
          let finalInPort = null;

          if (wireStartPort.type === 'output' && endPort.type === 'input') {
            valid = true;
            finalOutPort = wireStartPort;
            finalInPort = endPort;
          } else if (wireStartPort.type === 'input' && endPort.type === 'output') {
            valid = true;
            finalOutPort = endPort;
            finalInPort = wireStartPort;
          } else if (isStartJunction && endPort.type === 'input') {
            valid = true;
            finalOutPort = { nodeId: startNode.id, type: 'output' as const, index: 0 };
            finalInPort = endPort;
          } else if (isStartJunction && endPort.type === 'output') {
            valid = true;
            finalOutPort = endPort;
            finalInPort = { nodeId: startNode.id, type: 'input' as const, index: 0 };
          } else if (isEndJunction && wireStartPort.type === 'input') {
            valid = true;
            finalOutPort = { nodeId: endNode.id, type: 'output' as const, index: 0 };
            finalInPort = wireStartPort;
          } else if (isEndJunction && wireStartPort.type === 'output') {
            valid = true;
            finalOutPort = wireStartPort;
            finalInPort = { nodeId: endNode.id, type: 'input' as const, index: 0 };
          } else if (isStartJunction && isEndJunction) {
            valid = true;
            finalOutPort = { nodeId: startNode.id, type: 'output' as const, index: 0 };
            finalInPort = { nodeId: endNode.id, type: 'input' as const, index: 0 };
          }

          if (valid && finalOutPort && finalInPort) {
            const wireExists = wires.some(
              w =>
                w.from === finalOutPort!.nodeId &&
                w.fromPort === finalOutPort!.index &&
                w.to === finalInPort!.nodeId &&
                w.toPort === finalInPort!.index
            );

            if (!wireExists) {
              const newWire = {
                from: finalOutPort!.nodeId,
                fromPort: finalOutPort!.index,
                to: finalInPort!.nodeId,
                toPort: finalInPort!.index
              };
              setWires(prev => [
                ...prev,
                newWire
              ]);
              showToast('Circuit wire established.', 'success');

              if (multiDragEnabled) {
                const found = findParallelSuggestions(newWire, nodes, [...wires, newWire]);
                if (found.length > 0) {
                  setSuggestions(found);
                } else {
                  setSuggestions([]);
                }
              }
            } else {
              showToast('Wire already connected.', 'success');
            }
          }
        }
      } else {
        // Wire released on empty space: generate output junction branching
        const snappedX = snap(worldPos.x);
        const snappedY = snap(worldPos.y);

        const junction = createNode('junction', snappedX - 7, snappedY - 7, { label: '' });

        setNodes(prev => [...prev, junction]);

        let actualStartType = wireStartPort.type;
        const startNode = nodes.find(n => n.id === wireStartPort.nodeId);
        if (startNode && startNode.type === 'junction') {
          actualStartType = 'output';
        }

        if (actualStartType === 'output') {
          setWires(prev => [
            ...prev,
            {
              from: wireStartPort.nodeId,
              fromPort: wireStartPort.index,
              to: junction.id,
              toPort: 0
            }
          ]);
        } else {
          setWires(prev => [
            ...prev,
            {
              from: junction.id,
              fromPort: 0,
              to: wireStartPort.nodeId,
              toPort: wireStartPort.index
            }
          ]);
        }
        showToast('Wire branched and terminated at a new Junction Dot.', 'success');
      }

      setIsDrawingWire(false);
      setWireStartPort(null);
    }
    setActivePressedInputNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const mPos = getMousePos(e);
    const zoomFactor = 1.1;
    const zoomIn = e.deltaY < 0;

    const oldZoom = camera.zoom;
    let newZoom = zoomIn ? oldZoom * zoomFactor : oldZoom / zoomFactor;
    newZoom = Math.max(0.05, Math.min(newZoom, 3.0));

    const worldPos = screenToWorld(mPos.x, mPos.y, camera);
    setCamera({
      zoom: newZoom,
      x: mPos.x - worldPos.x * newZoom,
      y: mPos.y - worldPos.y * newZoom
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('nodeType');
    if (!type) return;

    pushState();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    const worldPos = screenToWorld(mPos.x, mPos.y, camera);
    const snappedX = snap(worldPos.x);
    const snappedY = snap(worldPos.y);

    let config: any = {};
    if (type === 'custom_ic') {
      const icId = e.dataTransfer.getData('icId');
      const foundDef = customICs.find(ic => ic.id === icId);
      if (!foundDef) {
        showToast('Could not find Custom IC definition.', 'error');
        return;
      }
      config = {
        customState: {
          icId,
          icDef: foundDef
        }
      };
    }

    const newNode = createNode(type, snappedX, snappedY, config);
    setNodes(prev => [...prev, newNode]);
    setSelection([newNode.id]);
    showToast(`Added ${newNode.label || 'component'} prefab.`, 'success');
  };

  return (
    <div className="relative flex-1 w-full h-full overflow-hidden flex bg-[#1e1e2e]">
      <canvas
        id="logic-canvas"
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setActivePressedInputNodeId(null)}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="flex-1 w-full h-full block cursor-crosshair bg-[#1e1e2e]"
        style={{ touchAction: 'none' }}
      />

      {suggestions.length > 0 && (
        <div 
          className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#11111b]/95 backdrop-blur-md border border-cyan-500/40 px-5 py-3.5 rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.25)] flex items-center gap-5 z-40 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-0.5 select-none">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>Auto-Wire Suggestions</span>
            </div>
            <div className="text-[10px] text-[#a6adc8]">
              Connect <strong className="text-cyan-400">{suggestions.length}</strong> parallel wire{suggestions.length > 1 ? 's' : ''} automatically?
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                acceptSuggestions();
              }}
              className="bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-[0_0_8px_rgba(6,182,212,0.3)] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Accept [Enter]</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSuggestions([]);
              }}
              className="bg-[#313244] hover:bg-[#45475a] text-[#a6adc8] hover:text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Dismiss [Esc]</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

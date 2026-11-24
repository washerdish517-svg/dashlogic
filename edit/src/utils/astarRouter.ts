import { LogicNode, Wire } from '../types';

export interface Point {
  x: number;
  y: number;
}

const GRID_SIZE = 20;

export function routeAStar(
  pStart: Point,
  pEnd: Point,
  fromNodeId: string,
  toNodeId: string,
  nodes: LogicNode[],
  otherPaths?: Point[][]
): Point[] {
  // Gather all obstacle bounding boxes, excluding the from/to nodes
  const obstacles = nodes
    .filter(n => n.id !== fromNodeId && n.id !== toNodeId)
    .map(n => ({
      minX: n.x - 10, // add a small buffer space around gates
      maxX: n.x + n.width + 10,
      minY: n.y - 10,
      maxY: n.y + n.height + 10
    }));

  const isBlocked = (wx: number, wy: number) => {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (wx >= o.minX && wx <= o.maxX && wy >= o.minY && wy <= o.maxY) {
        return true;
      }
    }
    return false;
  };

  // Convert world positions to grid coordinates
  const startGX = Math.round(pStart.x / GRID_SIZE);
  const startGY = Math.round(pStart.y / GRID_SIZE);
  const endGX = Math.round(pEnd.x / GRID_SIZE);
  const endGY = Math.round(pEnd.y / GRID_SIZE);

  if (startGX === endGX && startGY === endGY) {
    return [pStart, pEnd];
  }

  // A* implementation
  const paddingX = Math.max(300, Math.abs(pStart.x - pEnd.x) * 0.5);
  const paddingY = Math.max(300, Math.abs(pStart.y - pEnd.y) * 0.5);
  const minGX = Math.round(Math.min(pStart.x, pEnd.x) - paddingX) / GRID_SIZE;
  const maxGX = Math.round(Math.max(pStart.x, pEnd.x) + paddingX) / GRID_SIZE;
  const minGY = Math.round(Math.min(pStart.y, pEnd.y) - paddingY) / GRID_SIZE;
  const maxGY = Math.round(Math.max(pStart.y, pEnd.y) + paddingY) / GRID_SIZE;

  // Pre-calculate other wires' grid segments within our search area for grid obstacle avoidance
  interface GridSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isHorizontal: boolean;
  }
  const existingSegments: GridSegment[] = [];

  if (otherPaths) {
    otherPaths.forEach(path => {
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        const gx1 = Math.round(p1.x / GRID_SIZE);
        const gy1 = Math.round(p1.y / GRID_SIZE);
        const gx2 = Math.round(p2.x / GRID_SIZE);
        const gy2 = Math.round(p2.y / GRID_SIZE);

        if (gx1 === gx2 && gy1 === gy2) continue;

        const xMin = Math.min(gx1, gx2);
        const xMax = Math.max(gx1, gx2);
        const yMin = Math.min(gy1, gy2);
        const yMax = Math.max(gy1, gy2);

        // Bounding box overlap filter to ensure routing speed remains perfectly fluid
        if (xMax >= minGX && xMin <= maxGX && yMax >= minGY && yMin <= maxGY) {
          existingSegments.push({
            x1: xMin,
            y1: yMin,
            x2: xMax,
            y2: yMax,
            isHorizontal: gy1 === gy2
          });
        }
      }
    });
  }

  const manhattan = (gx1: number, gy1: number, gx2: number, gy2: number) => {
    return Math.abs(gx1 - gx2) + Math.abs(gy1 - gy2);
  };

  interface GridNode {
    x: number;
    y: number;
    g: number;
    f: number;
    parent: GridNode | null;
    dir: { dx: number; dy: number } | null;
  }

  const closedSet = new Set<string>();
  const openSet: GridNode[] = [];
  const openSetMap = new Map<string, GridNode>();

  const startNode: GridNode = {
    x: startGX,
    y: startGY,
    g: 0,
    f: manhattan(startGX, startGY, endGX, endGY) * 1.5,
    parent: null,
    dir: null
  };

  openSet.push(startNode);
  openSetMap.set(`${startGX},${startGY}`, startNode);

  let iterations = 0;
  const maxIterations = 400; // keeps frame rate totally fluid

  let foundNode: GridNode | null = null;

  while (openSet.length > 0 && iterations++ < maxIterations) {
    // Find node with lowest f in open set
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIdx].f) {
        bestIdx = i;
      }
    }

    const current = openSet[bestIdx];
    openSet.splice(bestIdx, 1);
    const key = `${current.x},${current.y}`;
    openSetMap.delete(key);
    closedSet.add(key);

    if (current.x === endGX && current.y === endGY) {
      foundNode = current;
      break;
    }

    // Neighbors: up, down, left, right
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    for (let d = 0; d < dirs.length; d++) {
      const dir = dirs[d];
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx < minGX || nx > maxGX || ny < minGY || ny > maxGY) continue;

      const nkey = `${nx},${ny}`;
      if (closedSet.has(nkey)) continue;

      const wx = nx * GRID_SIZE;
      const wy = ny * GRID_SIZE;

      const isGoal = (nx === endGX && ny === endGY);
      if (!isGoal && isBlocked(wx, wy)) {
        continue;
      }

      let penalty = 0;
      for (let i = 0; i < existingSegments.length; i++) {
        const seg = existingSegments[i];
        if (current.y === ny) {
          // Horizontal step
          const minX = Math.min(current.x, nx);
          const maxX = Math.max(current.x, nx);
          if (seg.isHorizontal) {
            if (seg.y1 === ny && minX >= seg.x1 && maxX <= seg.x2) {
              penalty += 15.0; // Avoid overlapping parallel wires
            }
          } else {
            // Crossing vertical wire
            if (nx === seg.x1 && ny > seg.y1 && ny < seg.y2) {
              penalty += 2.0; // Small penalty for crossing (allows jump-over)
            }
          }
        } else {
          // Vertical step
          const minY = Math.min(current.y, ny);
          const maxY = Math.max(current.y, ny);
          if (!seg.isHorizontal) {
            if (seg.x1 === nx && minY >= seg.y1 && maxY <= seg.y2) {
              penalty += 15.0; // Avoid overlapping parallel wires
            }
          } else {
            // Crossing horizontal wire
            if (ny === seg.y1 && nx > seg.x1 && nx < seg.x2) {
              penalty += 2.0; // Small penalty for crossing (allows jump-over)
            }
          }
        }
      }

      let movementCost = 1.0;
      if (current.dir) {
        if (current.dir.dx !== dir.dx || current.dir.dy !== dir.dy) {
          movementCost += 3.0; // bend penalty to enforce clean vertical/horizontal runs
        }
      }
      movementCost += penalty;

      const tentativeG = current.g + movementCost;

      let neighborNode = openSetMap.get(nkey);
      if (!neighborNode) {
        neighborNode = {
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + manhattan(nx, ny, endGX, endGY) * 1.5,
          parent: current,
          dir: dir
        };
        openSet.push(neighborNode);
        openSetMap.set(nkey, neighborNode);
      } else if (tentativeG < neighborNode.g) {
        neighborNode.g = tentativeG;
        neighborNode.f = tentativeG + manhattan(nx, ny, endGX, endGY) * 1.5;
        neighborNode.parent = current;
        neighborNode.dir = dir;
      }
    }
  }

  const pathPoints: Point[] = [];
  pathPoints.push(pStart);

  if (foundNode) {
    const rawGridPoints: Point[] = [];
    let curr: GridNode | null = foundNode;
    while (curr) {
      rawGridPoints.unshift({ x: curr.x * GRID_SIZE, y: curr.y * GRID_SIZE });
      curr = curr.parent;
    }

    const simplified: Point[] = [];
    if (rawGridPoints.length > 0) {
      simplified.push(rawGridPoints[0]);
      for (let i = 1; i < rawGridPoints.length - 1; i++) {
        const prev = rawGridPoints[i - 1];
        const next = rawGridPoints[i + 1];
        const mid = rawGridPoints[i];
        
        const isCollinear = (prev.x === mid.x && mid.x === next.x) || (prev.y === mid.y && mid.y === next.y);
        if (!isCollinear) {
          simplified.push(mid);
        }
      }
      if (rawGridPoints.length > 1) {
        simplified.push(rawGridPoints[rawGridPoints.length - 1]);
      }
    }

    simplified.forEach(pt => pathPoints.push(pt));
  } else {
    // Fallback: Orthogonal layout
    const dx = pEnd.x - pStart.x;
    pathPoints.push({ x: pStart.x + dx / 2, y: pStart.y });
    pathPoints.push({ x: pStart.x + dx / 2, y: pEnd.y });
  }

  pathPoints.push(pEnd);
  return pathPoints;
}

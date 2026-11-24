import { LogicNode, Camera } from '../types';

export function snap(val: number): number {
  return Math.round(val / 10) * 10;
}

export function screenToWorld(sx: number, sy: number, camera: Camera) {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom
  };
}

export function worldToScreen(wx: number, wy: number, camera: Camera) {
  return {
    x: wx * camera.zoom + camera.x,
    y: wy * camera.zoom + camera.y
  };
}

export function getPortPosition(node: LogicNode, isInput: boolean, index: number) {
  if (node.type === 'junction') {
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  }

  if (node.type === 'custom_ic') {
    const icDef = node.customState?.icDef;
    if (!icDef) {
      return { x: node.x, y: node.y };
    }
    const pin = isInput ? icDef.inputPins?.[index] : icDef.outputPins?.[index];
    if (!pin) {
      return { x: node.x, y: node.y };
    }

    // Group ALL pins to count side items and order them correctly
    const allPins = [
      ...(icDef.inputPins || []).map((p: any) => ({ ...p, isInput: true })),
      ...(icDef.outputPins || []).map((p: any) => ({ ...p, isInput: false }))
    ];

    const sidePins = allPins.filter((p: any) => p.side === pin.side);
    sidePins.sort(
      (a: any, b: any) =>
        (a.order || 0) - (b.order || 0) ||
        (a.isInput ? 0 : 1) - (b.isInput ? 0 : 1) ||
        a.id.localeCompare(b.id)
    );

    const pinIndexOnSide = sidePins.findIndex((p: any) => p.id === pin.id);
    const countOnSide = sidePins.length;

    let px = node.x;
    let py = node.y;

    if (pin.side === 'left') {
      px = node.x;
      py = node.y + (node.height / (countOnSide + 1)) * (pinIndexOnSide + 1);
    } else if (pin.side === 'right') {
      px = node.x + node.width;
      py = node.y + (node.height / (countOnSide + 1)) * (pinIndexOnSide + 1);
    } else if (pin.side === 'top') {
      px = node.x + (node.width / (countOnSide + 1)) * (pinIndexOnSide + 1);
      py = node.y;
    } else if (pin.side === 'bottom') {
      px = node.x + (node.width / (countOnSide + 1)) * (pinIndexOnSide + 1);
      py = node.y + node.height;
    }

    const rotation = node.customState?.rotation || 0;
    if (rotation === 0) return { x: px, y: py };

    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const rad = (rotation * Math.PI) / 180;

    const rx = cx + (px - cx) * Math.cos(rad) - (py - cy) * Math.sin(rad);
    const ry = cy + (px - cx) * Math.sin(rad) + (py - cy) * Math.cos(rad);

    return { x: rx, y: ry };
  }

  const x = node.x;
  const y = node.y;
  const count = isInput ? node.inputsCount : node.outputsCount;
  
  const px = isInput ? x : x + node.width;
  const spacing = node.height / (count + 1);
  const py = y + spacing * (index + 1);
  
  const rotation = node.customState?.rotation || 0;
  if (rotation === 0) return { x: px, y: py };

  const cx = x + node.width / 2;
  const cy = y + node.height / 2;
  const rad = (rotation * Math.PI) / 180;
  
  const rx = cx + (px - cx) * Math.cos(rad) - (py - cy) * Math.sin(rad);
  const ry = cy + (px - cx) * Math.sin(rad) + (py - cy) * Math.cos(rad);
  
  return { x: rx, y: ry };
}

export function getAngledWirePoints(x1: number, y1: number, x2: number, y2: number) {
  const points = [{ x: x1, y: y1 }];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (dx >= 0) {
    if (absDx >= absDy) {
      const hLength = (absDx - absDy) / 2;
      const mx1 = x1 + hLength;
      const my1 = y1;
      const mx2 = mx1 + absDy;
      const my2 = y2;
      points.push({ x: mx1, y: my1 }, { x: mx2, y: my2 });
    } else {
      const diagYChange = absDx * Math.sign(dy);
      const mx1 = x1 + absDx;
      const my1 = y1 + diagYChange;
      points.push({ x: mx1, y: my1 }, { x: mx1, y: y2 });
    }
  } else {
    if (absDx >= absDy) {
      const hLength = (absDx - absDy) / 2;
      const mx1 = x1 - hLength;
      const my1 = y1;
      const mx2 = mx1 - absDy;
      const my2 = y2;
      points.push({ x: mx1, y: my1 }, { x: mx2, y: my2 });
    } else {
      const diagYChange = absDx * Math.sign(dy);
      const mx1 = x1 - absDx;
      const my1 = y1 + diagYChange;
      points.push({ x: mx1, y: my1 }, { x: mx1, y: y2 });
    }
  }
  points.push({ x: x2, y: y2 });
  return points;
}

export function getDistanceToSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  return Math.hypot(x - xx, y - yy);
}

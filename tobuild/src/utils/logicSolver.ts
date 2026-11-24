import { LogicNode, Wire } from '../types';
import { NodeArchetypes } from './nodeArchetypes';

export function updateDynamicGateHeight(node: LogicNode) {
  if (['and_gate', 'or_gate', 'xor_gate', 'nand_gate', 'nor_gate', 'xnor_gate'].includes(node.type)) {
    node.height = Math.max(45, (node.inputsCount + 1) * 15);
  }
}

export function recomputeDynamicBounds(node: LogicNode) {
  const portSpacing = 16;
  const maxPorts = Math.max(node.inputsCount, node.outputsCount);
  node.height = Math.max(120, (maxPorts + 1) * portSpacing);
}

export function evaluateNode(node: LogicNode, ticks: number) {
  if (node.type === 'custom_ic') {
    const icDef = node.customState?.icDef;
    if (!icDef) return;

    const inputCount = icDef.inputPins?.length || 0;
    const outputCount = icDef.outputPins?.length || 0;
    node.inputsCount = inputCount;
    node.outputsCount = outputCount;

    if (!node.inputs || node.inputs.length !== inputCount) {
      node.inputs = Array(inputCount).fill(false);
    }
    if (!node.outputs || node.outputs.length !== outputCount) {
      node.outputs = Array(outputCount).fill(false);
    }

    // Initialize internal instances if they do not exist
    if (!node.customState.internalNodes) {
      node.customState.internalNodes = (icDef.nodes || []).map((n: any) =>
        createNode(n.type, n.x, n.y, {
          id: n.id,
          label: n.label,
          inputsCount: n.inputsCount,
          customState: JSON.parse(JSON.stringify(n.customState || {}))
        })
      );
    }
    if (!node.customState.internalWires) {
      node.customState.internalWires = JSON.parse(JSON.stringify(icDef.wires || []));
    }

    const internalNodes = node.customState.internalNodes as LogicNode[];
    const internalWires = node.customState.internalWires as Wire[];

    // Map external inputs to corresponding internal input pin outputs
    const inputPins = icDef.inputPins || [];
    inputPins.forEach((pin: any, i: number) => {
      const internalInputNode = internalNodes.find((n) => n.id === pin.internalNodeId);
      if (internalInputNode) {
        if (!internalInputNode.outputs || internalInputNode.outputs.length === 0) {
          internalInputNode.outputs = [false];
        }
        internalInputNode.outputs[0] = !!node.inputs[i];
        if (!internalInputNode.customState) {
          internalInputNode.customState = {};
        }
        internalInputNode.customState.value = !!node.inputs[i];
      }
    });

    // Run subcircuit simulation step
    resolveCircuitSimulation(internalNodes, internalWires, ticks);

    // Map internal output pin inputs to external outputs
    const outputPins = icDef.outputPins || [];
    outputPins.forEach((pin: any, o: number) => {
      const internalOutputNode = internalNodes.find((n) => n.id === pin.internalNodeId);
      if (internalOutputNode) {
        node.outputs[o] = !!internalOutputNode.inputs?.[0];
      }
    });

    // Gather states of internal lightbulbs to render on the outside of the IC
    const ledBulbs = internalNodes.filter((n) => n.type === 'lightbulb');
    node.customState.ledStates = ledBulbs.map((n) => ({
      id: n.id,
      label: n.label,
      x: n.x,
      y: n.y,
      isHigh: !!n.inputs?.[0]
    }));

    return;
  }

  const arch = NodeArchetypes[node.type];
  if (!arch) return;

  // Sync inputs array length to inputsCount
  if (!node.inputs || node.inputs.length !== node.inputsCount) {
    const old = node.inputs || [];
    node.inputs = Array(node.inputsCount).fill(false);
    for (let i = 0; i < Math.min(old.length, node.inputsCount); i++) {
      node.inputs[i] = old[i] !== undefined ? old[i] : false;
    }
  }

  // Double-protect inputs array to stay free of undefined/null entries
  for (let i = 0; i < node.inputsCount; i++) {
    if (node.inputs[i] === undefined || node.inputs[i] === null) {
      node.inputs[i] = false;
    }
  }

  const outVal = arch.calc(node.inputs, node.customState, ticks);

  if (Array.isArray(outVal)) {
    node.outputs = outVal;
  } else if (node.outputsCount > 0) {
    node.outputs[0] = !!outVal;
  }
}

export function createNode(type: string, x: number, y: number, config: Partial<LogicNode> = {}): LogicNode {
  if (type === 'custom_ic') {
    const icDef = config.customState?.icDef;
    const inputsCount = icDef?.inputPins?.length || 0;
    const outputsCount = icDef?.outputPins?.length || 0;

    const node = new LogicNode(type, x, y, {
      id: config.id,
      label: config.label || icDef?.name || 'Custom IC',
      inputsCount,
      outputsCount,
      inputs: Array(inputsCount).fill(false),
      outputs: Array(outputsCount).fill(false),
      width: config.width || icDef?.width || 120,
      height: config.height || icDef?.height || 80,
      customState: JSON.parse(JSON.stringify(config.customState || {}))
    });

    if (node.customState.rotation === undefined) {
      node.customState.rotation = 0;
    }

    if (icDef) {
      if (!node.customState.internalNodes) {
        node.customState.internalNodes = (icDef.nodes || []).map((n: any) =>
          createNode(n.type, n.x, n.y, {
            id: n.id,
            label: n.label,
            inputsCount: n.inputsCount,
            customState: JSON.parse(JSON.stringify(n.customState || {}))
          })
        );
      }
      if (!node.customState.internalWires) {
        node.customState.internalWires = JSON.parse(JSON.stringify(icDef.wires || []));
      }
    }

    evaluateNode(node, 0);
    return node;
  }

  const arch = NodeArchetypes[type];
  if (!arch) {
    throw new Error(`Undeclared archetype: ${type}`);
  }

  const inputsCount = config.inputsCount !== undefined ? config.inputsCount : arch.inputs;
  const outputsCount = arch.outputs;

  const node = new LogicNode(type, x, y, {
    id: config.id,
    label: config.label || arch.name,
    inputsCount,
    outputsCount,
    inputs: Array(inputsCount).fill(false),
    outputs: Array(outputsCount).fill(false),
    width: arch.width,
    height: arch.height,
    customState: JSON.parse(JSON.stringify(config.customState || {}))
  });

  if (node.customState.rotation === undefined) {
    node.customState.rotation = 0;
  }

  if (type === 'clock' && !node.customState.period) {
    node.customState.period = 5;
  }

  if (type === 'dec_to_bin') {
    if (node.customState.activeDecimalValue === undefined) {
      node.customState.activeDecimalValue = 0;
    }
    if (node.customState.outputBits === undefined) {
      node.customState.outputBits = 4;
    }
    node.outputsCount = node.customState.outputBits;
    node.height = Math.max(165, (node.outputsCount + 1) * 16);
  }

  if (type === 'text_label') {
    node.label = config.label || 'Your Text Here';
  }

  if (type === 'configurable_ram') {
    if (node.customState.addressSize === undefined) {
      node.customState.addressSize = 4;
    }
    if (node.customState.wordSize === undefined) {
      node.customState.wordSize = 8;
    }
    node.inputsCount = node.customState.addressSize + node.customState.wordSize + 2;
    const tapped = node.customState.tappedAddresses || [];
    node.outputsCount = node.customState.wordSize + (node.customState.wordSize * tapped.length);
    recomputeDynamicBounds(node);
  }

  if (type === 'configurable_decoder') {
    if (node.customState.inputBits === undefined) {
      node.customState.inputBits = 3;
    }
    node.inputsCount = node.customState.inputBits;
    node.outputsCount = Math.pow(2, node.inputsCount);
    recomputeDynamicBounds(node);
  }

  if (type === 'configurable_mux') {
    if (node.customState.selectBits === undefined) {
      node.customState.selectBits = 2;
    }
    const dataBits = Math.pow(2, node.customState.selectBits);
    node.inputsCount = dataBits + node.customState.selectBits;
    node.outputsCount = 1;
    recomputeDynamicBounds(node);
  }

  updateDynamicGateHeight(node);

  // IMMEDIATELY evaluate (0) on creation!
  // This primes output pins instantly (e.g. NOR gates output true on spawn,
  // preventing them from being stuck at false on startup/pause!)
  evaluateNode(node, 0);

  return node;
}

export function resolveCircuitSimulation(nodes: LogicNode[], wires: Wire[], ticks: number) {
  // Reset input states in-place to prevent millions of array allocations at high speeds
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    
    // Ensure inputs array exists and is correct size
    if (!node.inputs || node.inputs.length !== node.inputsCount) {
      const old = node.inputs || [];
      node.inputs = Array(node.inputsCount).fill(false);
      for (let j = 0; j < Math.min(old.length, node.inputsCount); j++) {
        node.inputs[j] = old[j] !== undefined ? old[j] : false;
      }
    }
    
    for (let j = 0; j < node.inputs.length; j++) {
      node.inputs[j] = false;
    }
  }

  // Fast HashMap lookup
  const nodeMap = new Map<string, LogicNode>();
  for (let i = 0; i < nodes.length; i++) {
    nodeMap.set(nodes[i].id, nodes[i]);
  }

  // Flow wires outputs directly to target inputs
  for (let i = 0; i < wires.length; i++) {
    const wire = wires[i];
    const sourceNode = nodeMap.get(wire.from);
    if (sourceNode && wire.fromPort < sourceNode.outputs.length) {
      const value = sourceNode.outputs[wire.fromPort];
      const targetNode = nodeMap.get(wire.to);
      if (targetNode && wire.toPort < targetNode.inputs.length) {
        if (value) {
          targetNode.inputs[wire.toPort] = true;
        }
      }
    }
  }

  // Evaluate nodes
  for (let i = 0; i < nodes.length; i++) {
    evaluateNode(nodes[i], ticks);
  }
}

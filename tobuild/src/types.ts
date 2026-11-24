export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Wire {
  from: string;
  fromPort: number;
  to: string;
  toPort: number;
}

export interface CustomNodeState {
  rotation?: number;
  value?: boolean; // toggle or pushbutton
  period?: number; // clock
  underflowSafety?: boolean; // subtractor clamp safety
  
  // configurable ram
  addressSize?: number;
  wordSize?: number;
  memory?: Record<number, boolean[]>;
  activeAddrDecimal?: number;
  activeDataOut?: boolean[];
  lastClk?: boolean;
  zeroRegisterEnabled?: boolean;
  isZeroRegister?: boolean;
  tappedAddresses?: number[];
  tappedAddressesRaw?: string;
  
  // configurable decoder
  inputBits?: number;
  activeIdx?: number;
  
  // configurable mux
  selectBits?: number;
  
  // pixel display
  frontBuffer?: Record<number, boolean>;
  backBuffer?: Record<number, boolean>;
  lastDrw?: boolean;
  lastClr?: boolean;
  lastPsh?: boolean;
  lastWip?: boolean;
  
  // ascii display
  text?: string;
  
  // dec to bin
  activeDecimalValue?: number;
  outputBits?: number;
  
  // display decimal
  renderedDecimalValue?: number;
  
  // seven segment
  currentHexVal?: number;

  // prefab dlatch
  storedValues?: boolean[];

  // bresenham gpu line drawer
  lastDraw?: boolean;
  cx?: number;
  cy?: number;
  tx?: number;
  ty?: number;
  busy?: boolean;
  err?: number;
  dx?: number;
  dy?: number;
  sx?: number;
  sy?: number;

  // custom ic types
  icDef?: any; // CustomICDef
  icId?: string;
  internalNodes?: any[]; // LogicNode[]
  internalWires?: any[]; // Wire[]
  pinLabel?: string;
  pinSide?: string;
  pinOrder?: number;
  ledStates?: any[];
}

export interface NodeArchetype {
  name: string;
  width: number;
  height: number;
  inputs: number;
  outputs: number;
  color: string;
  interactive?: boolean;
  onClick?: (node: LogicNode, lx: number, ly: number) => void;
  onPress?: (node: LogicNode, lx: number, ly: number) => void;
  onRelease?: (node: LogicNode, lx: number, ly: number) => void;
  calc: (inputs: boolean[], customState: CustomNodeState, ticks: number) => boolean[] | boolean | null;
  inputLabels?: string[];
  outputLabels?: string[];
}

export class LogicNode {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
  width: number;
  height: number;
  inputsCount: number;
  outputsCount: number;
  inputs: boolean[];
  outputs: boolean[];
  customState: CustomNodeState;

  constructor(type: string, x: number, y: number, customConfig: Partial<LogicNode> = {}) {
    this.id = customConfig.id || 'node_' + Math.random().toString(36).substring(2, 11);
    this.type = type;
    this.x = x;
    this.y = y;
    this.label = customConfig.label || '';
    this.inputsCount = customConfig.inputsCount !== undefined ? customConfig.inputsCount : 0;
    this.outputsCount = customConfig.outputsCount !== undefined ? customConfig.outputsCount : 0;
    this.inputs = customConfig.inputs || [];
    this.outputs = customConfig.outputs || [];
    this.customState = customConfig.customState || {};
    this.width = customConfig.width || 50;
    this.height = customConfig.height || 50;
  }
}

export interface Prefab {
  name: string;
  nodes: Array<{
    type: string;
    x: number;
    y: number;
    label: string;
    inputsCount: number;
    customState: CustomNodeState;
  }>;
  wires: Array<{
    fromIndex: number;
    fromPort: number;
    toIndex: number;
    toPort: number;
  }>;
}

export interface CustomICDef {
  id: string;
  name: string;
  color: string;
  width: number;
  height: number;
  inputPins: CustomICPin[];
  outputPins: CustomICPin[];
  nodes: any[]; // subcircuit nodes
  wires: Wire[]; // subcircuit wires
  packageStyle?: string;
  ledPositions?: Record<string, { x: number; y: number }>;
}

export interface CustomICPin {
  id: string;
  label: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  order: number;
  internalNodeId: string;
}

export interface Workspace {
  id: string;
  name: string;
  nodes: LogicNode[];
  wires: Wire[];
  camera: Camera;
  undoStack: string[];
  redoStack: string[];
}

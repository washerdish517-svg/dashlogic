import { NodeArchetype, LogicNode } from '../types';

export const NodeArchetypes: Record<string, NodeArchetype> = {
  // --- COMBINATIONAL LOGIC GATES ---
  and_gate: {
    name: 'AND Gate',
    width: 60,
    height: 50,
    inputs: 2,
    outputs: 1,
    color: '#89b4fa',
    calc: (inputs) => inputs.every(val => val === true)
  },
  or_gate: {
    name: 'OR Gate',
    width: 60,
    height: 50,
    inputs: 2,
    outputs: 1,
    color: '#a6e3a1',
    calc: (inputs) => inputs.some(val => val === true)
  },
  not_gate: {
    name: 'NOT Gate',
    width: 55,
    height: 40,
    inputs: 1,
    outputs: 1,
    color: '#f38ba8',
    calc: (inputs) => !inputs[0]
  },
  xor_gate: {
    name: 'XOR Gate',
    width: 65,
    height: 50,
    inputs: 2,
    outputs: 1,
    color: '#f9e2af',
    calc: (inputs) => inputs.filter(v => v === true).length % 2 !== 0
  },
  nand_gate: {
    name: 'NAND Gate',
    width: 65,
    height: 50,
    inputs: 2,
    outputs: 1,
    color: '#eba0ac',
    calc: (inputs) => !inputs.every(val => val === true)
  },
  nor_gate: {
    name: 'NOR Gate',
    width: 65,
    height: 50,
    inputs: 2,
    outputs: 1,
    color: '#cba6f7',
    calc: (inputs) => !inputs.some(val => val === true)
  },
  xnor_gate: {
    name: 'XNOR Gate',
    width: 70,
    height: 50,
    inputs: 2,
    outputs: 1,
    color: '#74c7ec',
    calc: (inputs) => inputs.filter(v => v === true).length % 2 === 0
  },

  // --- INTERACTIVE INPUTS / OUTPUTS ---
  toggle: {
    name: 'Toggle Switch',
    width: 50,
    height: 50,
    inputs: 0,
    outputs: 1,
    color: '#a6e3a1',
    interactive: true,
    onClick: (node: LogicNode) => {
      node.customState.value = !node.customState.value;
    },
    calc: (_inputs, customState) => !!customState.value
  },
  pushbutton: {
    name: 'Push Button',
    width: 50,
    height: 50,
    inputs: 0,
    outputs: 1,
    color: '#f9e2af',
    interactive: true,
    onPress: (node: LogicNode) => {
      node.customState.value = true;
    },
    onRelease: (node: LogicNode) => {
      node.customState.value = false;
    },
    calc: (_inputs, customState) => !!customState.value
  },
  lightbulb: {
    name: 'LED Status Bulb',
    width: 50,
    height: 50,
    inputs: 1,
    outputs: 0,
    color: '#cba6f7',
    calc: (inputs) => !!inputs[0]
  },
  clock: {
    name: 'System Clock',
    width: 60,
    height: 50,
    inputs: 0,
    outputs: 1,
    color: '#89b4fa',
    calc: (_inputs, customState, ticks) => {
      const p = customState.period || 5;
      return Math.floor(ticks / p) % 2 === 0;
    }
  },
  junction: {
    name: 'Junction Dot',
    width: 14,
    height: 14,
    inputs: 1,
    outputs: 1,
    color: '#cba6f7',
    calc: (inputs) => !!inputs[0]
  },

  // --- TEXT LABELS ---
  text_label: {
    name: 'Text Label',
    width: 100,
    height: 40,
    inputs: 0,
    outputs: 0,
    color: 'transparent',
    calc: () => null
  },

  // --- CONFIGURABLE ARITHMETIC & IC MODULES ---
  configurable_ram: {
    name: 'Configurable RAM',
    width: 170,
    height: 200,
    inputs: 14, // Address + Data + 2 control pins (WE, CLK)
    outputs: 8,
    color: '#f5a97f',
    calc: (inputs, customState) => {
      const addrSize = customState.addressSize || 4;
      const wordSize = customState.wordSize || 8;
      
      if (!customState.memory) {
        customState.memory = {};
      }

      // Read Address pins: Inputs [0 ... addrSize-1]
      let activeAddr = 0;
      for (let i = 0; i < addrSize; i++) {
        if (inputs[i]) {
          activeAddr += Math.pow(2, i);
        }
      }
      customState.activeAddrDecimal = activeAddr;

      // Read Data In pins: Inputs [addrSize ... addrSize + wordSize - 1]
      const activeDataIn = [];
      for (let i = 0; i < wordSize; i++) {
        activeDataIn.push(!!inputs[addrSize + i]);
      }

      // WE (Write Enable): pin (addrSize + wordSize)
      const weVal = !!inputs[addrSize + wordSize];
      // CLK (Clock): pin (addrSize + wordSize + 1)
      const clkVal = !!inputs[addrSize + wordSize + 1];

      // Edge triggered logic: detect positive clock transition (rising edge)
      const lastClk = customState.lastClk !== undefined ? customState.lastClk : false;
      const isRisingEdge = clkVal && !lastClk;
      customState.lastClk = clkVal;

      if (weVal && isRisingEdge) {
        if (!(customState.zeroRegisterEnabled && activeAddr === 0)) {
          customState.memory[activeAddr] = [...activeDataIn];
        }
      }

      // Always Output values stored at activeAddr
      let storedValue = customState.memory[activeAddr] || Array(wordSize).fill(false);
      if (customState.zeroRegisterEnabled && activeAddr === 0) {
        storedValue = Array(wordSize).fill(false);
      }
      customState.activeDataOut = storedValue;

      const outputs = [...storedValue];
      const tapped = customState.tappedAddresses || [];
      for (const tAddr of tapped) {
        let tVal = customState.memory[tAddr] || Array(wordSize).fill(false);
        if (customState.zeroRegisterEnabled && tAddr === 0) {
          tVal = Array(wordSize).fill(false);
        }
        outputs.push(...tVal);
      }
      return outputs;
    }
  },

  configurable_decoder: {
    name: 'Binary Decoder',
    width: 120,
    height: 140,
    inputs: 3,
    outputs: 8,
    color: '#89dceb',
    calc: (inputs, customState) => {
      const bits = customState.inputBits || 3;
      let activeIdx = 0;
      for (let i = 0; i < bits; i++) {
        if (inputs[i]) {
          activeIdx += Math.pow(2, i);
        }
      }
      customState.activeIdx = activeIdx;
      
      const outputsCount = Math.pow(2, bits);
      const out = Array(outputsCount).fill(false);
      if (activeIdx < outputsCount) out[activeIdx] = true;
      return out;
    }
  },

  configurable_mux: {
    name: 'Configurable MUX',
    width: 120,
    height: 180,
    inputs: 6, // data bits + select bits
    outputs: 1,
    color: '#f9e2af',
    calc: (inputs, customState) => {
      const selBits = customState.selectBits || 2;
      const dataBits = Math.pow(2, selBits);
      
      let selValue = 0;
      for (let i = 0; i < selBits; i++) {
        if (inputs[dataBits + i]) {
          selValue += Math.pow(2, i);
        }
      }
      
      const mappedIdx = selValue;
      return [!!inputs[mappedIdx]];
    }
  },

  pixel_display: {
    name: '256x256 GPU Screen',
    width: 310,
    height: 380,
    inputs: 20,
    outputs: 1,
    color: '#f38ba8',
    inputLabels: ['X0','X1','X2','X3','X4','X5','X6','X7', 'Y0','Y1','Y2','Y3','Y4','Y5','Y6','Y7', 'DRW','CLR','PSH','WIP'],
    outputLabels: ['PXL'],
    calc: (inputs, customState) => {
      if (!customState.frontBuffer) customState.frontBuffer = {};
      if (!customState.backBuffer) customState.backBuffer = {};

      let x = 0, y = 0;
      for (let i = 0; i < 8; i++) {
        if (inputs[i]) x |= (1 << i);
        if (inputs[i+8]) y |= (1 << i);
      }
      const idx = (y << 8) | x;

      const drw = !!inputs[16];
      const clr = !!inputs[17];
      const psh = !!inputs[18];
      const wip = !!inputs[19];

      if (drw && !customState.lastDrw) customState.backBuffer[idx] = true;
      if (clr && !customState.lastClr) delete customState.backBuffer[idx];
      if (wip && !customState.lastWip) {
        customState.backBuffer = {};
        customState.frontBuffer = {};
      }
      if (psh && !customState.lastPsh) {
        customState.frontBuffer = Object.assign({}, customState.backBuffer);
      }

      customState.lastDrw = drw;
      customState.lastClr = clr;
      customState.lastPsh = psh;
      customState.lastWip = wip;

      return [!!customState.frontBuffer[idx]];
    }
  },

  ascii_display: {
    name: 'ASCII Terminal',
    width: 220,
    height: 220,
    inputs: 10,
    outputs: 0,
    color: '#a6e3a1',
    inputLabels: ['B0','B1','B2','B3','B4','B5','B6','B7','PSH','CLR'],
    calc: (inputs, customState) => {
      if (customState.text === undefined) customState.text = '';

      let charCode = 0;
      for (let i = 0; i < 8; i++) {
        if (inputs[i]) charCode |= (1 << i);
      }

      const psh = !!inputs[8];
      const clr = !!inputs[9];

      if (psh && !customState.lastPsh) {
        if (charCode === 8) { // Backspace
          customState.text = customState.text.slice(0, -1);
        } else if (charCode === 10) { // Newline
          customState.text += '\n';
        } else if (charCode >= 32 && charCode <= 126) {
          customState.text += String.fromCharCode(charCode);
        }
        
        if (customState.text.length > 512) {
          customState.text = customState.text.slice(-512);
        }
      }

      if (clr && !customState.lastClr) {
        customState.text = '';
      }

      customState.lastPsh = psh;
      customState.lastClr = clr;

      return null;
    }
  },

  prefab_8bit_dlatch: {
    name: '8-Bit D-Latch Register',
    width: 140,
    height: 240,
    inputs: 10, // D0..7, CLK, EN
    outputs: 8, // Q0..7
    color: '#f5c2e7',
    inputLabels: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'CLK', 'EN'],
    outputLabels: ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
    calc: (inputs, customState) => {
      if (!customState.storedValues) {
        customState.storedValues = Array(8).fill(false);
      }
      if (customState.isZeroRegister) {
        return Array(8).fill(false);
      }
      const clockVal = !!inputs[8];
      const enableVal = inputs.length > 9 ? !!inputs[9] : true;
      
      const lastClk = customState.lastClk !== undefined ? customState.lastClk : false;
      const isRisingEdge = clockVal && !lastClk;
      customState.lastClk = clockVal;

      if (enableVal && isRisingEdge) {
        for (let i = 0; i < 8; i++) {
          customState.storedValues[i] = !!inputs[i];
        }
      }
      
      return [...customState.storedValues];
    }
  },

  prefab_8bit_cla: {
    name: '8-Bit Adder (CLA ALU)',
    width: 160,
    height: 380,
    inputs: 17, // Pin 0..7 A, Pin 8..15 B, Pin 16 Cin
    outputs: 9, // S0..S7, Cout
    color: '#89dceb',
    inputLabels: [
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
      'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
      'Cin'
    ],
    outputLabels: [
      'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7',
      'Cout'
    ],
    calc: (inputs) => {
      const A = inputs.slice(0, 8).map(v => !!v);
      const B = inputs.slice(8, 16).map(v => !!v);
      const Cin = !!inputs[16];

      const G = Array(8);
      const P = Array(8);
      const C = Array(9);

      for (let i = 0; i < 8; i++) {
        G[i] = A[i] && B[i];
        P[i] = A[i] || B[i];
      }

      C[0] = Cin;
      for (let i = 0; i < 8; i++) {
        C[i+1] = G[i] || (P[i] && C[i]);
      }

      const S = Array(8);
      for (let i = 0; i < 8; i++) {
        S[i] = (A[i] !== B[i]) !== C[i];
      }

      const Cout = C[8];
      return [...S, Cout];
    }
  },

  dec_to_bin: {
    name: 'Decimal Numpad',
    width: 100,
    height: 165,
    inputs: 0,
    outputs: 4,
    color: '#a6e3a1',
    interactive: true,
    onClick: (node, lx, ly) => {
      if (ly >= 65 && ly <= 155) {
        const col = Math.floor((lx - 8) / 30);
        const row = Math.floor((ly - 65) / 24);
        if (col >= 0 && col < 3 && row >= 0 && row < 4) {
          const layout = [
            ['7', '8', '9'],
            ['4', '5', '6'],
            ['1', '2', '3'],
            ['C', '0', '0']
          ];
          let key = layout[row][col];
          if (row === 3 && col > 0) key = '0';
          
          if (key === 'C') {
            node.customState.activeDecimalValue = 0;
          } else {
            const current = node.customState.activeDecimalValue || 0;
            const digit = parseInt(key);
            if (current < 1000000) {
              node.customState.activeDecimalValue = current * 10 + digit;
            }
          }
        }
      }
    },
    calc: (_inputs, customState) => {
      const num = customState.activeDecimalValue || 0;
      const bits = customState.outputBits || 4;
      const out = [];
      for (let i = 0; i < bits; i++) {
        out.push(!!(num & (1 << i)));
      }
      return out;
    }
  },

  display_decimal: {
    name: 'Decimal Integer Display',
    width: 130,
    height: 100,
    inputs: 8,
    outputs: 0,
    color: '#f5c2e7',
    inputLabels: ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'],
    calc: (inputs, customState) => {
      let value = 0;
      for (let i = 0; i < 8; i++) {
        if (inputs[i]) {
          value += Math.pow(2, i);
        }
      }
      customState.renderedDecimalValue = value;
      return null;
    }
  },

  seven_segment: {
    name: '7-Segment Hex Display',
    width: 120,
    height: 180,
    inputs: 4,
    outputs: 0,
    color: '#f5a97f',
    inputLabels: ['A', 'B', 'C', 'D'],
    calc: (inputs, customState) => {
      let val = 0;
      if (inputs[0]) val += 1;
      if (inputs[1]) val += 2;
      if (inputs[2]) val += 4;
      if (inputs[3]) val += 8;
      customState.currentHexVal = val;
      return null;
    }
  },

  prefab_8bit_mult: {
    name: '8-Bit High-Speed Multiplier',
    width: 160,
    height: 380,
    inputs: 16,
    outputs: 16,
    color: '#eba0ac',
    inputLabels: [
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
      'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'
    ],
    outputLabels: [
      'P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',
      'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15'
    ],
    calc: (inputs) => {
      let valA = 0;
      let valB = 0;
      for (let i = 0; i < 8; i++) {
        if (inputs[i]) valA |= (1 << i);
        if (inputs[8 + i]) valB |= (1 << i);
      }
      // Since js holds up to 32-bit integers perfectly, 8-bit * 8-bit operation is fully precise
      const prod = valA * valB;
      const out = [];
      for (let i = 0; i < 16; i++) {
        out.push(!!(prod & (1 << i)));
      }
      return out;
    }
  },

  prefab_8bit_div: {
    name: '8-Bit High-Speed Divider',
    width: 160,
    height: 380,
    inputs: 16,
    outputs: 16,
    color: '#f5c2e7',
    inputLabels: [
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
      'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'
    ],
    outputLabels: [
      'Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7',
      'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'
    ],
    calc: (inputs) => {
      let valA = 0;
      let valB = 0;
      for (let i = 0; i < 8; i++) {
        if (inputs[i]) valA |= (1 << i);
        if (inputs[8 + i]) valB |= (1 << i);
      }
      let quotient = 0;
      let remainder = 0;
      if (valB !== 0) {
        quotient = Math.floor(valA / valB);
        remainder = valA % valB;
      }
      const out = [];
      for (let i = 0; i < 8; i++) {
        out.push(!!(quotient & (1 << i)));
      }
      for (let i = 0; i < 8; i++) {
        out.push(!!(remainder & (1 << i)));
      }
      return out;
    }
  },

  prefab_8bit_cla_sub: {
    name: '8-Bit Subtractor (CLA Borrow)',
    width: 160,
    height: 380,
    inputs: 17,
    outputs: 9,
    color: '#eba0ac',
    inputLabels: [
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
      'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
      'Bin'
    ],
    outputLabels: [
      'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7',
      'Bout'
    ],
    calc: (inputs, customState) => {
      const A = inputs.slice(0, 8).map(v => !!v);
      const B = inputs.slice(8, 16).map(v => !!v);
      const Bin = !!inputs[16];

      // Convert inputs to numbers to evaluate absolute value for safety checks
      let valA = 0;
      let valB = 0;
      for (let i = 0; i < 8; i++) {
        if (A[i]) valA |= (1 << i);
        if (B[i]) valB |= (1 << i);
      }
      const binVal = Bin ? 1 : 0;

      const isUnderflow = valA < (valB + binVal);
      const safetyActive = !customState || customState.underflowSafety !== false;

      let D = Array(8);
      let Bout = false;

      if (safetyActive && isUnderflow) {
        D.fill(false);
        Bout = true;
      } else {
        const G = Array(8);
        const P = Array(8);
        const C = Array(9);

        for (let i = 0; i < 8; i++) {
          G[i] = !A[i] && B[i];
          P[i] = !A[i] || B[i];
        }

        C[0] = Bin;
        for (let i = 0; i < 8; i++) {
          C[i+1] = G[i] || (P[i] && C[i]);
        }

        for (let i = 0; i < 8; i++) {
          D[i] = (A[i] !== B[i]) !== C[i];
        }

        Bout = C[8];
      }

      return [...D, Bout];
    }
  },

  comparator: {
    name: '8-Bit Comparator',
    width: 160,
    height: 380,
    inputs: 16,
    outputs: 3,
    color: '#89b4fa',
    inputLabels: [
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
      'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'
    ],
    outputLabels: ['A > B', 'B > A', 'A = B'],
    calc: (inputs) => {
      let valA = 0;
      let valB = 0;
      for (let i = 0; i < 8; i++) {
        if (inputs[i]) valA |= (1 << i);
        if (inputs[8 + i]) valB |= (1 << i);
      }
      const gt = valA > valB;
      const lt = valA < valB;
      const eq = valA === valB;
      return [gt, lt, eq];
    }
  },

  custom_ic: {
    name: 'Custom IC',
    width: 120,
    height: 80,
    inputs: 0,
    outputs: 0,
    color: '#1e1e2e',
    calc: () => null
  },
  ic_input_pin: {
    name: 'IC Input Pin',
    width: 60,
    height: 40,
    inputs: 0,
    outputs: 1,
    color: '#cba6f7',
    calc: (_inputs, customState) => !!customState.value
  },
  ic_output_pin: {
    name: 'IC Output Pin',
    width: 60,
    height: 40,
    inputs: 1,
    outputs: 0,
    color: '#f38ba8',
    calc: (inputs) => !!inputs[0]
  }
};

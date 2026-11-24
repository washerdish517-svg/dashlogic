import { Workspace, LogicNode, Wire } from '../types';
import { createNode } from './logicSolver';

export function getRegisterFileWorkspace(): Workspace {
  const nodes: LogicNode[] = [];
  const wires: Wire[] = [];

  // Descriptive headers
  const title = createNode('text_label', 100, 40, { label: 'Discrete Dual-Read 16x8 Register File (4-Bit Address, 8-Bit Word)' });
  const desc = createNode('text_label', 100, 80, { label: 'Simulated using 16 individual 8-Bit D-Latch Registers, a 4-to-16 Write Decoder, and dual parallel 16-to-1 MUX banks for simultaneous, independent reading. R0 is hardwired to 0.' });
  nodes.push(title, desc);

  // 1. Read Address A Toggles (4-bit address)
  const raToggles: LogicNode[] = [];
  for (let i = 0; i < 4; i++) {
    const toggle = createNode('toggle', 100, 160 + i * 65, { label: `Read Addr A [${i}]` });
    raToggles.push(toggle);
    nodes.push(toggle);
  }

  // 2. Read Address B Toggles (4-bit address)
  const rbToggles: LogicNode[] = [];
  for (let i = 0; i < 4; i++) {
    const toggle = createNode('toggle', 100, 460 + i * 65, { label: `Read Addr B [${i}]` });
    rbToggles.push(toggle);
    nodes.push(toggle);
  }

  // 3. Write Address Toggles (4-bit address)
  const waToggles: LogicNode[] = [];
  for (let i = 0; i < 4; i++) {
    const toggle = createNode('toggle', 100, 760 + i * 65, { label: `Write Addr [${i}]` });
    waToggles.push(toggle);
    nodes.push(toggle);
  }

  // 4. Write Enable and Clock controls
  const weToggle = createNode('toggle', 100, 1050, { label: 'Write Enable (WE)' });
  const clkBtn = createNode('pushbutton', 100, 1130, { label: 'Clock Pulse (CLK)' });
  nodes.push(weToggle, clkBtn);

  // 5. Data In Toggles (8-bit word)
  const diToggles: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const toggle = createNode('toggle', 280, 160 + i * 65, { label: `Data In [${i}]` });
    diToggles.push(toggle);
    nodes.push(toggle);
  }

  // 6. Gating & Write Decoder
  const gatedClockAnd = createNode('and_gate', 460, 1050, { label: 'CLK AND WE Gating', inputsCount: 2 });
  nodes.push(gatedClockAnd);

  const writeDecoder = createNode('configurable_decoder', 460, 760, {
    label: '4-to-16 Write Decoder',
    customState: { inputBits: 4 }
  });
  nodes.push(writeDecoder);

  // 7. Registers R0 to R15
  const registers: LogicNode[] = [];
  for (let r = 0; r < 16; r++) {
    const isR0 = r === 0;
    const reg = createNode('prefab_8bit_dlatch', 720, 160 + r * 280, {
      label: `Register R${r}${isR0 ? ' (Zero Register)' : ''}`,
      customState: { isZeroRegister: isR0 }
    });
    registers.push(reg);
    nodes.push(reg);
  }

  // 8. Multiplexers (Port A and Port B)
  const muxesA: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const mux = createNode('configurable_mux', 1100, 160 + i * 240, {
      label: `Mux A Bit ${i}`,
      customState: { selectBits: 4 }
    });
    muxesA.push(mux);
    nodes.push(mux);
  }

  const muxesB: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const mux = createNode('configurable_mux', 1400, 160 + i * 240, {
      label: `Mux B Bit ${i}`,
      customState: { selectBits: 4 }
    });
    muxesB.push(mux);
    nodes.push(mux);
  }

  // 9. Displays and LEDs
  const displayA = createNode('display_decimal', 1720, 200, { label: 'Port A Decimal Value' });
  const displayB = createNode('display_decimal', 1720, 700, { label: 'Port B Decimal Value' });
  nodes.push(displayA, displayB);

  const ledsA: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const led = createNode('lightbulb', 1920, 160 + i * 65, { label: `OutA[${i}]` });
    ledsA.push(led);
    nodes.push(led);
  }

  const ledsB: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const led = createNode('lightbulb', 1920, 720 + i * 65, { label: `OutB[${i}]` });
    ledsB.push(led);
    nodes.push(led);
  }

  // --- CONNECTING THE WIRE MESH ---

  // Connect Write Enable (WE) and CLK to Gating AND Gate
  wires.push({ from: weToggle.id, fromPort: 0, to: gatedClockAnd.id, toPort: 0 });
  wires.push({ from: clkBtn.id, fromPort: 0, to: gatedClockAnd.id, toPort: 1 });

  // Connect Write Address to Decoder
  for (let i = 0; i < 4; i++) {
    wires.push({ from: waToggles[i].id, fromPort: 0, to: writeDecoder.id, toPort: i });
  }

  // Connect Gated Clock, Write Decoder, and Data In to Registers
  for (let r = 0; r < 16; r++) {
    // CLK to port 8
    wires.push({ from: gatedClockAnd.id, fromPort: 0, to: registers[r].id, toPort: 8 });
    // EN to port 9
    wires.push({ from: writeDecoder.id, fromPort: r, to: registers[r].id, toPort: 9 });
    // Data In D0..D7 to ports 0..7
    for (let i = 0; i < 8; i++) {
      wires.push({ from: diToggles[i].id, fromPort: 0, to: registers[r].id, toPort: i });
    }
  }

  // Connect Read Addr A to Mux A Select lines (ports 16..19)
  // Connect Read Addr B to Mux B Select lines (ports 16..19)
  for (let bit = 0; bit < 8; bit++) {
    for (let i = 0; i < 4; i++) {
      wires.push({ from: raToggles[i].id, fromPort: 0, to: muxesA[bit].id, toPort: 16 + i });
      wires.push({ from: rbToggles[i].id, fromPort: 0, to: muxesB[bit].id, toPort: 16 + i });
    }
  }

  // Connect Register Outputs to Mux Data inputs (ports 0..15)
  for (let r = 0; r < 16; r++) {
    for (let bit = 0; bit < 8; bit++) {
      wires.push({ from: registers[r].id, fromPort: bit, to: muxesA[bit].id, toPort: r });
      wires.push({ from: registers[r].id, fromPort: bit, to: muxesB[bit].id, toPort: r });
    }
  }

  // Connect Mux Outputs to LED & Decimal display inputs
  for (let bit = 0; bit < 8; bit++) {
    wires.push({ from: muxesA[bit].id, fromPort: 0, to: displayA.id, toPort: bit });
    wires.push({ from: muxesA[bit].id, fromPort: 0, to: ledsA[bit].id, toPort: 0 });

    wires.push({ from: muxesB[bit].id, fromPort: 0, to: displayB.id, toPort: bit });
    wires.push({ from: muxesB[bit].id, fromPort: 0, to: ledsB[bit].id, toPort: 0 });
  }

  return {
    id: 'ws_register_file',
    name: 'Dual-Read Register File',
    nodes,
    wires,
    camera: { x: 50, y: 150, zoom: 0.35 },
    undoStack: [],
    redoStack: []
  };
}

export function getStarterWorkspace(): Workspace {
  const nodes: LogicNode[] = [];
  const wires: Wire[] = [];

  // --- HALF ADDER DEMO ---
  const toggleA = createNode('toggle', 100, 150, { label: 'Input A' });
  const toggleB = createNode('toggle', 100, 290, { label: 'Input B' });
  
  const xorGate = createNode('xor_gate', 280, 140, { label: 'Sum Logic' });
  const andGate = createNode('and_gate', 280, 270, { label: 'Carry Logic' });

  const sumBulb = createNode('lightbulb', 450, 145, { label: 'SUM Output' });
  const carryBulb = createNode('lightbulb', 450, 275, { label: 'CARRY Output' });

  nodes.push(toggleA, toggleB, xorGate, andGate, sumBulb, carryBulb);

  wires.push(
    { from: toggleA.id, fromPort: 0, to: xorGate.id, toPort: 0 },
    { from: toggleB.id, fromPort: 0, to: xorGate.id, toPort: 1 },
    { from: toggleA.id, fromPort: 0, to: andGate.id, toPort: 0 },
    { from: toggleB.id, fromPort: 0, to: andGate.id, toPort: 1 },
    { from: xorGate.id, fromPort: 0, to: sumBulb.id, toPort: 0 },
    { from: andGate.id, fromPort: 0, to: carryBulb.id, toPort: 0 }
  );

  // --- CLOCK LED DEMO ---
  const clock = createNode('clock', 100, 480, { label: 'System Clock' });
  clock.customState.period = 3;
  const lightBulbClock = createNode('lightbulb', 260, 480, { label: 'Clock LED' });
  nodes.push(clock, lightBulbClock);

  wires.push(
    { from: clock.id, fromPort: 0, to: lightBulbClock.id, toPort: 0 }
  );

  // --- COMPONENT KEYPAD & 7-SEGMENT DEMO ---
  const decToBin = createNode('dec_to_bin', 600, 150, { label: 'Numpad Input Block' });
  const segHex = createNode('seven_segment', 850, 130, { label: 'Display Output Board' });
  nodes.push(decToBin, segHex);
  
  wires.push(
    { from: decToBin.id, fromPort: 0, to: segHex.id, toPort: 0 },
    { from: decToBin.id, fromPort: 1, to: segHex.id, toPort: 1 },
    { from: decToBin.id, fromPort: 2, to: segHex.id, toPort: 2 },
    { from: decToBin.id, fromPort: 3, to: segHex.id, toPort: 3 }
  );

  return {
    id: 'ws_starter',
    name: 'Main Board',
    nodes,
    wires,
    camera: { x: 80, y: 50, zoom: 0.95 },
    undoStack: [],
    redoStack: []
  };
}

export function getMemoryMappedWorkspace(): Workspace {
  const nodes: LogicNode[] = [];
  const wires: Wire[] = [];

  // Descriptive headers
  const title = createNode('text_label', 100, 40, {
    label: 'Tappable 256x8-Bit Data Memory'
  });
  const desc = createNode('text_label', 100, 80, {
    label: 'A complete 8-bit Address, 8-bit Word Register Memory containing 256 locations (R0-R255). You can edit the "Tapped Addresses" property in the inspector on the right to dynamically expose specific register lines as physical output pins!'
  });
  nodes.push(title, desc);

  // 1. 8-Bit Address Bus Toggles (A0..A7)
  const addrToggles: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const toggle = createNode('toggle', 100, 150 + i * 65, { label: `Addr Bus A[${i}]` });
    addrToggles.push(toggle);
    nodes.push(toggle);
  }

  // 2. 8-Bit Data Bus Toggles (D0..D7)
  const dataToggles: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const toggle = createNode('toggle', 280, 150 + i * 65, { label: `Data Bus D[${i}]` });
    dataToggles.push(toggle);
    nodes.push(toggle);
  }

  // 3. Control Inputs
  const weToggle = createNode('toggle', 100, 700, { label: 'Write Enable (WE)' });
  const clkBtn = createNode('pushbutton', 280, 700, { label: 'Clock Pulse (CLK)' });
  nodes.push(weToggle, clkBtn);

  // 4. One Unified Tappable 256x8-Bit RAM Block
  const ramBlock = createNode('configurable_ram', 480, 220, {
    label: 'Tappable 256-Reg Memory',
    customState: {
      addressSize: 8,
      wordSize: 8,
      zeroRegisterEnabled: true,
      tappedAddresses: [240],
      tappedAddressesRaw: '240',
      memory: {
        // Pre-fill some registers for visual interest
        0: [false, false, false, false, false, false, false, false], // hardwired 0
        1: [true, false, true, false, true, false, true, false],   // 170 / 0xAA
        2: [false, true, false, true, false, true, false, true],   // 85 / 0x55
        240: [true, true, true, true, false, false, false, false], // 15 / 0x0F
      }
    }
  });
  // Manually configure properties for initial state
  ramBlock.inputsCount = 18; // 8 + 8 + 2
  ramBlock.outputsCount = 16; // 8 standard + 8 tapped
  nodes.push(ramBlock);

  // 5. Selected Address Read Value Display & LEDs
  const readDisplay = createNode('display_decimal', 800, 150, {
    label: 'Selected Addr Value'
  });
  nodes.push(readDisplay);

  const readLeds: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const led = createNode('lightbulb', 1040, 150 + i * 65, { label: `Read Out Q[${i}]` });
    readLeds.push(led);
    nodes.push(led);
  }

  // 6. Tapped Address 240 Value Display & LEDs
  const tappedDisplay = createNode('display_decimal', 800, 700, {
    label: 'Tapped Addr 240 Value'
  });
  nodes.push(tappedDisplay);

  const tappedLeds: LogicNode[] = [];
  for (let i = 0; i < 8; i++) {
    const led = createNode('lightbulb', 1040, 700 + i * 65, { label: `Tap 240 [${i}]` });
    tappedLeds.push(led);
    nodes.push(led);
  }

  // --- WIRE CONNECTIONS ---

  // Connect Address Bus A0..A7 to Memory Inputs 0..7
  for (let i = 0; i < 8; i++) {
    wires.push({ from: addrToggles[i].id, fromPort: 0, to: ramBlock.id, toPort: i });
  }

  // Connect Data Bus D0..D7 to Memory Inputs 8..15
  for (let i = 0; i < 8; i++) {
    wires.push({ from: dataToggles[i].id, fromPort: 0, to: ramBlock.id, toPort: 8 + i });
  }

  // Connect WE (WE is input 16)
  wires.push({ from: weToggle.id, fromPort: 0, to: ramBlock.id, toPort: 16 });

  // Connect CLK (CLK is input 17)
  wires.push({ from: clkBtn.id, fromPort: 0, to: ramBlock.id, toPort: 17 });

  // Connect standard RAM outputs Q0..Q7 (outputs 0..7) to Read Value Display and LEDs
  for (let i = 0; i < 8; i++) {
    wires.push({ from: ramBlock.id, fromPort: i, to: readDisplay.id, toPort: i });
    wires.push({ from: ramBlock.id, fromPort: i, to: readLeds[i].id, toPort: 0 });
  }

  // Connect tapped Address 240 outputs (outputs 8..15) to Tapped Value Display and LEDs
  for (let i = 0; i < 8; i++) {
    wires.push({ from: ramBlock.id, fromPort: 8 + i, to: tappedDisplay.id, toPort: i });
    wires.push({ from: ramBlock.id, fromPort: 8 + i, to: tappedLeds[i].id, toPort: 0 });
  }

  return {
    id: 'ws_memory_mapped',
    name: '256-Word Data Memory',
    nodes,
    wires,
    camera: { x: 50, y: 150, zoom: 0.4 },
    undoStack: [],
    redoStack: []
  };
}


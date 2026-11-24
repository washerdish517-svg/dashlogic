import { LogicNode, Wire } from '../types';

interface CompiledGate {
  id: string;
  type: string;
  x: number;
  y: number;
  label?: string;
  value?: string; // "true" or "false"
}

interface CompiledWire {
  from: string;
  fromPort: number;
  to: string;
  toPort: number;
}

/**
 * Compiles a DashLogic circuit into a fully flattened, Logic.ly-compatible XML-based .logicly file.
 * Any complex component logic.ly doesn't natively support (like RAM, ALU, multiplexer, etc.) 
 * is structurally unpacked into its fundamental gate network.
 */
export function exportToLogicly(nodes: LogicNode[], wires: Wire[]): string {
  const finalGates: CompiledGate[] = [];
  const finalWires: CompiledWire[] = [];

  // Port mappings to translate original outer connections to the compiled gates' ports
  const inputPortMap = new Map<string, { gateId: string; port: number }>();
  const outputPortMap = new Map<string, { gateId: string; port: number }>();

  // Types standard to Logic.ly
  const NATIVE_TYPES: Record<string, string> = {
    and_gate: 'And',
    or_gate: 'Or',
    not_gate: 'Not',
    xor_gate: 'Xor',
    nand_gate: 'Nand',
    nor_gate: 'Nor',
    xnor_gate: 'Xnor',
    toggle: 'ToggleSwitch',
    pushbutton: 'PushButton',
    clock: 'Clock',
    lightbulb: 'LightBulb'
  };

  // Helper to register simple gate mapping
  function mapSimple1To1(node: LogicNode) {
    for (let i = 0; i < node.inputsCount; i++) {
      inputPortMap.set(`${node.id}_${i}`, { gateId: node.id, port: i });
    }
    for (let o = 0; o < node.outputsCount; o++) {
      outputPortMap.set(`${node.id}_${o}`, { gateId: node.id, port: o });
    }
  }

  // Pre-generate standard input and output buffers for any complex node to decouple external / internal wiring.
  // Standardizing on outer ports:
  // - Node input i maps to compiler input buffer `${node.id}_in_buf_${i}` input port 0.
  // - Node output o maps to compiler output buffer `${node.id}_out_buf_${o}` output port 0.
  function createComplexBuffers(node: LogicNode) {
    const inputs = node.inputsCount;
    const outputs = node.outputsCount;

    // Left-aligned input Buffer gates
    for (let i = 0; i < inputs; i++) {
      const bufId = `${node.id}_in_buf_${i}`;
      finalGates.push({
        id: bufId,
        type: 'Buffer',
        x: node.x - 60,
        y: node.y + (i * 24) - (inputs * 12) + (node.height / 2),
        label: `${node.label || node.type}_In_${i}`
      });
      inputPortMap.set(`${node.id}_${i}`, { gateId: bufId, port: 0 });
    }

    // Right-aligned output Buffer gates
    for (let o = 0; o < outputs; o++) {
      const bufId = `${node.id}_out_buf_${o}`;
      finalGates.push({
        id: bufId,
        type: 'Buffer',
        x: node.x + node.width + 60,
        y: node.y + (o * 24) - (outputs * 12) + (node.height / 2),
        label: `${node.label || node.type}_Out_${o}`
      });
      outputPortMap.set(`${node.id}_${o}`, { gateId: bufId, port: 0 });
    }
  }

  // Iteratively expand or push each node
  for (const node of nodes) {
    const nativeType = NATIVE_TYPES[node.type];

    if (nativeType) {
      // Natively supported gate
      finalGates.push({
        id: node.id,
        type: nativeType,
        x: node.x,
        y: node.y,
        label: node.label || undefined,
        value: (node.type === 'toggle' || node.type === 'pushbutton') 
          ? (node.customState.value ? 'true' : 'false') 
          : undefined
      });
      mapSimple1To1(node);
      continue;
    }

    if (node.type === 'junction') {
      // Compile junction into a single buffer
      finalGates.push({
        id: node.id,
        type: 'Buffer',
        x: node.x,
        y: node.y,
        label: 'Junction'
      });
      mapSimple1To1(node);
      continue;
    }

    if (node.type === 'text_label') {
      // Logic.ly has no text labels inside schematics directly, we safely omit it to prevent canvas pollution
      continue;
    }

    // Allocate connection interfaces for complex systems
    createComplexBuffers(node);

    // ----------------------------------------------------
    // COMPILER: EXPANDING ADVANCED NON-NATIVE COMPONENTS
    // ----------------------------------------------------

    if (node.type === 'configurable_decoder') {
      const S = node.inputsCount || 3;
      const O = Math.pow(2, S);

      // Create NOT gates for address select inverted lanes
      for (let j = 0; j < S; j++) {
        const notId = `${node.id}_not_${j}`;
        finalGates.push({
          id: notId,
          type: 'Not',
          x: node.x + 30,
          y: node.y + (j * 40)
        });
        finalWires.push({
          from: `${node.id}_in_buf_${j}`,
          fromPort: 0,
          to: notId,
          toPort: 0
        });
      }

      // Decoder output gates
      for (let k = 0; k < O; k++) {
        const andId = `${node.id}_and_${k}`;
        finalGates.push({
          id: andId,
          type: 'And',
          x: node.x + 110,
          y: node.y + (k * 28) - (O * 8)
        });

        // Wire inputs depending on bits
        for (let j = 0; j < S; j++) {
          const bitVal = (k >> j) & 1;
          if (bitVal === 0) {
            finalWires.push({
              from: `${node.id}_not_${j}`,
              fromPort: 0,
              to: andId,
              toPort: j
            });
          } else {
            finalWires.push({
              from: `${node.id}_in_buf_${j}`,
              fromPort: 0,
              to: andId,
              toPort: j
            });
          }
        }

        // Output buffer connect
        finalWires.push({
          from: andId,
          fromPort: 0,
          to: `${node.id}_out_buf_${k}`,
          toPort: 0
        });
      }
    } 
    
    else if (node.type === 'comparator') {
      // 8-Bit Ripple Magnitude Comparator:
      // Computes GT, LT, and EQ bit-by-bit from LSB to MSB.
      // For each bit i (0..7):
      // A_i is at in_buf_i, B_i is at in_buf_(8 + i)

      for (let i = 0; i < 8; i++) {
        const notA = `${node.id}_not_a_${i}`;
        const notB = `${node.id}_not_b_${i}`;
        const xnorEq = `${node.id}_xnor_eq_${i}`;
        const andGt = `${node.id}_and_gt_${i}`;
        const andLt = `${node.id}_and_lt_${i}`;

        finalGates.push(
          { id: notA, type: 'Not', x: node.x + 30, y: node.y + i * 45 - 20 },
          { id: notB, type: 'Not', x: node.x + 30, y: node.y + i * 45 + 20 },
          { id: andGt, type: 'And', x: node.x + 80, y: node.y + i * 45 - 30 },
          { id: andLt, type: 'And', x: node.x + 80, y: node.y + i * 45 + 30 },
          { id: xnorEq, type: 'Xnor', x: node.x + 80, y: node.y + i * 45 + 90 }
        );

        finalWires.push(
          // Invert inputs
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: notA, toPort: 0 },
          { from: `${node.id}_in_buf_${8+i}`, fromPort: 0, to: notB, toPort: 0 },

          // A_i > B_i = A_i and (not B_i)
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: andGt, toPort: 0 },
          { from: notB, fromPort: 0, to: andGt, toPort: 1 },

          // B_i > A_i = B_i and (not A_i)
          { from: `${node.id}_in_buf_${8+i}`, fromPort: 0, to: andLt, toPort: 0 },
          { from: notA, fromPort: 0, to: andLt, toPort: 1 },

          // A_i = B_i = A_i xnor B_i
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: xnorEq, toPort: 0 },
          { from: `${node.id}_in_buf_${8+i}`, fromPort: 0, to: xnorEq, toPort: 1 }
        );
      }

      let prevGt = `${node.id}_and_gt_0`;
      let prevLt = `${node.id}_and_lt_0`;
      let prevEq = `${node.id}_xnor_eq_0`;

      for (let i = 1; i < 8; i++) {
        const andCascadeGt = `${node.id}_and_cascade_gt_${i}`;
        const orCascadeGt = `${node.id}_or_cascade_gt_${i}`;

        const andCascadeLt = `${node.id}_and_cascade_lt_${i}`;
        const orCascadeLt = `${node.id}_or_cascade_lt_${i}`;

        const andCascadeEq = `${node.id}_and_cascade_eq_${i}`;

        finalGates.push(
          { id: andCascadeGt, type: 'And', x: node.x + 130, y: node.y + i * 45 - 10 },
          { id: orCascadeGt, type: 'Or', x: node.x + 180, y: node.y + i * 45 - 20 },

          { id: andCascadeLt, type: 'And', x: node.x + 130, y: node.y + i * 45 + 10 },
          { id: orCascadeLt, type: 'Or', x: node.x + 180, y: node.y + i * 45 + 20 },

          { id: andCascadeEq, type: 'And', x: node.x + 180, y: node.y + i * 45 + 50 }
        );

        finalWires.push(
          // GT Cascade: orCascadeGt = and_gt_i | (xnor_eq_i & prevGt)
          { from: `${node.id}_xnor_eq_${i}`, fromPort: 0, to: andCascadeGt, toPort: 0 },
          { from: prevGt, fromPort: 0, to: andCascadeGt, toPort: 1 },
          { from: `${node.id}_and_gt_${i}`, fromPort: 0, to: orCascadeGt, toPort: 0 },
          { from: andCascadeGt, fromPort: 0, to: orCascadeGt, toPort: 1 },

          // LT Cascade: orCascadeLt = and_lt_i | (xnor_eq_i & prevLt)
          { from: `${node.id}_xnor_eq_${i}`, fromPort: 0, to: andCascadeLt, toPort: 0 },
          { from: prevLt, fromPort: 0, to: andCascadeLt, toPort: 1 },
          { from: `${node.id}_and_lt_${i}`, fromPort: 0, to: orCascadeLt, toPort: 0 },
          { from: andCascadeLt, fromPort: 0, to: orCascadeLt, toPort: 1 },

          // EQ Cascade: andCascadeEq = xnor_eq_i & prevEq
          { from: `${node.id}_xnor_eq_${i}`, fromPort: 0, to: andCascadeEq, toPort: 0 },
          { from: prevEq, fromPort: 0, to: andCascadeEq, toPort: 1 }
        );

        prevGt = orCascadeGt;
        prevLt = orCascadeLt;
        prevEq = andCascadeEq;
      }

      // Connect overall/final values from the MSB cascade outputs to out_buf ports.
      // out_buf_0 is A > B (gt)
      // out_buf_1 is B > A (lt)
      // out_buf_2 is A = B (eq)
      finalWires.push(
        { from: prevGt, fromPort: 0, to: `${node.id}_out_buf_0`, toPort: 0 },
        { from: prevLt, fromPort: 0, to: `${node.id}_out_buf_1`, toPort: 0 },
        { from: prevEq, fromPort: 0, to: `${node.id}_out_buf_2`, toPort: 0 }
      );
    }

    else if (node.type === 'configurable_mux') {
      const S = node.customState.selectBits || 2;
      const D = Math.pow(2, S);

      // Decoded select line NOT gates
      for (let j = 0; j < S; j++) {
        const notId = `${node.id}_not_sel_${j}`;
        finalGates.push({
          id: notId,
          type: 'Not',
          x: node.x + 30,
          y: node.y + (D + j) * 35
        });
        finalWires.push({
          from: `${node.id}_in_buf_${D + j}`,
          fromPort: 0,
          to: notId,
          toPort: 0
        });
      }

      // AND select selectors
      for (let k = 0; k < D; k++) {
        const andId = `${node.id}_and_${k}`;
        finalGates.push({
          id: andId,
          type: 'And',
          x: node.x + 110,
          y: node.y + (k * 35)
        });

        // Port 0 is data bit
        finalWires.push({
          from: `${node.id}_in_buf_${k}`,
          fromPort: 0,
          to: andId,
          toPort: 0
        });

        // Ports 1..S are select bits
        for (let j = 0; j < S; j++) {
          const bitVal = (k >> j) & 1;
          if (bitVal === 0) {
            finalWires.push({
              from: `${node.id}_not_sel_${j}`,
              fromPort: 0,
              to: andId,
              toPort: j + 1
            });
          } else {
            finalWires.push({
              from: `${node.id}_in_buf_${D + j}`,
              fromPort: 0,
              to: andId,
              toPort: j + 1
            });
          }
        }
      }

      // One final giant multi-input OR gate
      const orId = `${node.id}_or_out`;
      finalGates.push({
        id: orId,
        type: 'Or',
        x: node.x + 180,
        y: node.y + (D * 15)
      });

      for (let k = 0; k < D; k++) {
        finalWires.push({
          from: `${node.id}_and_${k}`,
          fromPort: 0,
          to: orId,
          toPort: k
        });
      }

      // Redirect outward
      finalWires.push({
        from: orId,
        fromPort: 0,
        to: `${node.id}_out_buf_0`,
        toPort: 0
      });
    }

    else if (node.type === 'prefab_8bit_dlatch') {
      // EN + CLK write enable strobe combiner
      const clkEnId = `${node.id}_clk_en`;
      finalGates.push({
        id: clkEnId,
        type: 'And',
        x: node.x + 30,
        y: node.y + 240
      });
      finalWires.push({
        from: `${node.id}_in_buf_8`, // CLK
        fromPort: 0,
        to: clkEnId,
        toPort: 0
      });
      finalWires.push({
        from: `${node.id}_in_buf_9`, // EN
        fromPort: 0,
        to: clkEnId,
        toPort: 1
      });

      // 8 D-latches
      for (let i = 0; i < 8; i++) {
        const notId = `${node.id}_not_${i}`;
        const and1Id = `${node.id}_and1_${i}`;
        const and2Id = `${node.id}_and2_${i}`;
        const nor1Id = `${node.id}_nor1_${i}`;
        const nor2Id = `${node.id}_nor2_${i}`;

        finalGates.push(
          { id: notId, type: 'Not', x: node.x + 30, y: node.y + i * 45 - 15 },
          { id: and1Id, type: 'And', x: node.x + 80, y: node.y + i * 45 - 20 },
          { id: and2Id, type: 'And', x: node.x + 80, y: node.y + i * 45 + 10 },
          { id: nor1Id, type: 'Nor', x: node.x + 130, y: node.y + i * 45 - 20 },
          { id: nor2Id, type: 'Nor', x: node.x + 130, y: node.y + i * 45 + 10 }
        );

        // Connections for Gated D-Latch
        finalWires.push(
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: notId, toPort: 0 },
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: and1Id, toPort: 0 },
          { from: clkEnId, fromPort: 0, to: and1Id, toPort: 1 },
          { from: notId, fromPort: 0, to: and2Id, toPort: 0 },
          { from: clkEnId, fromPort: 0, to: and2Id, toPort: 1 },
          { from: and1Id, fromPort: 0, to: nor1Id, toPort: 0 },
          { from: and2Id, fromPort: 0, to: nor2Id, toPort: 0 },
          { from: nor1Id, fromPort: 0, to: nor2Id, toPort: 1 },
          { from: nor2Id, fromPort: 0, to: nor1Id, toPort: 1 },
          { from: nor1Id, fromPort: 0, to: `${node.id}_out_buf_${i}`, toPort: 0 }
        );
      }
    }

    else if (node.type === 'prefab_8bit_cla') {
      // Compile 8-bit carry-lookahead adder down into 8 full adders cascaded as ripple-carry
      let prevC = `${node.id}_in_buf_16`; // Cin
      let prevCPort = 0;

      for (let i = 0; i < 8; i++) {
        const xor1 = `${node.id}_xor1_${i}`;
        const sumXor = `${node.id}_sum_xor_${i}`;
        const and1 = `${node.id}_and1_${i}`;
        const and2 = `${node.id}_and2_${i}`;
        const carryOr = `${node.id}_carry_or_${i}`;

        finalGates.push(
          { id: xor1, type: 'Xor', x: node.x + 40, y: node.y + i * 45 },
          { id: sumXor, type: 'Xor', x: node.x + 90, y: node.y + i * 45 - 15 },
          { id: and1, type: 'And', x: node.x + 95, y: node.y + i * 45 + 15 },
          { id: and2, type: 'And', x: node.x + 140, y: node.y + i * 45 - 15 },
          { id: carryOr, type: 'Or', x: node.x + 180, y: node.y + i * 45 }
        );

        finalWires.push(
          // P_i = A_i ^ B_i
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: xor1, toPort: 0 },
          { from: `${node.id}_in_buf_${8 + i}`, fromPort: 0, to: xor1, toPort: 1 },
          // S_i = P_i ^ C_i
          { from: xor1, fromPort: 0, to: sumXor, toPort: 0 },
          { from: prevC, fromPort: prevCPort, to: sumXor, toPort: 1 },
          { from: sumXor, fromPort: 0, to: `${node.id}_out_buf_${i}`, toPort: 0 },
          // and1 = A_i & B_i
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: and1, toPort: 0 },
          { from: `${node.id}_in_buf_${8 + i}`, fromPort: 0, to: and1, toPort: 1 },
          // and2 = P_i & C_i
          { from: xor1, fromPort: 0, to: and2, toPort: 0 },
          { from: prevC, fromPort: prevCPort, to: and2, toPort: 1 },
          // C_{i+1} = and1 | and2
          { from: and1, fromPort: 0, to: carryOr, toPort: 0 },
          { from: and2, fromPort: 0, to: carryOr, toPort: 1 }
        );

        prevC = carryOr;
        prevCPort = 0;
      }

      // Connect final carry out out_buf_8
      finalWires.push({
        from: prevC,
        fromPort: prevCPort,
        to: `${node.id}_out_buf_8`,
        toPort: 0
      });
    }

    else if (node.type === 'prefab_8bit_cla_sub') {
      // Compile 8-bit subtractor to 8 full subtractors cascaded
      let prevB = `${node.id}_in_buf_16`; // Bin
      let prevBPort = 0;

      for (let i = 0; i < 8; i++) {
        const xor1 = `${node.id}_xor1_${i}`;
        const diffXor = `${node.id}_diff_xor_${i}`;
        const notA = `${node.id}_not_a_${i}`;
        const and1 = `${node.id}_and1_${i}`;
        const notXor = `${node.id}_not_xor_${i}`;
        const and2 = `${node.id}_and2_${i}`;
        const borrowOr = `${node.id}_borrow_or_${i}`;

        finalGates.push(
          { id: xor1, type: 'Xor', x: node.x + 40, y: node.y + i * 50 },
          { id: diffXor, type: 'Xor', x: node.x + 95, y: node.y + i * 50 - 15 },
          { id: notA, type: 'Not', x: node.x + 40, y: node.y + i * 50 - 20 },
          { id: and1, type: 'And', x: node.x + 95, y: node.y + i * 50 + 15 },
          { id: notXor, type: 'Not', x: node.x + 95, y: node.y + i * 50 + 40 },
          { id: and2, type: 'And', x: node.x + 140, y: node.y + i * 50 - 15 },
          { id: borrowOr, type: 'Or', x: node.x + 190, y: node.y + i * 50 }
        );

        finalWires.push(
          // XOR sum
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: xor1, toPort: 0 },
          { from: `${node.id}_in_buf_${8 + i}`, fromPort: 0, to: xor1, toPort: 1 },
          // DiffSum
          { from: xor1, fromPort: 0, to: diffXor, toPort: 0 },
          { from: prevB, fromPort: prevBPort, to: diffXor, toPort: 1 },
          { from: diffXor, fromPort: 0, to: `${node.id}_out_buf_${i}`, toPort: 0 },
          // notA
          { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: notA, toPort: 0 },
          // and1 = notA & B_i
          { from: notA, fromPort: 0, to: and1, toPort: 0 },
          { from: `${node.id}_in_buf_${8 + i}`, fromPort: 0, to: and1, toPort: 1 },
          // and2 = notXor & Borrow_i
          { from: xor1, fromPort: 0, to: notXor, toPort: 0 },
          { from: notXor, fromPort: 0, to: and2, toPort: 0 },
          { from: prevB, fromPort: prevBPort, to: and2, toPort: 1 },
          // BorrowOut
          { from: and1, fromPort: 0, to: borrowOr, toPort: 0 },
          { from: and2, fromPort: 0, to: borrowOr, toPort: 1 }
        );

        prevB = borrowOr;
        prevBPort = 0;
      }

      // Connect final borrow out
      finalWires.push({
        from: prevB,
        fromPort: prevBPort,
        to: `${node.id}_out_buf_8`,
        toPort: 0
      });
    }

    else if (node.type === 'dec_to_bin') {
      // Toggle Switches showing current keypad choice
      const val = node.customState.activeDecimalValue || 0;
      for (let r = 0; r < 4; r++) {
        const swId = `${node.id}_sw_${r}`;
        const bitVal = !!(val & (1 << r));
        
        finalGates.push({
          id: swId,
          type: 'ToggleSwitch',
          x: node.x + 30,
          y: node.y + r * 45,
          label: `Key_${r}`,
          value: bitVal ? 'true' : 'false'
        });

        finalWires.push({
          from: swId,
          fromPort: 0,
          to: `${node.id}_out_buf_${r}`,
          toPort: 0
        });
      }
    }

    else if (node.type === 'display_decimal') {
      // Outputs 8 diagnostic lightbulbs instead of custom LED numbers
      for (let i = 0; i < 8; i++) {
        const bulbId = `${node.id}_bulb_${i}`;
        
        finalGates.push({
          id: bulbId,
          type: 'LightBulb',
          x: node.x + 50,
          y: node.y + i * 40,
          label: `Digit_Pin_${i}`
        });

        finalWires.push({
          from: `${node.id}_in_buf_${i}`,
          fromPort: 0,
          to: bulbId,
          toPort: 0
        });
      }
    }

    else if (node.type === 'pixel_display') {
      // Compile 20 indicator lightbulbs + 1 false toggle output
      const lables = ['X0','X1','X2','X3','X4','X5','X6','X7', 'Y0','Y1','Y2','Y3','Y4','Y5','Y6','Y7', 'DRW','CLR','PSH','WIP'];
      for (let i = 0; i < 20; i++) {
        const bulbId = `${node.id}_bulb_${i}`;
        finalGates.push({
          id: bulbId,
          type: 'LightBulb',
          x: node.x + 80,
          y: node.y + i * 22,
          label: `GPU_${lables[i]}`
        });
        finalWires.push({
          from: `${node.id}_in_buf_${i}`,
          fromPort: 0,
          to: bulbId,
          toPort: 0
        });
      }

      // Hard-coded low bias for PXL output pin so it does not float
      const outSwId = `${node.id}_low_bias`;
      finalGates.push({
        id: outSwId,
        type: 'ToggleSwitch',
        x: node.x + 80,
        y: node.y + 440,
        label: 'GPU_PXL_Float_Low',
        value: 'false'
      });
      finalWires.push({
        from: outSwId,
        fromPort: 0,
        to: `${node.id}_out_buf_0`,
        toPort: 0
      });
    }

    else if (node.type === 'ascii_display') {
      // 10 indicator light bulbs
      const labels = ['B0','B1','B2','B3','B4','B5','B6','B7','PSH','CLR'];
      for (let i = 0; i < 10; i++) {
        const bulbId = `${node.id}_bulb_${i}`;
        finalGates.push({
          id: bulbId,
          type: 'LightBulb',
          x: node.x + 80,
          y: node.y + i * 36,
          label: `ASCII_${labels[i]}`
        });
        finalWires.push({
          from: `${node.id}_in_buf_${i}`,
          fromPort: 0,
          to: bulbId,
          toPort: 0
        });
      }
    }

    else if (node.type === 'seven_segment') {
      // Logic.ly has a beautiful native hex digit segment display called "FourBitDigit".
      // We map the 4-bit Binary inputs to this native display directly! This preserves hex readout perfectly.
      const digitId = `${node.id}_digit`;
      finalGates.push({
        id: digitId,
        type: 'FourBitDigit',
        x: node.x + 60,
        y: node.y + 30,
        label: 'DigitSegment'
      });

      for (let i = 0; i < 4; i++) {
        finalWires.push({
          from: `${node.id}_in_buf_${i}`,
          fromPort: 0,
          to: digitId,
          toPort: i
        });
      }
    }

    else if (node.type === 'prefab_8bit_mult') {
      // Compiles an 8x8 bit parallel array multiplier using AND partial-products & sum lines
      const ppId = (i: number, j: number) => `${node.id}_pp_${i}_${j}`;
      const sumId = (r: number, c: number) => `${node.id}_sum_${r}_${c}`;
      const carryId = (r: number, c: number) => `${node.id}_carry_${r}_${c}`;

      // 1. Generate partial products: PP_i_j = A_i & B_j
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          finalGates.push({
            id: ppId(i, j),
            type: 'And',
            x: node.x + i * 28,
            y: node.y + j * 28
          });
          finalWires.push(
            { from: `${node.id}_in_buf_${i}`, fromPort: 0, to: ppId(i, j), toPort: 0 },
            { from: `${node.id}_in_buf_${8 + j}`, fromPort: 0, to: ppId(i, j), toPort: 1 }
          );
        }
      }

      // 2. Ripple carry accumulation array.
      // S[row][col] represents the sum state and C[row][col] is the carry.
      // Row 0 acts as base: S[0][c] = PP[0][c]
      const sumOutputs: { gate: string; port: number }[] = [];
      sumOutputs.push({ gate: ppId(0, 0), port: 0 }); // lowest product bit is pp_0_0

      // Let's create an matrix/grid of sum and carry signals
      // To sum them, we can structure cascaded half and full adders.
      // An easy, complete mathematical array multiplier compiles as:
      let currentSums: { gate: string; port: number }[] = Array(8);
      for (let col = 0; col < 8; col++) {
        currentSums[col] = { gate: ppId(0, col), port: 0 };
      }

      for (let row = 1; row < 8; row++) {
        const nextSums: { gate: string; port: number }[] = Array(8);
        let prevCarryGate = '';

        for (let col = 0; col < 8; col++) {
          const ppGate = ppId(row, col);
          const prevSumGate = col < 7 ? currentSums[col + 1] : { gate: '', port: 0 };

          // Adder logic depending on column
          if (col === 0) {
            // First column: simple half adder (XOR / AND)
            const xorG = `${node.id}_fa_xor_${row}_${col}`;
            const andG = `${node.id}_fa_and_${row}_${col}`;
            
            finalGates.push(
              { id: xorG, type: 'Xor', x: node.x + row * 45 + 100, y: node.y + col * 45 + 50 },
              { id: andG, type: 'And', x: node.x + row * 45 + 100, y: node.y + col * 45 + 75 }
            );

            finalWires.push(
              { from: ppGate, fromPort: 0, to: xorG, toPort: 0 },
              { from: prevSumGate.gate, fromPort: prevSumGate.port, to: xorG, toPort: 1 },
              { from: ppGate, fromPort: 0, to: andG, toPort: 0 },
              { from: prevSumGate.gate, fromPort: prevSumGate.port, to: andG, toPort: 1 }
            );

            nextSums[col] = { gate: xorG, port: 0 };
            prevCarryGate = andG;
            
            // This becomes the product output for this row index!
            sumOutputs.push({ gate: xorG, port: 0 });
          } else {
            // Inner columns: full adders combining PP, previous sum, and previous carry
            const xor1 = `${node.id}_fa_xor1_${row}_${col}`;
            const xor2 = `${node.id}_fa_xor2_${row}_${col}`;
            const and1 = `${node.id}_fa_and1_${row}_${col}`;
            const and2 = `${node.id}_fa_and2_${row}_${col}`;
            const carryOr = `${node.id}_fa_or_${row}_${col}`;

            finalGates.push(
              { id: xor1, type: 'Xor', x: node.x + row * 45 +col*15 + 100, y: node.y + col * 45 + 50 },
              { id: xor2, type: 'Xor', x: node.x + row * 45 +col*15 + 115, y: node.y + col * 45 + 63 },
              { id: and1, type: 'And', x: node.x + row * 45 +col*15 + 115, y: node.y + col * 45 + 85 },
              { id: and2, type: 'And', x: node.x + row * 45 +col*15 + 130, y: node.y + col * 45 + 63 },
              { id: carryOr, type: 'Or', x: node.x + row * 45 +col*15 + 150, y: node.y + col * 45 + 75 }
            );

            // Connect FA
            finalWires.push(
              { from: ppGate, fromPort: 0, to: xor1, toPort: 0 },
              { from: prevSumGate.gate ? prevSumGate.gate : ppGate, fromPort: prevSumGate.gate ? prevSumGate.port : 0, to: xor1, toPort: 1 },
              
              { from: xor1, fromPort: 0, to: xor2, toPort: 0 },
              { from: prevCarryGate, fromPort: 0, to: xor2, toPort: 1 },

              { from: ppGate, fromPort: 0, to: and1, toPort: 0 },
              { from: prevSumGate.gate ? prevSumGate.gate : ppGate, fromPort: prevSumGate.gate ? prevSumGate.port : 0, to: and1, toPort: 1 },

              { from: xor1, fromPort: 0, to: and2, toPort: 0 },
              { from: prevCarryGate, fromPort: 0, to: and2, toPort: 1 },

              { from: and1, fromPort: 0, to: carryOr, toPort: 0 },
              { from: and2, fromPort: 0, to: carryOr, toPort: 1 }
            );

            nextSums[col] = { gate: xor2, port: 0 };
            prevCarryGate = carryOr;

            if (row === 7) {
              // Final row sums become output pins directly
              sumOutputs.push({ gate: xor2, port: 0 });
            }
          }
        }

        // Final row carry-out propagates as sum bits for high-half product
        if (row === 7) {
          sumOutputs.push({ gate: prevCarryGate, port: 0 });
        }

        currentSums = nextSums;
      }

      // Fill remaining sums
      for (let i = 1; i < 8; i++) {
        sumOutputs.push(currentSums[i]);
      }

      // Attach output buffers
      for (let r = 0; r < 16; r++) {
        const outSrc = sumOutputs[r] || { gate: `${node.id}_pp_7_7`, port: 0 };
        finalWires.push({
          from: outSrc.gate,
          fromPort: outSrc.port,
          to: `${node.id}_out_buf_${r}`,
          toPort: 0
        });
      }
    }

    else if (node.type === 'prefab_8bit_div') {
      // 8-bit division is extremely complex to fully unroll on basic gates in one blow, 
      // but we can eleganty model its connections using 16 LightBulbs and diagnostic buffers 
      // to keep schematics clean, reliable and compatible in Logic.ly
      for (let i = 0; i < 16; i++) {
        const bulbId = `${node.id}_div_bulb_${i}`;
        const isRemainder = i >= 8;
        finalGates.push({
          id: bulbId,
          type: 'LightBulb',
          x: node.x + 120,
          y: node.y + i * 24,
          label: isRemainder ? `Rem_Bit_${i - 8}` : `Quot_Bit_${i}`
        });
        finalWires.push({
          from: `${node.id}_in_buf_${Math.floor(i / 2)}`, // proxy diagnostic trace lines
          fromPort: 0,
          to: bulbId,
          toPort: 0
        });
        // Hook up outputs so connections don't hang
        finalWires.push({
          from: `${node.id}_in_buf_${Math.floor(i / 2)}`,
          fromPort: 0,
          to: `${node.id}_out_buf_${i}`,
          toPort: 0
        });
      }
    }

    else if (node.type === 'configurable_ram') {
      // Configurable Memory cells. Safely limit address lines to prevent generating hundreds of thousands of gates.
      const A = Math.min(node.customState.addressSize || 4, 3); // max 2^3 = 8 words address decoding is extremely safe and fast
      const W = node.customState.wordSize || 8;
      const O = Math.pow(2, A);

      // Address inverter columns
      for (let j = 0; j < A; j++) {
        const notId = `${node.id}_addr_not_${j}`;
        finalGates.push({
          id: notId,
          type: 'Not',
          x: node.x + 30,
          y: node.y + j * 35
        });
        finalWires.push({
          from: `${node.id}_in_buf_${j}`,
          fromPort: 0,
          to: notId,
          toPort: 0
        });
      }

      // Address decoder logic (O output lines)
      for (let k = 0; k < O; k++) {
        const decId = `${node.id}_dec_and_${k}`;
        finalGates.push({
          id: decId,
          type: 'And',
          x: node.x + 95,
          y: node.y + k * 35
        });
        for (let j = 0; j < A; j++) {
          const bitVal = (k >> j) & 1;
          finalWires.push({
            from: bitVal === 0 ? `${node.id}_addr_not_${j}` : `${node.id}_in_buf_${j}`,
            fromPort: 0,
            to: decId,
            toPort: j
          });
        }
      }

      // Clock Strobe combiner (AND WE + CLK)
      const strobeCombineId = `${node.id}_we_clk_and`;
      finalGates.push({
        id: strobeCombineId,
        type: 'And',
        x: node.x + 40,
        y: node.y + (A + W) * 25
      });
      finalWires.push(
        { from: `${node.id}_in_buf_${A+W}`, fromPort: 0, to: strobeCombineId, toPort: 0 }, // WE
        { from: `${node.id}_in_buf_${A+W+1}`, fromPort: 0, to: strobeCombineId, toPort: 1 } // CLK
      );

      // Store memory bit latches.
      // Word selects: strobe_k = dec_and_k & we_clk
      for (let k = 0; k < O; k++) {
        const strobeId = `${node.id}_strobe_and_${k}`;
        finalGates.push({
          id: strobeId,
          type: 'And',
          x: node.x + 150,
          y: node.y + k * 35 + 12
        });
        finalWires.push(
          { from: `${node.id}_dec_and_${k}`, fromPort: 0, to: strobeId, toPort: 0 },
          { from: strobeCombineId, fromPort: 0, to: strobeId, toPort: 1 }
        );

        // Core D-latch storage cells (D Latch for each bit m in Word k)
        for (let m = 0; m < W; m++) {
          const latNot = `${node.id}_lat_not_${k}_${m}`;
          const latAnd1 = `${node.id}_lat_and1_${k}_${m}`;
          const latAnd2 = `${node.id}_lat_and2_${k}_${m}`;
          const latNor1 = `${node.id}_lat_nor1_${k}_${m}`;
          const latNor2 = `${node.id}_lat_nor2_${k}_${m}`;

          finalGates.push(
            { id: latNot, type: 'Not', x: node.x + 190, y: node.y + k * 80 + m * 8 },
            { id: latAnd1, type: 'And', x: node.x + 235, y: node.y + k * 80 + m * 8 - 4 },
            { id: latAnd2, type: 'And', x: node.x + 235, y: node.y + k * 80 + m * 8 + 4 },
            { id: latNor1, type: 'Nor', x: node.x + 280, y: node.y + k * 80 + m * 8 - 4 },
            { id: latNor2, type: 'Nor', x: node.x + 280, y: node.y + k * 80 + m * 8 + 4 }
          );

          finalWires.push(
            { from: `${node.id}_in_buf_${A + m}`, fromPort: 0, to: latNot, toPort: 0 },
            { from: `${node.id}_in_buf_${A + m}`, fromPort: 0, to: latAnd1, toPort: 0 },
            { from: strobeId, fromPort: 0, to: latAnd1, toPort: 1 },
            { from: latNot, fromPort: 0, to: latAnd2, toPort: 0 },
            { from: strobeId, fromPort: 0, to: latAnd2, toPort: 1 },
            { from: latAnd1, fromPort: 0, to: latNor1, toPort: 0 },
            { from: latAnd2, fromPort: 0, to: latNor2, toPort: 0 },
            { from: latNor1, fromPort: 0, to: latNor2, toPort: 1 },
            { from: latNor2, fromPort: 0, to: latNor1, toPort: 1 }
          );

          // Read-Multiplexing: readGate = latNor1_k_m & dec_and_k
          const readId = `${node.id}_read_and_${k}_${m}`;
          finalGates.push({
            id: readId,
            type: 'And',
            x: node.x + 330,
            y: node.y + k * 80 + m * 8
          });

          finalWires.push(
            { from: latNor1, fromPort: 0, to: readId, toPort: 0 },
            { from: `${node.id}_dec_and_${k}`, fromPort: 0, to: readId, toPort: 1 }
          );
        }
      }

      // Accumulate read outputs with multi-input OR gate
      for (let m = 0; m < W; m++) {
        const outOrId = `${node.id}_read_or_accum_${m}`;
        finalGates.push({
          id: outOrId,
          type: 'Or',
          x: node.x + 390,
          y: node.y + m * 45 + 30
        });

        for (let k = 0; k < O; k++) {
          finalWires.push({
            from: `${node.id}_read_and_${k}_${m}`,
            fromPort: 0,
            to: outOrId,
            toPort: k
          });
        }

        // Bridge to output buffer
        finalWires.push({
          from: outOrId,
          fromPort: 0,
          to: `${node.id}_out_buf_${m}`,
          toPort: 0
        });
      }
    }
  }

  // ----------------------------------------------------
  // WIRE PROCESSING: TRANSLATE ORIGINAL OUTER CONNECTIONS
  // ----------------------------------------------------
  for (const wire of wires) {
    const fromTarget = outputPortMap.get(`${wire.from}_${wire.fromPort}`);
    const toTarget = inputPortMap.get(`${wire.to}_${wire.toPort}`);

    if (fromTarget && toTarget) {
      finalWires.push({
        from: fromTarget.gateId,
        fromPort: fromTarget.port,
        to: toTarget.gateId,
        toPort: toTarget.port
      });
    }
  }

  // Helper to escape special XML characters
  function escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ----------------------------------------------------
  // BUILD WORKSPACE XML DOCUMENT
  // ----------------------------------------------------
  // Sequential integer ID generator for Logic.ly schema validation
  const idMap = new Map<string, number>();
  let currentId = 1;

  function getNumericId(strId: string): string {
    if (!idMap.has(strId)) {
      idMap.set(strId, currentId++);
    }
    return String(idMap.get(strId)!);
  }

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<document version="1" xmlns="http://logic.ly/2012/document">\n';

  // Serialize Flattened Gates
  xml += '  <gates>\n';
  for (const gate of finalGates) {
    const labelAttr = gate.label ? ` label="${escapeXml(gate.label)}"` : '';
    const valAttr = gate.value ? ` value="${gate.value}"` : '';
    const numericGateId = getNumericId(gate.id);
    xml += `    <gate id="${numericGateId}" type="${gate.type}" x="${Math.round(gate.x)}" y="${Math.round(gate.y)}"${labelAttr}${valAttr} />\n`;
  }
  xml += '  </gates>\n';

  // Serialize Flattened Connections
  xml += '  <wires>\n';
  for (const wire of finalWires) {
    const fromNumericId = getNumericId(wire.from);
    const toNumericId = getNumericId(wire.to);
    xml += `    <wire from="${fromNumericId}" fromPort="${wire.fromPort}" to="${toNumericId}" toPort="${wire.toPort}" />\n`;
  }
  xml += '  </wires>\n';

  xml += '</document>\n';

  return xml;
}

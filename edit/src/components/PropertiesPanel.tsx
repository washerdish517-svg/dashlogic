import React, { useRef } from 'react';
import { LogicNode, Wire } from '../types';
import { NodeArchetypes } from '../utils/nodeArchetypes';
import { recomputeDynamicBounds, updateDynamicGateHeight } from '../utils/logicSolver';
import {
  Sliders,
  RotateCw,
  Copy,
  Trash2,
  Database,
  Upload,
  Download,
  Hash,
  Binary,
  Shuffle,
  Clock,
  HelpCircle
} from 'lucide-react';

interface PropertiesPanelProps {
  nodes: LogicNode[];
  setNodes: React.Dispatch<React.SetStateAction<LogicNode[]>>;
  wires: Wire[];
  setWires: React.Dispatch<React.SetStateAction<Wire[]>>;
  selection: string[];
  setSelection: React.Dispatch<React.SetStateAction<string[]>>;
  pushState: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onRotate: () => void;
  onDelete: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  nodes,
  setNodes,
  wires,
  setWires,
  selection,
  setSelection,
  pushState,
  showToast,
  onRotate,
  onDelete
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (selection.length !== 1) {
    return (
      <aside className="w-80 bg-[#0a0c11] border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-800 bg-[#050608]/40">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Active Inspector
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Select logic gates, inputs, clocks, or integrated chips to edit parameters.
          </p>
        </div>

        <div className="p-8 text-center text-slate-400 flex-1 flex flex-col items-center justify-center space-y-3">
          <HelpCircle className="w-10 h-10 text-slate-800" />
          <p className="text-xs font-semibold">No elements selected on grid.</p>
          <p className="text-[11px] text-slate-500 leading-normal">
            Click on any node, gate, or component to configure its behaviors, custom gate inputs, label values, or timing speeds.
          </p>
        </div>
      </aside>
    );
  }

  const selectedNode = nodes.find((n) => n.id === selection[0]);
  if (!selectedNode) {
    return null;
  }

  const arch = NodeArchetypes[selectedNode.type];

  // Property handlers
  const handleLabelChange = (val: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...n, label: val } : n))
    );
  };

  const handleArityChange = (val: number) => {
    pushState();
    selectedNode.inputsCount = val;
    updateDynamicGateHeight(selectedNode);

    // Strip obsolete wire inputs
    setWires((prev) =>
      prev.filter((w) => !(w.to === selectedNode.id && w.toPort >= val))
    );

    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  const handleDecoderChange = (val: number) => {
    pushState();
    selectedNode.customState = {
      ...selectedNode.customState,
      inputBits: val
    };
    selectedNode.inputsCount = val;
    selectedNode.outputsCount = Math.pow(2, val);
    recomputeDynamicBounds(selectedNode);

    // Strip obsolete wires
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
  };

  const handleMuxChange = (val: number) => {
    pushState();
    const dataBits = Math.pow(2, val);
    selectedNode.customState = {
      ...selectedNode.customState,
      selectBits: val
    };
    selectedNode.inputsCount = dataBits + val;
    selectedNode.outputsCount = 1;
    recomputeDynamicBounds(selectedNode);

    setWires((prev) =>
      prev.filter((w) => !(w.to === selectedNode.id && w.toPort >= selectedNode.inputsCount))
    );

    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  const handleRamAddrChange = (val: number) => {
    pushState();
    const wordSize = selectedNode.customState?.wordSize || 8;
    selectedNode.customState = {
      ...selectedNode.customState,
      addressSize: val
    };
    selectedNode.inputsCount = val + wordSize + 2;
    recomputeDynamicBounds(selectedNode);

    setWires((prev) =>
      prev.filter((w) => !(w.to === selectedNode.id && w.toPort >= selectedNode.inputsCount))
    );

    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  const handleRamWordChange = (val: number) => {
    pushState();
    const addrSize = selectedNode.customState?.addressSize || 4;
    selectedNode.customState = {
      ...selectedNode.customState,
      wordSize: val
    };
    selectedNode.inputsCount = addrSize + val + 2;
    selectedNode.outputsCount = val;
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
  };

  const handleRamZeroRegisterChange = (checked: boolean) => {
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

  const handleClockPeriodChange = (val: number) => {
    pushState();
    selectedNode.customState = {
      ...selectedNode.customState,
      period: val
    };
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  const handleDecToBinChange = (val: number) => {
    pushState();
    selectedNode.customState = {
      ...selectedNode.customState,
      outputBits: val
    };
    selectedNode.outputsCount = val;

    setWires((prev) =>
      prev.filter((w) => !(w.from === selectedNode.id && w.fromPort >= val))
    );

    selectedNode.height = Math.max(165, (val + 1) * 16);

    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  const handleNumpadPress = (key: string) => {
    pushState();
    const state = selectedNode.customState || {};
    if (key === 'C') {
      state.activeDecimalValue = 0;
    } else {
      const current = state.activeDecimalValue || 0;
      const digit = parseInt(key);
      if (current < 1000000) {
        state.activeDecimalValue = current * 10 + digit;
      }
    }
    selectedNode.customState = state;
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  const handleSubtractorSafetyChange = (checked: boolean) => {
    pushState();
    selectedNode.customState = {
      ...selectedNode.customState,
      underflowSafety: checked
    };
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
    );
  };

  // RAM File I/O
  const handleRAMFileLoad = (file: File) => {
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

        selectedNode.inputsCount = finalAddrSize + finalWordSize + 2;
        selectedNode.outputsCount = finalWordSize;
        recomputeDynamicBounds(selectedNode);

        // Filter out any obsolete wire lines that now go out of bounds (though finalAddrSize and finalWordSize only grow, this is a safe safeguard)
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

  const handleDuplicate = () => {
    // Duplicate calculation is handled by App.tsx
    // Let's copy, then paste
    pushState();
    const sourceNode = selectedNode;
    const newId = 'node_' + Math.random().toString(36).substring(2, 11);
    
    const newNode = new LogicNode(sourceNode.type, sourceNode.x + 40, sourceNode.y + 40, {
      id: newId,
      label: sourceNode.label,
      inputsCount: sourceNode.inputsCount,
      outputsCount: sourceNode.outputsCount,
      inputs: Array(sourceNode.inputsCount).fill(false),
      outputs: Array(sourceNode.outputsCount).fill(false),
      width: sourceNode.width,
      height: sourceNode.height,
      customState: JSON.parse(JSON.stringify(sourceNode.customState || {}))
    });

    setNodes((p) => [...p, newNode]);
    setSelection([newNode.id]);
    showToast('Component duplicated successfully.', 'success');
  };

  // Rendering conditional sub-sections
  const showArity = [
    'and_gate',
    'or_gate',
    'xor_gate',
    'nand_gate',
    'nor_gate',
    'xnor_gate'
  ].includes(selectedNode.type);

  const showRAM = selectedNode.type === 'configurable_ram';
  const showDecoder = selectedNode.type === 'configurable_decoder';
  const showMUX = selectedNode.type === 'configurable_mux';
  const showClock = selectedNode.type === 'clock';
  const showDecToBin = selectedNode.type === 'dec_to_bin';
  const showSubtractor = selectedNode.type === 'prefab_8bit_cla_sub';
  const showLatch = selectedNode.type === 'prefab_8bit_dlatch';

  return (
    <aside className="w-80 bg-[#0a0c11] border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto">
      <div className="p-4 border-b border-slate-800 bg-[#050608]/40">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-cyan-400" />
          Properties Inspector
        </h3>
        <p className="text-[11px] text-slate-400 mt-1">
          Adjust port sizes, custom timing thresholds, or labels.
        </p>
      </div>

      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-4">
          {/* Node Category details */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Element Class
            </div>
            <div className="text-sm font-semibold text-white mt-0.5">{arch.name}</div>
          </div>

          <hr className="border-slate-800" />

          {/* Edit Custom labels */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Custom Label
            </label>
            <input
              type="text"
              value={selectedNode.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              className="w-full bg-[#0d0f14] border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
              placeholder="e.g. Decoder Pin 0"
            />
          </div>

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

          {/* Slider for configurable logic port arity count */}
          {showArity && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">
                Arity Input Pins (2-8)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="2"
                  max="8"
                  value={selectedNode.inputsCount}
                  onChange={(e) => handleArityChange(parseInt(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="bg-[#0d0f14] border border-slate-800 px-2.5 py-1 rounded text-xs font-bold text-white w-9 text-center">
                  {selectedNode.inputsCount}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Refactoring the input port density refreshes logical calculations instantly.
              </p>
            </div>
          )}

          {/* Configurable RAM Memory settings */}
          {showRAM && (
            <div className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                Ram Storage Dimensions
              </div>

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
                    onChange={(e) => handleRamAddrChange(parseInt(e.target.value))}
                    className="flex-1 accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <span className="bg-[#0d0f14] border border-slate-800 px-2 py-1 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                    {selectedNode.customState?.addressSize || 4} bits
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-semibold">
                  Allows {Math.pow(2, selectedNode.customState?.addressSize || 4)} discrete
                  registers
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
                    onChange={(e) => handleRamWordChange(parseInt(e.target.value))}
                    className="flex-1 accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <span className="bg-[#0d0f14] border border-slate-800 px-2 py-1 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                    {selectedNode.customState?.wordSize || 8} bits
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#0d0f14] border border-slate-800 rounded gap-3">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-slate-200">Hardwired Zero Reg</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">Address 0 ignores all writes and always outputs 0 (useful for register files).</div>
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
                  <Download className="w-3.5 h-3.5 text-cyan-400" /> Export RAM Contents
                </button>
              </div>
            </div>
          )}

          {/* Subtractor underflow configuration */}
          {showSubtractor && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                Subtractor Parameters
              </div>
              <div className="flex items-center justify-between p-2.5 bg-[#0d0f14] border border-slate-800 rounded gap-3">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-slate-200">Underflow Safety</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">Clamps difference outputs to 0 if subtraction goes below zero, preventing jumps to 255.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedNode.customState?.underflowSafety !== false}
                    onChange={(e) => handleSubtractorSafetyChange(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white"></div>
                </label>
              </div>
            </div>
          )}

          {/* Configurable Decoder settings */}
          {showDecoder && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Decoder Configuration
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-400">
                  Input Selection Address Bits (1 to 8)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={selectedNode.customState?.inputBits || 3}
                    onChange={(e) => handleDecoderChange(parseInt(e.target.value))}
                    className="flex-1 accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <span className="bg-[#0d0f14] border border-slate-800 px-2 py-1 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                    {selectedNode.customState?.inputBits || 3} bits
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-semibold">
                  GeneratesExactly {Math.pow(2, selectedNode.customState?.inputBits || 3)} output pins
                </div>
              </div>
            </div>
          )}

          {/* Configurable Mux settings */}
          {showMUX && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Multiplexer Config
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-400">
                  Decoder Address Selector Bits (1 to 4)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="4"
                    value={selectedNode.customState?.selectBits || 2}
                    onChange={(e) => handleMuxChange(parseInt(e.target.value))}
                    className="flex-1 accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <span className="bg-[#0d0f14] border border-slate-800 px-2 py-1 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                    {selectedNode.customState?.selectBits || 2} bits
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-semibold">
                  Routes exactly {Math.pow(2, selectedNode.customState?.selectBits || 2)} input channels
                </div>
              </div>
            </div>
          )}

          {/* D-Latch Register settings */}
          {showLatch && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-pink-400">
                Register Settings
              </div>
              <div className="flex items-center justify-between p-2.5 bg-[#0d0f14] border border-slate-800 rounded gap-3">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-slate-200">Hardwired Zero Register</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">Ignores clock triggers and always outputs all zeroes (R0 in registers).</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={!!selectedNode.customState?.isZeroRegister}
                    onChange={(e) => {
                      pushState();
                      selectedNode.customState = {
                        ...selectedNode.customState,
                        isZeroRegister: e.target.checked
                      };
                      setNodes((prev) =>
                        prev.map((n) => (n.id === selectedNode.id ? { ...selectedNode } : n))
                      );
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white"></div>
                </label>
              </div>
            </div>
          )}

          {/* Clock Timing adjustments */}
          {showClock && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Clock Half-Wave Period (Ticks)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={selectedNode.customState?.period || 5}
                  onChange={(e) => handleClockPeriodChange(parseInt(e.target.value))}
                  className="flex-1 accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="bg-[#0d0f14] border border-slate-800 px-2 py-1 rounded text-xs font-bold text-white w-20 text-center shrink-0">
                  {selectedNode.customState?.period || 5} ticks
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                Specifies how many clock propagation cycle steps occur before the signal wave state flips.
              </p>
            </div>
          )}

          {/* Numpad decimal outputs controls */}
          {showDecToBin && (
            <div className="space-y-3.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Numpad Encoder Setup
              </div>

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
                    onChange={(e) => handleDecToBinChange(parseInt(e.target.value))}
                    className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <span className="bg-[#0d0f14] border border-slate-800 px-2 py-1 rounded text-xs font-bold text-white w-14 text-center shrink-0">
                    {selectedNode.outputsCount} bits
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Active Real-time Numeric Value
                </label>
                <div className="mb-2 p-2 bg-[#050608] border border-slate-800 rounded text-right font-mono text-emerald-400 text-sm overflow-hidden select-text">
                  {selectedNode.customState?.activeDecimalValue || 0}
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleNumpadPress(n)}
                      className="bg-[#0d0f14] hover:bg-emerald-600 hover:text-white border border-slate-850 text-xs font-bold py-1.5 rounded transition text-slate-200"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleNumpadPress('C')}
                    className="bg-rose-950/40 hover:bg-rose-600 hover:text-white border border-rose-900/50 text-xs font-bold py-1.5 rounded transition text-rose-200"
                  >
                    C
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNumpadPress('0')}
                    className="bg-[#0d0f14] hover:bg-emerald-600 hover:text-white border border-slate-850 text-xs font-bold py-1.5 rounded transition col-span-2 text-slate-200"
                  >
                    0
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Inspector Utility controls */}
        <div className="space-y-2 mt-auto pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onRotate}
            className="w-full bg-[#0d0f14] hover:bg-slate-800 text-slate-200 border border-slate-800 py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5 text-cyan-400" /> Rotate 45°
          </button>

          <button
            type="button"
            onClick={handleDuplicate}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5 text-cyan-300" /> Duplicate Element
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="w-full bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 border border-rose-900/30 py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Delete Element
          </button>
        </div>
      </div>
    </aside>
  );
};

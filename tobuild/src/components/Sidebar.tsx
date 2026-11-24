import React from 'react';
import { Prefab, CustomICDef } from '../types';
import {
  ToggleRight,
  Radio,
  Lightbulb,
  Clock,
  Circle,
  Type,
  Database,
  Binary,
  Shuffle,
  Tv,
  Terminal,
  Package,
  Cpu,
  Hash,
  Grid,
  FileDigit,
  LayoutGrid,
  Scale,
  Trash2,
  Settings
} from 'lucide-react';

interface SidebarProps {
  customPrefabs: Prefab[];
  onSpawnPrefab: (index: number) => void;
  onClearCustomPrefabs?: () => void;
  customICs?: CustomICDef[];
  onSpawnIC?: (icDef: CustomICDef) => void;
  onEditIC?: (id: string) => void;
  onDeleteIC?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  customPrefabs,
  onSpawnPrefab,
  customICs = [],
  onSpawnIC,
  onEditIC,
  onDeleteIC
}) => {
  const [deleteIcId, setDeleteIcId] = React.useState<string | null>(null);
  const [deleteIcName, setDeleteIcName] = React.useState<string>('');

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, type: string) => {
    e.dataTransfer.setData('nodeType', type);
  };

  return (
    <>
      <aside className="w-80 bg-[#0a0c11] border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
      
      {/* Dynamic Interactive Inputs / Outputs */}
      <div className="p-3 border-b border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <ToggleRight className="w-3.5 h-3.5 text-cyan-400" />
          Interactive I/O
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div
            className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
            draggable
            onDragStart={(e) => handleDragStart(e, 'toggle')}
          >
            <ToggleRight className="w-6 h-6 text-[#a6e3a1] group-hover:scale-105 transition" />
            <span className="text-[11px] font-medium mt-1 text-slate-200">Switch Input</span>
          </div>

          <div
            className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
            draggable
            onDragStart={(e) => handleDragStart(e, 'pushbutton')}
          >
            <Radio className="w-6 h-6 text-[#f9e2af] group-hover:scale-105 transition" />
            <span className="text-[11px] font-medium mt-1 text-slate-200">Push Button</span>
          </div>

          <div
            className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
            draggable
            onDragStart={(e) => handleDragStart(e, 'lightbulb')}
          >
            <Lightbulb className="w-6 h-6 text-cyan-400 group-hover:scale-105 transition" />
            <span className="text-[11px] font-medium mt-1 text-slate-200">LED Output</span>
          </div>

          <div
            className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center"
            draggable
            onDragStart={(e) => handleDragStart(e, 'clock')}
          >
            <Clock className="w-6 h-6 text-cyan-500 group-hover:scale-105 transition" />
            <span className="text-[11px] font-medium mt-1 text-slate-200">System Clock</span>
          </div>

          <div
            className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center col-span-2"
            draggable
            onDragStart={(e) => handleDragStart(e, 'junction')}
          >
            <Circle className="w-4 h-4 fill-cyan-400 text-cyan-400 group-hover:scale-105 transition" />
            <span className="text-[11px] font-medium mt-1 text-slate-200">Junction Dot (ROM/Routing)</span>
          </div>

          <div
            className="group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-grab active:cursor-grabbing transition flex flex-col items-center text-center col-span-2"
            draggable
            onDragStart={(e) => handleDragStart(e, 'text_label')}
          >
            <Type className="w-5 h-5 text-slate-400 group-hover:scale-105 transition" />
            <span className="text-[11px] font-medium mt-1 text-slate-200">Text Annotation</span>
          </div>
        </div>
      </div>

      {/* Logic Gates */}
      <div className="p-3 border-b border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          Boolean Logic Gates
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
              className={`group bg-[#0d0f14] p-2 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-center justify-between ${
                g.colSpan ? 'col-span-2' : ''
              }`}
              draggable
              onDragStart={(e) => handleDragStart(e, g.type)}
            >
              <span className="text-xs font-bold text-slate-200">{g.name}</span>
              <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                {g.count || '2-in'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Memory & Modules */}
      <div className="p-3 border-b border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-rose-400" />
          Configurable Modules
        </h3>
        <div className="space-y-2">
          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'configurable_ram')}
          >
            <Database className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">Configurable RAM cell</div>
              <div className="text-[10px] text-slate-400">Dimensions and address bits adjustable in properties drawer.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'configurable_decoder')}
          >
            <Binary className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">Binary Decoder</div>
              <div className="text-[10px] text-slate-400">Takes an $n$-bit input to trigger exactly one of $2^n$ outputs.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'configurable_mux')}
          >
            <Shuffle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">Configurable MUX</div>
              <div className="text-[10px] text-slate-400">Passes a selected data pin. Custom select bits up to 4 bits.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'comparator')}
          >
            <Scale className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">8-Bit Comparator</div>
              <div className="text-[10px] text-slate-400">Takes two 8-bit inputs (A0-A7, B0-B7) and calculates if A &gt; B, B &gt; A, or A = B.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Displays & Advanced ICs */}
      <div className="p-3 border-b border-slate-800 flex-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <Tv className="w-3.5 h-3.5 text-cyan-400" />
          Advanced ICs &amp; Screen
        </h3>
        <div className="space-y-2">
          
          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'pixel_display')}
          >
            <Tv className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <div className="text-xs font-bold text-white">256x256 GPU Visual Screen</div>
              <div className="text-[10px] text-slate-400">Double-buffered. X/Y coordinate write controlled pixel-drawing.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'ascii_display')}
          >
            <Terminal className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">ASCII Terminal Readout</div>
              <div className="text-[10px] text-slate-400">Prints characters based on 8-bit inputs on state push triggers.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'prefab_8bit_dlatch')}
          >
            <Package className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">8-Bit D-Latch Register</div>
              <div className="text-[10px] text-slate-400">Dynamic sequential register storing 8-bits on CLK edges.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'prefab_8bit_cla')}
          >
            <Cpu className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">8-Bit Carry-Lookahead Adder</div>
              <div className="text-[10px] text-slate-400">Unfolds parallel carry calculation sums for custom processors.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'prefab_8bit_cla_sub')}
          >
            <Cpu className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">8-Bit CLA Subtractor</div>
              <div className="text-[10px] text-slate-400">Parallel lookahead borrow-subtraction (A - B) with Borrow-out.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'prefab_8bit_mult')}
          >
            <Cpu className="w-5 h-5 text-[#eba0ac] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">8-Bit High-Speed Multiplier</div>
              <div className="text-[10px] text-slate-400">High-speed combinational binary array multiplier (A * B).</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'prefab_8bit_div')}
          >
            <Cpu className="w-5 h-5 text-[#f5c2e7] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">8-Bit High-Speed Divider</div>
              <div className="text-[10px] text-slate-400">High-speed array division (A / B) outputting quotient &amp; remainder.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'dec_to_bin')}
          >
            <Hash className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">Decimal Numpad</div>
              <div className="text-[10px] text-slate-400">Type digits. Dynamic output binary bit layouts.</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'display_decimal')}
          >
            <FileDigit className="w-5 h-5 text-fuchsia-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">Binary to Decimal Display</div>
              <div className="text-[10px] text-slate-400">Decodes 8-bit logical high inputs into standard numbers (0-255).</div>
            </div>
          </div>

          <div
            className="group bg-[#0d0f14] p-2.5 rounded border border-slate-800 hover:border-cyan-500 hover:shadow-[0_0_8px_rgba(6,182,212,0.15)] cursor-grab active:cursor-grabbing transition flex items-start gap-2.5"
            draggable
            onDragStart={(e) => handleDragStart(e, 'seven_segment')}
          >
            <LayoutGrid className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">7-Segment Hexadecimal Display</div>
              <div className="text-[10px] text-slate-400">Simulates standard hardware displaying values (0-F).</div>
            </div>
          </div>

        </div>
      </div>

      {/* Custom Integrated Circuits (ICs) */}
      <div className="p-3 border-t border-slate-800 bg-[#050608]/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5" />
          Custom ICs
        </h3>

        {customICs.length === 0 ? (
          <div className="text-center py-4 text-[11px] text-slate-500 border border-dashed border-slate-800 rounded bg-[#0d0f14] leading-relaxed">
            No custom ICs created yet.<br />Open <strong className="text-rose-300">"Custom IC Maker"</strong> in the top bar.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {customICs.map((ic) => (
              <div
                key={ic.id}
                className="flex items-center justify-between p-2 bg-[#0d0f14] hover:bg-rose-950/10 border border-slate-800 hover:border-rose-500 rounded transition group cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('nodeType', 'custom_ic');
                  e.dataTransfer.setData('icId', ic.id);
                }}
              >
                <div className="flex items-center space-x-2 text-rose-300 w-full overflow-hidden mr-2">
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

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSpawnIC) onSpawnIC(ic);
                    }}
                    className="text-[10px] bg-rose-900/20 hover:bg-rose-600/60 text-rose-300 hover:text-white px-1.5 py-0.5 rounded transition font-bold"
                  >
                    Spawn
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEditIC) onEditIC(ic.id);
                    }}
                    title="Edit Custom IC"
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteIcId(ic.id);
                      setDeleteIcName(ic.name);
                    }}
                    title="Delete Custom IC"
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom User Prefabs */}
      <div className="p-3 border-t border-slate-800 bg-[#050608]/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <Grid className="w-3.5 h-3.5 text-cyan-400" />
          My Custom Prefabs
        </h3>
        
        {customPrefabs.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-500 border border-dashed border-slate-800 rounded bg-[#0d0f14]">
            No custom templates yet.<br />Select items &amp; click "Create Prefab".
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {customPrefabs.map((pref, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-[#0d0f14] hover:bg-cyan-950/20 border border-slate-800 hover:border-cyan-500 rounded transition"
              >
                <div className="flex items-center space-x-2 text-cyan-300 w-full overflow-hidden mr-2">
                  <Grid className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-xs font-bold text-white truncate">{pref.name}</span>
                </div>
                <button
                  onClick={() => onSpawnPrefab(idx)}
                  className="text-[10px] bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white px-2 py-1 rounded transition shrink-0 font-bold"
                >
                  Spawn
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>

    {deleteIcId && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in text-slate-200">
        <div className="bg-[#1e1e2e] border border-slate-800 p-6 rounded-xl max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
            <Trash2 className="w-5 h-5 text-rose-500" />
            Delete Custom IC?
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mb-6">
            Are you sure you want to delete custom IC <strong className="text-white">"{deleteIcName}"</strong>? All existing instances of this IC in workspaces will remain static, but you won't be able to spawn new ones.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setDeleteIcId(null);
                setDeleteIcName('');
              }}
              className="px-4 py-2 text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-slate-300 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (onDeleteIC) onDeleteIC(deleteIcId);
                setDeleteIcId(null);
                setDeleteIcName('');
              }}
              className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-lg shadow-rose-600/20 transition"
            >
              Yes, Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

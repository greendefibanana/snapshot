import React from 'react';
import { COLORS } from '../constants';
import Button from './ui/Button';
import Card from './ui/Card';
import { Type, MousePointer2, Layers, Palette } from 'lucide-react';

const DesignTokens: React.FC = () => {
  return (
    <div className="space-y-16 pb-20">
      
      {/* Intro */}
      <div className="text-center space-y-4">
        <h1 className="text-6xl md:text-8xl font-black text-white uppercase italic tracking-tighter transform -skew-x-6 drop-shadow-[4px_4px_0_rgba(204,255,0,1)]">
          Snap<span className="text-ink-primary">shot</span>
        </h1>
        <p className="text-xl text-white/60 font-medium max-w-2xl mx-auto">
          UI Design System & Token Specification
        </p>
      </div>

      {/* Colors Section */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 border-b border-white/10 pb-4">
          <Palette className="w-8 h-8 text-ink-primary" />
          <h2 className="text-3xl font-bold uppercase italic">01. Color Tokens</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {COLORS.map((color) => (
            <div key={color.value} className="group">
              <div 
                className={`h-32 w-full rounded-2xl shadow-ink-hard border-2 border-black mb-4 ${color.class} group-hover:scale-105 transition-transform duration-200 relative overflow-hidden`}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-white text-sm">{color.name}</p>
                <p className="font-mono text-xs text-white/50 bg-black/30 inline-block px-2 py-1 rounded">{color.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography Section */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 border-b border-white/10 pb-4">
          <Type className="w-8 h-8 text-ink-secondary" />
          <h2 className="text-3xl font-bold uppercase italic">02. Typography Scale</h2>
        </div>
        
        <div className="space-y-8 bg-ink-surface p-8 rounded-3xl border border-white/5 shadow-ink-hard">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center border-b border-white/5 pb-8">
            <div className="md:col-span-3 text-white/40 font-mono text-sm">Display Title</div>
            <div className="md:col-span-9">
              <h1 className="text-6xl font-black uppercase italic tracking-tighter transform -skew-x-6 text-white">
                Ranked Battle
              </h1>
              <p className="mt-2 text-xs font-mono text-ink-primary">font-black / uppercase / italic / -skew-x-6</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center border-b border-white/5 pb-8">
            <div className="md:col-span-3 text-white/40 font-mono text-sm">Section Header</div>
            <div className="md:col-span-9">
              <h2 className="text-3xl font-bold uppercase tracking-wide text-white">
                Loadout Selection
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center border-b border-white/5 pb-8">
            <div className="md:col-span-3 text-white/40 font-mono text-sm">Body Text</div>
            <div className="md:col-span-9">
              <p className="text-lg text-white/80 leading-relaxed max-w-2xl">
                Choose your weapon wisely. Each ink blaster has unique stats for range, damage, and fire rate. Coordinate with your team to dominate the arena.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-3 text-white/40 font-mono text-sm">Label / Micro</div>
            <div className="md:col-span-9 flex gap-4">
              <span className="text-xs font-black uppercase bg-ink-primary text-black px-2 py-1 rounded">Rank S+</span>
              <span className="text-xs font-black uppercase bg-ink-danger text-white px-2 py-1 rounded">Enemy</span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Elements */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 border-b border-white/10 pb-4">
          <MousePointer2 className="w-8 h-8 text-ink-accent" />
          <h2 className="text-3xl font-bold uppercase italic">03. Interactive & Buttons</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Buttons */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white/60 uppercase">Button Variants</h3>
            <div className="flex flex-wrap gap-4 items-end">
              <Button variant="primary" size="lg">Primary Action</Button>
              <Button variant="secondary" size="md">Secondary</Button>
              <Button variant="danger" size="md">Danger Zone</Button>
              <Button variant="ghost" size="sm">Ghost Button</Button>
            </div>
            <div className="p-4 bg-ink-bg border border-dashed border-white/20 rounded-xl">
               <p className="text-sm font-mono text-white/60 mb-2">Button Physics</p>
               <p className="text-xs text-white/40">Buttons have a hard shadow that disappears on active press, simulating a mechanical switch.</p>
            </div>
          </div>

          {/* Cards */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white/60 uppercase">Card Styles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card variant="elevated" className="p-6 h-40 flex flex-col justify-between">
                <span className="text-xs font-mono text-white/40">Variant: Elevated</span>
                <span className="text-xl font-bold uppercase">Item Card</span>
              </Card>
              <Card variant="glass" className="p-6 h-40 flex flex-col justify-between">
                <span className="text-xs font-mono text-white/40">Variant: Glass</span>
                <span className="text-xl font-bold uppercase">Overlay HUD</span>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Radius & Shadows */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 border-b border-white/10 pb-4">
          <Layers className="w-8 h-8 text-white" />
          <h2 className="text-3xl font-bold uppercase italic">04. Radius & Shadows</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="space-y-4">
                <div className="w-32 h-32 mx-auto bg-ink-primary rounded-lg shadow-ink-hard"></div>
                <p className="font-mono text-sm text-white/60">rounded-lg / shadow-hard</p>
            </div>
            <div className="space-y-4">
                <div className="w-32 h-32 mx-auto bg-ink-secondary rounded-3xl shadow-ink-hard-lg"></div>
                <p className="font-mono text-sm text-white/60">rounded-3xl / shadow-hard-lg</p>
            </div>
            <div className="space-y-4">
                <div className="w-32 h-32 mx-auto bg-ink-accent rounded-full shadow-ink-hard-xl"></div>
                <p className="font-mono text-sm text-white/60">rounded-full / shadow-hard-xl</p>
            </div>
        </div>
      </section>

    </div>
  );
};

export default DesignTokens;
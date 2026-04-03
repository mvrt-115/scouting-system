'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Sparkles, Send, Loader2, Ban, Plus, Eye, Menu, GripVertical, Minimize2, Maximize2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Global state
let globalNotes = '';
interface DnpEntry { team: string; reason: string; }
let globalDnpList: DnpEntry[] = [];
let globalWatchList: DnpEntry[] = [];
const listeners = new Set<() => void>();
function notifyListeners() { listeners.forEach(cb => cb()); }

export function setGlobalNotes(notes: string) { globalNotes = notes; notifyListeners(); }
export function getGlobalNotes() { return globalNotes; }
export function setGlobalDnpList(list: DnpEntry[]) { globalDnpList = [...list]; notifyListeners(); }
export function getGlobalDnpList() { return [...globalDnpList]; }
export function addToGlobalDnp(team: string, reason: string) {
  if (!globalDnpList.find(e => e.team === team.trim())) {
    globalDnpList = [...globalDnpList, { team: team.trim(), reason }];
    notifyListeners();
  }
}
export function removeFromGlobalDnp(team: string) {
  globalDnpList = globalDnpList.filter(e => e.team !== team);
  notifyListeners();
}
export function setGlobalWatchList(list: DnpEntry[]) { globalWatchList = [...list]; notifyListeners(); }
export function getGlobalWatchList() { return [...globalWatchList]; }
export function addToGlobalWatch(team: string, reason: string) {
  if (!globalWatchList.find(e => e.team === team.trim())) {
    globalWatchList = [...globalWatchList, { team: team.trim(), reason }];
    notifyListeners();
  }
}
export function removeFromGlobalWatch(team: string) {
  globalWatchList = globalWatchList.filter(e => e.team !== team);
  notifyListeners();
}
export function isTeamOnDnpList(team: string): boolean {
  return globalDnpList.some(e => e.team === team.trim());
}
export function isTeamOnWatchList(team: string): boolean {
  return globalWatchList.some(e => e.team === team.trim());
}
export function getDnpReason(team: string): string | undefined {
  return globalDnpList.find(e => e.team === team.trim())?.reason;
}
export function getWatchReason(team: string): string | undefined {
  return globalWatchList.find(e => e.team === team.trim())?.reason;
}

// Hooks
function useGlobalNotes() {
  const [notes, setNotes] = useState(globalNotes);
  useEffect(() => {
    const update = () => setNotes(globalNotes);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return [notes, setGlobalNotes] as const;
}
function useGlobalDnpList() {
  const [list, setList] = useState<DnpEntry[]>([...globalDnpList]);
  useEffect(() => {
    const update = () => setList([...globalDnpList]);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return [list, setGlobalDnpList] as const;
}
function useGlobalWatchList() {
  const [list, setList] = useState<DnpEntry[]>([...globalWatchList]);
  useEffect(() => {
    const update = () => setList([...globalWatchList]);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return [list, setGlobalWatchList] as const;
}

// Delete button
function LongPressDeleteButton({ onDelete }: { onDelete: () => void }) {
  const [isPressed, setIsPressed] = useState(false);
  const [isRed, setIsRed] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPress = () => {
    setIsPressed(true);
    timerRef.current = setTimeout(() => { setIsRed(true); if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50); }, 2000);
  };
  const endPress = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (isRed) onDelete();
    setIsPressed(false); setIsRed(false);
  };
  const cancelPress = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } setIsPressed(false); setIsRed(false); };
  return (
    <button type="button" onMouseDown={startPress} onMouseUp={endPress} onMouseLeave={cancelPress} onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={cancelPress}
      className={`ml-1 flex h-4 w-4 items-center justify-center rounded-full transition-all duration-300 ${isRed ? 'scale-125 bg-red-600' : isPressed ? 'scale-110 bg-red-300' : 'bg-red-200 hover:bg-red-300'}`}>
      <X className={`h-2.5 w-2.5 transition-colors ${isRed ? 'text-white' : 'text-red-700'}`} />
    </button>
  );
}

// Draggable Resizable Window
function DraggableWindow({
  id,
  title,
  icon,
  defaultX,
  defaultY,
  defaultWidth,
  defaultHeight,
  minWidth = 280,
  minHeight = 200,
  badgeCount = 0,
  onClose,
  children
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  defaultX: number;
  defaultY: number;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
  badgeCount?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState({ x: defaultX, y: defaultY });
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.window-control')) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeStart.current = { x: clientX, y: clientY, w: size.width, h: size.height };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (isDragging) {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - size.width, clientX - dragStart.current.x)),
          y: Math.max(0, Math.min(window.innerHeight - 50, clientY - dragStart.current.y))
        });
      }
      if (isResizing && !isMinimized) {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        setSize({
          width: Math.max(minWidth, Math.min(window.innerWidth - position.x, resizeStart.current.w + (clientX - resizeStart.current.x))),
          height: Math.max(minHeight, Math.min(window.innerHeight - position.y - 20, resizeStart.current.h + (clientY - resizeStart.current.y)))
        });
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging, isResizing, minWidth, minHeight, size.width, position.x, position.y, isMinimized]);

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed z-50 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-white shadow-xl hover:scale-105 transition-transform"
        style={{ right: 20, bottom: 80 + (id === 'notes' ? 0 : id === 'ai' ? 50 : id === 'dnp' ? 100 : 150) }}
      >
        {icon}
        <span className="text-sm font-bold">{title}</span>
        {badgeCount > 0 && <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-bold">{badgeCount > 9 ? '9+' : badgeCount}</span>}
        <Maximize2 className="h-4 w-4 ml-1" />
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 flex flex-col rounded-xl border border-purple-300/50 bg-white shadow-2xl shadow-purple-900/20 dark:border-purple-700/30 dark:bg-zinc-900"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* Header - Draggable */}
      <div
        className="flex items-center justify-between border-b border-purple-200/50 bg-purple-50 px-3 py-2 dark:border-purple-800/30 dark:bg-purple-900/20 cursor-grab active:cursor-grabbing"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-purple-400" />
          {icon}
          <span className="font-bold text-purple-900 dark:text-purple-100">{title}</span>
          {badgeCount > 0 && (
            <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-bold text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 window-control">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="rounded-full p-1.5 text-purple-400 hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-800/50"
            title="Minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-purple-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/50"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      >
        <div className="absolute bottom-1.5 right-1.5 w-2 h-2 border-r-2 border-b-2 border-purple-400/50" />
      </div>
    </div>
  );
}
function WidgetCard({ title, icon, badgeCount = 0, isOpen, onToggle, children, maxHeight = "300px" }: {
  title: string; icon: React.ReactNode; badgeCount?: number; isOpen: boolean; onToggle: () => void;
  children: React.ReactNode; maxHeight?: string;
}) {
  return (
    <div className={`rounded-xl border border-purple-200/70 bg-white shadow-lg shadow-purple-900/10 dark:border-purple-800/40 dark:bg-zinc-900 ${isOpen ? 'w-80' : ''}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between rounded-t-xl bg-purple-50 px-3 py-2 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-bold text-purple-900 dark:text-purple-100">{title}</span>
          {badgeCount > 0 && <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-bold text-white">{badgeCount > 99 ? '99+' : badgeCount}</span>}
        </div>
        <span className="text-xs text-purple-600">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="p-3" style={{ maxHeight, overflow: 'auto' }}>{children}</div>}
    </div>
  );
}

// Notes Content
function NotesContent() {
  const [notes, setNotes] = useGlobalNotes();
  return (
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={10}
      className="w-full h-full resize-none rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
      placeholder="Quick notes..." />
  );
}

// AI Content
function AIContent() {
  const [messages, setMessages] = useState<Array<{role: 'user'|'assistant'; text: string}>>([{ role: 'assistant', text: 'Hi! Ask me about teams or scouting data.' }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/data-viewer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg, pageContext: 'global' }) });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.response || 'Sorry, could not process that.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Try again.' }]);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.map((msg, idx) => (
          <div key={idx} className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'ml-auto bg-purple-600 text-white' : 'bg-purple-100/50 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100'}`}>
            {msg.text}
          </div>
        ))}
        {isLoading && <div className="text-xs text-purple-400">Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-2">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Ask about teams..."
          className="flex-1 rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white" />
        <button onClick={sendMessage} disabled={isLoading || !input.trim()} className="rounded-lg bg-purple-600 p-2 text-white hover:bg-purple-700 disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// DNP Content
function DNPContent() {
  const [dnpList, setDnpList] = useGlobalDnpList();
  const [newTeam, setNewTeam] = useState('');
  const [newReason, setNewReason] = useState('');
  const addTeam = () => { if (newTeam.trim() && !dnpList.find(e => e.team === newTeam.trim())) { setDnpList([...dnpList, { team: newTeam.trim(), reason: newReason.trim() }]); setNewTeam(''); setNewReason(''); } };
  const removeTeam = (team: string) => setDnpList(dnpList.filter(e => e.team !== team));

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex gap-2">
        <input type="text" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTeam()} placeholder="Team #"
          className="w-20 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:border-red-900/50 dark:bg-zinc-950 dark:text-white" />
        <input type="text" value={newReason} onChange={(e) => setNewReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTeam()} placeholder="Reason (optional)"
          className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:border-red-900/50 dark:bg-zinc-950 dark:text-white" />
        <button onClick={addTeam} disabled={!newTeam.trim()} className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"><Plus className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1 pr-1">
        {dnpList.length === 0 && (
          <div className="text-center py-8 text-red-400/60 dark:text-red-500/40 text-sm italic">
            No teams on DNP list
          </div>
        )}
        {dnpList.map((entry) => (
          <div key={entry.team} className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 shadow-sm dark:border-red-900/40 dark:bg-red-950/20">
            <div className="flex-1 min-w-0">
              <span className="font-bold text-red-900 dark:text-red-200">{entry.team}</span>
              {entry.reason && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">{entry.reason}</p>}
            </div>
            <button onClick={() => removeTeam(entry.team)} className="ml-2 p-1.5 rounded-full text-red-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="text-xs text-red-500/70 dark:text-red-400/50 text-center">
        {dnpList.length} team{dnpList.length !== 1 ? 's' : ''} on DNP list
      </div>
    </div>
  );
}

// Watch Content
function WatchContent() {
  const [watchList, setWatchList] = useGlobalWatchList();
  const [newTeam, setNewTeam] = useState('');
  const [newReason, setNewReason] = useState('');
  const addTeam = () => { if (newTeam.trim() && !watchList.find(e => e.team === newTeam.trim())) { setWatchList([...watchList, { team: newTeam.trim(), reason: newReason.trim() }]); setNewTeam(''); setNewReason(''); } };
  const removeTeam = (team: string) => setWatchList(watchList.filter(e => e.team !== team));

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex gap-2">
        <input type="text" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTeam()} placeholder="Team #"
          className="w-20 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-emerald-900/50 dark:bg-zinc-950 dark:text-white" />
        <input type="text" value={newReason} onChange={(e) => setNewReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTeam()} placeholder="Reason (optional)"
          className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-emerald-900/50 dark:bg-zinc-950 dark:text-white" />
        <button onClick={addTeam} disabled={!newTeam.trim()} className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"><Plus className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1 pr-1">
        {watchList.length === 0 && (
          <div className="text-center py-8 text-emerald-400/60 dark:text-emerald-500/40 text-sm italic">
            No teams on watch list
          </div>
        )}
        {watchList.map((entry) => (
          <div key={entry.team} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex-1 min-w-0">
              <span className="font-bold text-emerald-900 dark:text-emerald-200">{entry.team}</span>
              {entry.reason && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">{entry.reason}</p>}
            </div>
            <button onClick={() => removeTeam(entry.team)} className="ml-2 p-1.5 rounded-full text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-900/30 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="text-xs text-emerald-500/70 dark:text-emerald-400/50 text-center">
        {watchList.length} team{watchList.length !== 1 ? 's' : ''} on watch list
      </div>
    </div>
  );
}

// Main Widget Manager with Hamburger Menu and Draggable Windows
export function GlobalWidgets() {
  const [openWidgets, setOpenWidgets] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [dnpList] = useGlobalDnpList();
  const [watchList] = useGlobalWatchList();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const toggleWidget = (id: string) => {
    setOpenWidgets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const windowConfigs = [
    ...(isAdmin ? [{ id: 'ai', title: 'AI Assistant', icon: <Sparkles className="h-4 w-4" />, content: <AIContent />, count: 0, defaultX: 400, defaultY: 50, defaultWidth: 350, defaultHeight: 400 }] : []),
    { id: 'dnp', title: 'DNP List', icon: <Ban className="h-4 w-4" />, content: <DNPContent />, count: dnpList.length, defaultX: 20, defaultY: 350, defaultWidth: 380, defaultHeight: 400 },
    { id: 'watch', title: 'Watch List', icon: <Eye className="h-4 w-4" />, content: <WatchContent />, count: watchList.length, defaultX: 20, defaultY: 100, defaultWidth: 380, defaultHeight: 400 },
  ];

  // All buttons in hamburger menu - only show AI for admins
  const allButtons = [
    ...(isAdmin ? [{ id: 'ai', icon: <Sparkles className="h-4 w-4" />, count: 0, baseColor: 'bg-purple-600', openColor: 'bg-purple-800' }] : []),
    { id: 'dnp', icon: <Ban className="h-4 w-4" />, count: dnpList.length, baseColor: 'bg-red-600', openColor: 'bg-red-800' },
    { id: 'watch', icon: <Eye className="h-4 w-4" />, count: watchList.length, baseColor: 'bg-emerald-600', openColor: 'bg-emerald-800' },
  ];

  return (
    <>
      {/* Draggable Windows */}
      {windowConfigs.filter(w => openWidgets.has(w.id)).map(w => (
        <DraggableWindow
          key={w.id}
          id={w.id}
          title={w.title}
          icon={w.icon}
          defaultX={w.defaultX}
          defaultY={w.defaultY}
          defaultWidth={w.defaultWidth}
          defaultHeight={w.defaultHeight}
          badgeCount={w.count}
          onClose={() => toggleWidget(w.id)}
        >
          {w.content}
        </DraggableWindow>
      ))}

      {/* Hamburger Menu */}
      <div className="fixed bottom-4 right-4 z-[60]">
        <div className="relative">
          {/* Menu Items (shown when menuOpen) */}
          {menuOpen && (
            <div className="absolute bottom-full right-0 mb-2 flex flex-col gap-1.5">
              {allButtons.map(b => {
                const isOpen = openWidgets.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleWidget(b.id)}
                    className={`flex items-center gap-2 rounded-lg ${isOpen ? b.openColor : b.baseColor} px-3 py-2 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105`}
                  >
                    {b.icon}
                    <span className="capitalize">{b.id}</span>
                    {b.count > 0 && <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">{b.count > 9 ? '9+' : b.count}</span>}
                  </button>
                );
              })}
            </div>
          )}
          
          {/* Main Hamburger Button */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${menuOpen ? 'bg-purple-700' : 'bg-purple-600'} text-white shadow-xl transition-all hover:scale-105 hover:bg-purple-500`}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </>
  );
}

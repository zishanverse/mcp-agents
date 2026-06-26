'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Compass, LogOut, Cpu, Settings, CheckCircle2, AlertCircle, 
  Send, Sparkles, Download, ExternalLink, Calendar, Eye, 
  FileText, LayoutGrid, ChevronRight, HelpCircle, Menu, X
} from 'lucide-react';

const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.52 3.5 12 3.5 12 3.5s-7.52 0-9.388.555A3.002 3.002 0 0 0 .502 6.163C0 8.03 0 12 0 12s0 3.97.502 5.837a3.003 3.003 0 0 0 2.11 2.108C4.48 20.5 12 20.5 12 20.5s7.52 0 9.388-.555a3.002 3.002 0 0 0 2.11-2.108C24 15.97 24 12 24 12s0-3.97-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

interface LearningPathRecord {
  id: number;
  goal: string;
  playlist_url: string | null;
  google_doc_url: string | null;
  notion_url: string | null;
  markdown: string | null;
  created_at: string;
}

interface UserData {
  user: { id: number; email: string; name: string };
  connections: Record<string, boolean>;
  notionParentId: string;
  history: LearningPathRecord[];
}

// Custom simple Markdown-to-HTML parser for rendering the path safely
function parseMarkdown(md: string): string {
  if (!md) return '';
  let html = md;

  // Escape basic HTML tags to avoid styling issues
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (preformatted)
  html = html.replace(/```([\s\S]+?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');

  // Bold texts
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bullet items
  html = html.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');

  // Convert line breaks
  html = html.replace(/\r?\n/g, '<br>');

  // Clean up duplicate linebreaks inside code blocks and tables
  html = html.replace(/(<pre>[\s\S]+?<\/pre>)/g, (match) => match.replace(/<br>/g, '\n'));

  return html;
}

export default function DashboardPage() {
  const router = useRouter();
  
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [notionParentIdInput, setNotionParentIdInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [generating, setGenerating] = useState(false);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [result, setResult] = useState<{
    markdown: string;
    playlistUrl: string | null;
    docUrl: string | null;
    notionUrl: string | null;
    actions: any;
  } | null>(null);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchUserData = async () => {
    try {
      const res = await fetch('/api/user');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to load user data');
      }
      const uData: UserData = await res.json();
      setData(uData);
      setNotionParentIdInput(uData.notionParentId || '');
    } catch (e: any) {
      console.error(e);
      setNotification({ type: 'error', message: 'Failed to synchronize workspace details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();

    // Check for success redirects from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const success = params.get('connection_success');
    const error = params.get('connection_error');

    if (success) {
      setNotification({ type: 'success', message: `✅ Connected ${success.toUpperCase()} successfully!` });
      // Remove query parameters
      window.history.replaceState({}, document.title, '/');
    } else if (error) {
      setNotification({ type: 'error', message: `❌ Failed to connect: ${decodeURIComponent(error)}` });
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConnect = async (provider: string) => {
    try {
      const res = await fetch(`/api/oauth/connect?provider=${provider}`);
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to start connection');
      }
      if (payload.url) {
        window.location.href = payload.url;
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message });
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', provider }),
      });
      if (res.ok) {
        setNotification({ type: 'success', message: `Disconnected ${provider.toUpperCase()}` });
        fetchUserData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNotionParent = async () => {
    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_notion_parent', parentPageId: notionParentIdInput }),
      });
      const resData = await res.json();
      if (res.ok) {
        setNotification({ type: 'success', message: 'Notion parent page configured successfully.' });
        setNotionParentIdInput(resData.parentPageId || '');
        fetchUserData();
      } else {
        throw new Error(resData.error || 'Failed to save config.');
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message });
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setProgressLogs([]);
    setResult(null);

    const goalText = prompt;
    setChatHistory(prev => [...prev, { role: 'user', content: goalText }]);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goalText, modelName: selectedModel }),
      });

      if (!res.ok) {
        const errPayload = await res.json();
        throw new Error(errPayload.error || 'Failed to process request');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Body reader stream is not supported.');

      const decoder = new TextDecoder();
      let partialLine = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = (partialLine + chunk).split('\n\n');
        partialLine = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const payload = JSON.parse(jsonStr);
            if (payload.progress) {
              setProgressLogs(prev => [...prev, payload.progress]);
            } else if (payload.error) {
              throw new Error(payload.error);
            } else if (payload.success) {
              setResult({
                markdown: payload.markdown,
                playlistUrl: payload.playlistUrl,
                docUrl: payload.docUrl,
                notionUrl: payload.notionUrl,
                actions: payload.actions,
              });
              setChatHistory(prev => [...prev, { role: 'assistant', content: 'Learning path generated successfully! Review the exports below.' }]);
              fetchUserData();
            }
          } catch (pe: any) {
            throw new Error(pe.message || 'Failed parsing response chunk.');
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setProgressLogs(prev => [...prev, `❌ Error: ${err.message}`]);
      setNotification({ type: 'error', message: err.message });
    } finally {
      setGenerating(false);
      setPrompt('');
    }
  };

  const handleDownloadMarkdown = () => {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'learning_path.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030712]">
        <div className="w-16 h-16 border-4 border-violet-600/20 border-t-violet-500 rounded-full animate-spin mb-4" />
        <div className="text-2xl font-bold tracking-wider bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent animate-pulse">
          Compass Generator
        </div>
        <div className="text-slate-500 text-xs tracking-widest uppercase mt-2">Loading workspace...</div>
      </div>
    );
  }

  const connectedCount = data ? Object.values(data.connections).filter(Boolean).length : 0;

  return (
    <div className="min-h-screen flex flex-col lg:grid lg:grid-cols-12 gap-0 relative overflow-hidden bg-[#030712]">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 p-4 rounded-2xl shadow-xl border flex items-start gap-3 max-w-sm animate-fade-in ${
          notification.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300' : 'bg-red-950/80 border-red-500/30 text-red-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-emerald-400" /> : <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />}
          <div>
            <p className="text-sm font-semibold">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white ml-auto text-xs font-bold pl-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* MOBILE HEADER BAR */}
      <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-slate-950/85 border-b border-slate-900/60 sticky top-0 z-35 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-violet-500/10">
            <Compass className="w-5 h-5" />
          </div>
          <span className="text-base font-bold tracking-wide bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Compass Generator
          </span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer"
          title="Toggle Navigation"
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* MOBILE SIDEBAR BACKDROP */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
        />
      )}

      {/* LEFT COLUMN - Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-80 lg:w-auto lg:col-span-3 
        bg-slate-950/95 lg:bg-slate-950/40 border-r border-slate-900/60 
        p-6 flex flex-col justify-between z-50 lg:z-20 backdrop-blur-2xl
        transition-sidebar transform lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="space-y-6">
          {/* Header branding visible in drawer */}
          <div className="lg:hidden flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-violet-500" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Workspace settings</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User profile card */}
          <div className="flex items-center justify-between bg-slate-900/30 border border-slate-800/40 p-4 rounded-2xl">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white truncate">👤 {data?.user.name}</h4>
              <p className="text-xs text-slate-500 truncate">{data?.user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all hover:scale-[1.05] active:scale-[0.95] cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <hr className="border-slate-900/60" />

          {/* Model picker */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> AI Orchestrator
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:border-violet-500/50 outline-none transition-all duration-200 cursor-pointer"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
              <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro (Detail)</option>
            </select>
          </div>

          <hr className="border-slate-900/60" />

          {/* Connected Integrations list */}
          <div className="space-y-4">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Integrations
            </label>

            {/* YouTube Chip */}
            <div className="space-y-2">
              <div className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all duration-300 ${
                data?.connections.youtube 
                  ? 'bg-emerald-950/20 border-emerald-500/30 glow-success text-emerald-400' 
                  : 'bg-slate-950/40 border-slate-900 text-slate-400'
              }`}>
                <span className="flex items-center gap-2">
                  <YoutubeIcon className={`w-4 h-4 ${data?.connections.youtube ? 'text-emerald-400' : 'text-slate-500'}`} /> YouTube
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${data?.connections.youtube ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  {data?.connections.youtube ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {data?.connections.youtube ? (
                <button
                  onClick={() => { handleDisconnect('youtube'); setIsSidebarOpen(false); }}
                  className="w-full py-2 px-3 text-xs bg-red-950/10 border border-red-950/50 hover:bg-red-950/30 text-red-400 hover:border-red-500/50 rounded-xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  Disconnect YouTube
                </button>
              ) : (
                <button
                  onClick={() => { handleConnect('youtube'); setIsSidebarOpen(false); }}
                  className="w-full py-2 px-3 text-xs bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold rounded-xl transition-all duration-200 shadow-md hover:shadow-violet-500/10 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Connect YouTube
                </button>
              )}
            </div>

            {/* Google Drive Chip */}
            <div className="space-y-2">
              <div className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all duration-300 ${
                data?.connections.googledrive 
                  ? 'bg-emerald-950/20 border-emerald-500/30 glow-success text-emerald-400' 
                  : 'bg-slate-950/40 border-slate-900 text-slate-400'
              }`}>
                <span className="flex items-center gap-2">
                  <FileText className={`w-4 h-4 ${data?.connections.googledrive ? 'text-emerald-400' : 'text-slate-500'}`} /> Google Drive
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${data?.connections.googledrive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  {data?.connections.googledrive ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {data?.connections.googledrive ? (
                <button
                  onClick={() => { handleDisconnect('googledrive'); setIsSidebarOpen(false); }}
                  className="w-full py-2 px-3 text-xs bg-red-950/10 border border-red-950/50 hover:bg-red-950/30 text-red-400 hover:border-red-500/50 rounded-xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  Disconnect Google Drive
                </button>
              ) : (
                <button
                  onClick={() => { handleConnect('googledrive'); setIsSidebarOpen(false); }}
                  className="w-full py-2 px-3 text-xs bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold rounded-xl transition-all duration-200 shadow-md hover:shadow-violet-500/10 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Connect Google Drive
                </button>
              )}
            </div>

            {/* Notion Chip */}
            <div className="space-y-2">
              <div className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all duration-300 ${
                data?.connections.notion 
                  ? 'bg-emerald-950/20 border-emerald-500/30 glow-success text-emerald-400' 
                  : 'bg-slate-950/40 border-slate-900 text-slate-400'
              }`}>
                <span className="flex items-center gap-2">
                  <FileText className={`w-4 h-4 ${data?.connections.notion ? 'text-emerald-400' : 'text-slate-500'}`} /> Notion
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${data?.connections.notion ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  {data?.connections.notion ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {data?.connections.notion ? (
                <>
                  <button
                    onClick={() => { handleDisconnect('notion'); setIsSidebarOpen(false); }}
                    className="w-full py-2 px-3 text-xs bg-red-950/10 border border-red-950/50 hover:bg-red-950/30 text-red-400 hover:border-red-500/50 rounded-xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
                  >
                    Disconnect Notion
                  </button>
                  <div className="space-y-1 mt-2 p-3 bg-slate-900/20 border border-slate-900 rounded-xl">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-0.5">Parent Page ID</label>
                    <div className="flex gap-1.5 mt-1">
                      <input
                        type="text"
                        placeholder="Notion Page UUID"
                        value={notionParentIdInput}
                        onChange={(e) => setNotionParentIdInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:border-violet-500/50 outline-none transition-all"
                      />
                      <button
                        onClick={handleSaveNotionParent}
                        className="py-1 px-3 text-xs bg-slate-850 hover:bg-slate-850 border border-slate-700 text-white rounded-lg transition-all active:scale-95 cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => { handleConnect('notion'); setIsSidebarOpen(false); }}
                  className="w-full py-2 px-3 text-xs bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold rounded-xl transition-all duration-200 shadow-md hover:shadow-violet-500/10 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Connect Notion
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center max-lg:hidden">
          <p className="text-[10px] text-slate-600">Connect platforms once — future generation synchronizes automatically.</p>
        </div>
      </aside>

      {/* RIGHT COLUMN - Main Content */}
      <main className="lg:col-span-9 p-4 md:p-6 lg:p-10 flex flex-col space-y-6 relative z-10 max-h-screen overflow-y-auto">
        {/* Banner Hero */}
        <div className="p-6 md:p-8 bg-gradient-to-tr from-violet-600/70 to-cyan-500/50 border border-violet-500/20 rounded-3xl relative overflow-hidden shadow-xl animate-float">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <Compass className="w-7 h-7 text-white animate-pulse" /> Compass Generator
          </h1>
          <p className="text-slate-100/90 text-xs md:text-sm max-w-lg leading-relaxed">
            Create structured learning paths, dynamic YouTube playlists, and synced files — instantly compiled from a single prompt.
          </p>
        </div>

        {/* Quick status tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl flex items-center gap-3 transition-colors hover:bg-slate-900/20">
            <div className="w-10 h-10 rounded-xl bg-violet-600/10 flex items-center justify-center text-violet-400 border border-violet-500/10">
              <Settings className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Connected Channels</span>
              <span className="text-sm font-bold text-white mt-0.5">{connectedCount} / 3 Services</span>
            </div>
          </div>
          <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl flex items-center gap-3 transition-colors hover:bg-slate-900/20">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/10 flex items-center justify-center text-cyan-400 border border-cyan-500/10">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Document Sync</span>
              <span className="text-sm font-bold text-white mt-0.5">Google Doc + Notion Page</span>
            </div>
          </div>
          <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl flex items-center gap-3 transition-colors hover:bg-slate-900/20">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-400 border border-emerald-500/10">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Executor Protocol</span>
              <span className="text-sm font-bold text-white mt-0.5">Composio API Integrations</span>
            </div>
          </div>
        </div>

        {/* Prompt Chat Builder */}
        <section className="glass-card p-4 md:p-6 border-slate-800/80 rounded-3xl space-y-4">
          <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" /> Goal Builder
          </h3>

          {chatHistory.length > 0 && (
            <div className="space-y-4 max-h-[300px] overflow-y-auto border border-slate-900 bg-slate-950/20 rounded-2xl p-4">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    msg.role === 'user' ? 'bg-cyan-950 border border-cyan-500/30 text-cyan-400' : 'bg-violet-950 border border-violet-500/30 text-violet-400'
                  }`}>
                    {msg.role === 'user' ? 'ME' : 'AI'}
                  </div>
                  <div className={`p-4 rounded-2xl text-xs md:text-sm border transition-all ${
                    msg.role === 'user' 
                      ? 'bg-slate-950/80 border-slate-800 text-slate-200 rounded-tr-none' 
                      : 'bg-slate-900/30 border-slate-800/60 text-violet-200 rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleGenerate} className="flex gap-2.5">
            <div className="relative flex-1 focus-ring-glow rounded-2xl">
              <input
                type="text"
                disabled={generating}
                placeholder="Describe what you want to learn (e.g., 'Learn Next.js in 10 days')"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full pl-5 pr-4 py-3.5 bg-slate-950/50 border border-slate-800/80 focus:border-violet-500/40 rounded-2xl text-xs md:text-sm text-white placeholder-slate-600 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={generating || !prompt.trim()}
              className="py-3.5 px-5 md:px-6 bg-gradient-to-r from-violet-600 to-cyan-500 text-white text-xs md:text-sm font-bold rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Send className="w-4 h-4" /> <span className="hidden sm:inline">Generate</span>
            </button>
          </form>
        </section>

        {/* Streaming Logs */}
        {generating && (
          <div className="glass-card p-4 md:p-6 border-slate-800/80 rounded-3xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs md:text-sm font-semibold text-white">Running generation pipelines...</span>
            </div>
            
            {/* Retro Developer Terminal Output */}
            <div className="bg-[#020617] border border-slate-900 rounded-2xl shadow-inner overflow-hidden">
              {/* Terminal Window Header Bar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-slate-950/80">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">console.sh</span>
                <span className="w-10" />
              </div>
              <div className="p-4 max-h-[160px] overflow-y-auto space-y-2 font-mono text-[11px] leading-relaxed text-slate-300 text-left">
                {progressLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-violet-500 select-none shrink-0">$</span>
                    <span className={log.startsWith('❌') ? 'text-red-400' : log.startsWith('✅') ? 'text-emerald-400' : 'text-slate-300'}>
                      {log}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-1 text-slate-400 animate-pulse">
                  <span className="text-violet-500 select-none">$</span>
                  <span>Executing next instruction...</span>
                  <span className="w-1.5 h-3 bg-violet-400 animate-blink" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Panel */}
        {result && (
          <section className="space-y-4 text-left">
            <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider pl-1">Your Learning Path</h3>
            
            {/* Export Links Row */}
            <div className="flex flex-wrap gap-2.5">
              {result.playlistUrl && (
                <a href={result.playlistUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-full border border-red-500/20 bg-red-950/15 text-red-300 hover:bg-red-950/25 hover:border-red-500/40 text-xs font-semibold shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
                  <YoutubeIcon className="w-4 h-4 text-red-500" /> YouTube Playlist
                </a>
              )}
              {result.docUrl && (
                <a href={result.docUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-full border border-blue-500/20 bg-blue-950/15 text-blue-300 hover:bg-blue-950/25 hover:border-blue-500/40 text-xs font-semibold shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
                  <FileText className="w-4 h-4 text-blue-500" /> Google Doc
                </a>
              )}
              {result.notionUrl && (
                <a href={result.notionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-full border border-slate-500/20 bg-slate-900/50 text-slate-200 hover:bg-slate-800 hover:border-slate-500/40 text-xs font-semibold shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
                  <FileText className="w-4 h-4 text-slate-400" /> Notion Page
                </a>
              )}
            </div>

            {/* Detailed Errors if present */}
            {result.actions && Object.keys(result.actions).map((key) => {
              const act = result.actions[key];
              if (act && !act.success && act.error) {
                return (
                  <div key={key} className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs space-y-1">
                    <span className="font-bold uppercase tracking-wider">🔴 Sync Failed ({key}):</span>
                    <p className="mt-1 leading-relaxed">{act.error}</p>
                  </div>
                );
              }
              return null;
            })}

            {/* Markdown rendered document */}
            <div className="glass-card p-5 md:p-6 lg:p-8 border-slate-800/80 rounded-3xl relative overflow-hidden">
              <div 
                className="response-block overflow-x-auto" 
                dangerouslySetInnerHTML={{ __html: parseMarkdown(result.markdown) }} 
              />
            </div>

            {/* Download trigger */}
            <button
              onClick={handleDownloadMarkdown}
              className="py-3 px-5 border border-slate-800 hover:border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold rounded-full flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Download className="w-4 h-4" /> <span>Download Markdown</span>
            </button>
          </section>
        )}

        {/* Past History Expander panel */}
        {data && data.history.length > 0 && (
          <section className="border-t border-slate-900/60 pt-6 space-y-4 text-left">
            <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider pl-1">📋 Recent Learning Paths</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.history.map((path) => (
                <div 
                  key={path.id} 
                  className="p-5 bg-slate-950/20 border border-slate-900/60 rounded-2xl flex flex-col justify-between gap-4 transition-all duration-300 hover:bg-slate-900/10 hover:border-slate-800 hover:scale-[1.01] hover:shadow-lg hover:shadow-violet-500/5 group"
                >
                  <div className="space-y-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-violet-500/70" /> {new Date(path.created_at).toLocaleDateString()}
                    </span>
                    <p className="text-sm font-bold text-white leading-relaxed group-hover:text-violet-300 transition-colors">{path.goal}</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
                    {path.playlist_url && (
                      <a href={path.playlist_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 border border-red-500/25 bg-red-950/15 text-red-300 rounded-lg hover:bg-red-950/30 transition-colors flex items-center gap-1">
                        <span>📺 Play</span>
                      </a>
                    )}
                    {path.google_doc_url && (
                      <a href={path.google_doc_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 border border-blue-500/25 bg-blue-950/15 text-blue-300 rounded-lg hover:bg-blue-950/30 transition-colors flex items-center gap-1">
                        <span>📄 Doc</span>
                      </a>
                    )}
                    {path.notion_url && (
                      <a href={path.notion_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 border border-slate-700 bg-slate-800 text-slate-200 rounded-lg hover:bg-slate-750 transition-colors flex items-center gap-1">
                        <span>📝 Notion</span>
                      </a>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setResult({
                        markdown: path.markdown || `# Learning Path: ${path.goal}\n\n*Plan details not available. Please generate a new path to view full details.*`,
                        playlistUrl: path.playlist_url,
                        docUrl: path.google_doc_url,
                        notionUrl: path.notion_url,
                        actions: {},
                      });
                      setChatHistory([{ role: 'user', content: path.goal }, { role: 'assistant', content: 'Reloaded path from database history logs.' }]);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="w-full mt-1 py-2 px-3 bg-slate-900 border border-slate-850 hover:bg-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> <span>View Plan</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}


import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUIStore } from '../store/ui';
import type { ChatMessage } from '../store/chat';
import { api } from '../services/api';
import { useWorkspaceStore } from '../store/workspace';
import { 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  Download, 
  Star, 
  ThumbsUp, 
  ThumbsDown, 
  FileText, 
  Loader2, 
  CheckCircle,
  Copy,
  X,
  Bot,
  BrainCircuit,
  ChevronDown,
  Layers,
  Sparkles,
  FileCheck,
  Eye
} from 'lucide-react';

interface ProgressEvent {
  agent: string;
  message: string;
}

interface DocumentFile {
  id: number;
  filename: string;
  file_type: string;
  version: number;
  status: string;
  size_bytes: number;
  embedding_count: number;
}

interface PreviewChunk {
  content: string;
  page: number;
}

export const ChatWindow: React.FC = () => {
  const token = useAuthStore((state) => state.token);
  const { 
    activeConversationId, 
    fetchConversations, 
    createConversation, 
    fetchBookmarks 
  } = useChatStore();

  const {
    activePreviewDocId,
    setActivePreviewDocId,
    addNotification
  } = useUIStore();

  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<ProgressEvent[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  
  // Scoping & Custom modes
  const [scopedDocId, setScopedDocId] = useState<number | null>(null);
  const [activeMode, setActiveMode] = useState<string>('chat');

  // Split screen resizable panel states
  const [panelWidth, setPanelWidth] = useState(450);
  const [isDragging, setIsDragging] = useState(false);
  const [previewChunks, setPreviewChunks] = useState<PreviewChunk[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewDocDetails, setPreviewDocDetails] = useState<DocumentFile | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  useEffect(() => {
    fetchBookmarks();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingStatus, isGenerating]);

  // Load preview chunks if a preview document is selected in split screen
  useEffect(() => {
    if (activePreviewDocId) {
      loadPreviewChunks(activePreviewDocId);
    } else {
      setPreviewChunks([]);
      setPreviewDocDetails(null);
    }
  }, [activePreviewDocId]);

  const loadMessages = async () => {
    try {
      const response = await api.get(`/chat/conversations/${activeConversationId}`);
      setMessages(response.data.messages || []);
    } catch {}
  };

  const loadPreviewChunks = async (id: number) => {
    setLoadingPreview(true);
    try {
      const detailsResp = await api.get(`/documents/`);
      const matched = detailsResp.data.find((d: any) => d.id === id);
      if (matched) {
        setPreviewDocDetails(matched);
      }

      const response = await api.get(`/documents/${id}/preview`);
      setPreviewChunks(response.data);
    } catch {
      addNotification('Failed to retrieve document preview snippets', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // HTML5 Web Speech API
  const toggleRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addNotification('Speech Recognition not supported in this browser.', 'error');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsRecording(true);
        addNotification('Listening...', 'info');
      };

      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setInput((prev) => (prev + ' ' + text).trim());
      };

      rec.onerror = () => {
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
      rec.start();
    }
  };

  // Speech Synthesis
  const handleTextToSpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        addNotification('Speech reading stopped', 'info');
        return;
      }
      const cleanText = text.replace(/[#*`_~]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
      addNotification('Reading response aloud...', 'info');
    } else {
      addNotification('Speech synthesis not supported.', 'error');
    }
  };

  const handleCopyCode = (code: string, blockId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(blockId);
    addNotification('Code snippet copied', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderMessageContent = (content: string, isLastMsg: boolean) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      const isLastBlock = index === parts.length - 1;
      
      if (part.startsWith('```') && part.endsWith('```')) {
        const codeContent = part.slice(3, -3);
        const firstLineEnd = codeContent.indexOf('\n');
        const language = firstLineEnd !== -1 ? codeContent.substring(0, firstLineEnd).trim() : 'code';
        const codeText = firstLineEnd !== -1 ? codeContent.substring(firstLineEnd + 1) : codeContent;
        const blockId = `code_${index}`;

        return (
          <div key={index} className="my-4 rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden font-mono text-xs leading-relaxed shadow-lg">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>{language || 'code'}</span>
              <button
                type="button"
                onClick={() => handleCopyCode(codeText, blockId)}
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                {copiedId === blockId ? (
                  <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Copied</span>
                ) : (
                  <span className="flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy Code</span>
                )}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-slate-300">
              <code className={isLastMsg && isLastBlock && isGenerating ? 'typing-cursor' : ''}>{codeText}</code>
            </pre>
          </div>
        );
      }

      return (
        <div key={index} className="space-y-2">
          {part.split('\n').map((line, idx) => {
            const lineContent = line.trim();
            const isLastLine = idx === part.split('\n').length - 1;
            const targetClass = isLastMsg && isLastBlock && isLastLine && isGenerating ? 'typing-cursor' : '';
            
            if (!lineContent) return <div key={idx} className="h-2"></div>;

            if (lineContent.startsWith('# ')) {
              return <h1 key={idx} className={`text-sm font-bold text-white mt-4 border-b border-slate-900 pb-1 ${targetClass}`}>{lineContent.replace('# ', '')}</h1>;
            }
            if (lineContent.startsWith('## ')) {
              return <h2 key={idx} className={`text-xs font-bold text-indigo-400 mt-3 ${targetClass}`}>{lineContent.replace('## ', '')}</h2>;
            }
            if (lineContent.startsWith('- ') || lineContent.startsWith('* ')) {
              return (
                <ul key={idx} className="list-disc pl-6 text-slate-300 text-xs">
                  <li className={targetClass}>{lineContent.substring(2)}</li>
                </ul>
              );
            }

            return <p key={idx} className={`text-slate-300 text-xs leading-relaxed break-words ${targetClass}`}>{lineContent}</p>;
          })}
        </div>
      );
    });
  };

  const handleExport = async (messageId: number, format: 'pdf' | 'markdown' | 'word') => {
    addNotification(`Generating ${format.toUpperCase()} report...`, 'info');
    try {
      const response = await api.get(`/chat/messages/${messageId}/export?format=${format}`, {
        responseType: 'blob'
      });
      const mimeType = format === 'pdf' 
        ? 'application/pdf' 
        : format === 'word' 
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
          : 'text/markdown';
      const fileExt = format === 'word' ? 'docx' : format === 'pdf' ? 'pdf' : 'md';
      
      const blob = new Blob([response.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report_${messageId}.${fileExt}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addNotification(`Exported report as ${format.toUpperCase()}`, 'success');
    } catch {
      addNotification('Failed to export report from server', 'error');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    let convId = activeConversationId;
    if (!convId) {
      try {
        convId = await createConversation(activeWorkspaceId || undefined);
      } catch {
        addNotification('Failed to create new session', 'error');
        return;
      }
    }

    const queryText = input.trim();
    const queryMode = activeMode;
    setInput('');
    setIsGenerating(true);
    setStreamingStatus([]);

    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      conversation_id: convId!,
      role: 'user',
      content: queryText,
      citations: null,
      feedback_rating: null,
      feedback_text: null,
      bookmarked: false,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      const response = await fetch(`${API_BASE_URL}/chat/conversations/${convId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          content: queryText, 
          mode: queryMode,
          document_id: scopedDocId 
        })
      });

      if (!response.body) throw new Error('Response body unreadable');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'agent') {
                setStreamingStatus((prev) => [
                  ...prev, 
                  { agent: data.agent, message: data.message }
                ]);
              } else if (data.type === 'final') {
                const finalMsg: ChatMessage = {
                  id: data.message_id,
                  conversation_id: convId!,
                  role: 'assistant',
                  content: data.content,
                  citations: JSON.stringify(data.citations),
                  feedback_rating: null,
                  feedback_text: null,
                  bookmarked: false,
                  created_at: new Date().toISOString()
                };
                setMessages((prev) => [...prev.filter((m) => m.role === 'user' || m.id !== finalMsg.id), finalMsg]);
                setIsGenerating(false);
                fetchConversations(activeWorkspaceId || undefined);
              } else if (data.type === 'error') {
                addNotification(data.message, 'error');
                setIsGenerating(false);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      addNotification(err.message || 'Stream processing failed', 'error');
      setIsGenerating(false);
    }
  };

  const handleFeedback = async (msgId: number, rating: number) => {
    try {
      await api.post(`/chat/messages/${msgId}/feedback`, { rating });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, feedback_rating: rating } : m))
      );
      if (rating === -1) {
        setActiveMessageId(msgId);
        setFeedbackText('');
      } else {
        addNotification('Feedback recorded', 'success');
      }
    } catch {
      addNotification('Failed to save rating', 'error');
    }
  };

  const handleSubmitFeedbackText = async (msgId: number) => {
    try {
      await api.post(`/chat/messages/${msgId}/feedback`, {
        rating: -1,
        text: feedbackText
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, feedback_text: feedbackText } : m))
      );
      setActiveMessageId(null);
      addNotification('Detailed feedback submitted', 'success');
    } catch {
      addNotification('Failed to submit review notes', 'error');
    }
  };

  const handleBookmark = async (msgId: number, currentStatus: boolean) => {
    try {
      await api.post(`/chat/messages/${msgId}/bookmark`, { bookmarked: !currentStatus });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, bookmarked: !currentStatus } : m))
      );
      addNotification(!currentStatus ? 'Star bookmark added' : 'Bookmark removed', 'success');
      fetchBookmarks();
    } catch {
      addNotification('Failed to update bookmark status', 'error');
    }
  };

  // Copilot action chips handler
  const handleActionChip = (chipMode: string, defaultPrompt: string) => {
    setActiveMode(chipMode);
    setInput(defaultPrompt);
    addNotification(`Selected ${chipMode.toUpperCase()} mode. Press Send.`, 'info');
  };

  // Resizing mouse handler
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 280 && newWidth < window.innerWidth * 0.75) {
        setPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 flex h-full bg-transparent overflow-hidden relative">
      
      {/* LEFT: Conversation Feed viewport */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 bg-slate-950/20 flex items-center justify-between z-10 glass">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-450" />
            <div>
              <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                Copilot AI Workspace
                {activeWorkspace && (
                  <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[8px] font-bold uppercase rounded-lg">
                    {activeWorkspace.name}
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                Ask reasoning models about documentation and code references
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Scoping Dropdown Selector */}
            {activeWorkspace && (
              <div className="relative flex items-center gap-1.5 bg-slate-900/60 border border-white/5 px-2.5 py-1.5 rounded-xl text-[10px] text-slate-300 font-bold">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <select
                  value={scopedDocId || ''}
                  onChange={(e) => setScopedDocId(e.target.value ? parseInt(e.target.value) : null)}
                  className="bg-transparent border-none text-[10px] font-bold text-white focus:outline-none focus:ring-0 cursor-pointer pr-5"
                >
                  <option value="" className="bg-slate-900 text-white">Entire Workspace (All files)</option>
                  {activeWorkspace.documents?.map((doc) => (
                    <option key={doc.id} value={doc.id} className="bg-slate-900 text-white">
                      File: {doc.filename.substring(0, 18)}...
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Mode Indicator Pill */}
            <div className="flex items-center gap-1 bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider border border-indigo-500/20">
              <Sparkles className="w-3 h-3 animate-pulse" /> {activeMode}
            </div>
          </div>
        </div>

        {/* Conversation Message list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-xl mx-auto">
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-3xl shadow-xl shadow-indigo-600/5">
                <BrainCircuit className="w-10 h-10 animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">Begin your AI Ingestion workflow</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ask questions, summarize documents, create comparison matrix reports, or extract actionable meeting checklists inside this workspace context.
                </p>
              </div>

              {/* Copilot Action Chips */}
              <div className="grid grid-cols-2 gap-3 w-full pt-4">
                <button
                  onClick={() => handleActionChip('summary', 'Generate a comprehensive summary of the referenced documents.')}
                  className="p-3 bg-slate-900/30 border border-white/5 hover:border-indigo-500/30 rounded-2xl text-left hover:bg-slate-900/60 transition-all text-xs group"
                >
                  <p className="font-bold text-white group-hover:text-indigo-400 transition-colors">📑 Document Summary</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Extract core summaries, findings, and context maps.</p>
                </button>
                <button
                  onClick={() => handleActionChip('comparison', 'Create a side-by-side comparison report of the reference documents.')}
                  className="p-3 bg-slate-900/30 border border-white/5 hover:border-indigo-500/30 rounded-2xl text-left hover:bg-slate-900/60 transition-all text-xs group"
                >
                  <p className="font-bold text-white group-hover:text-indigo-400 transition-colors">📊 Comparison Matrix</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Compare sources side by side to audit differences.</p>
                </button>
                <button
                  onClick={() => handleActionChip('meeting_notes', 'Generate structured meeting notes based on this content.')}
                  className="p-3 bg-slate-900/30 border border-white/5 hover:border-indigo-500/30 rounded-2xl text-left hover:bg-slate-900/60 transition-all text-xs group"
                >
                  <p className="font-bold text-white group-hover:text-indigo-400 transition-colors">📅 Meeting Notes</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Format meeting details, timelines, and discussions.</p>
                </button>
                <button
                  onClick={() => handleActionChip('action_items', 'Extract action items, priority levels, and checklist tasks.')}
                  className="p-3 bg-slate-900/30 border border-white/5 hover:border-indigo-500/30 rounded-2xl text-left hover:bg-slate-900/60 transition-all text-xs group"
                >
                  <p className="font-bold text-white group-hover:text-indigo-400 transition-colors">✅ Action Items</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Parse next steps, dependencies, and checklists.</p>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, midx) => {
                const isUser = msg.role === 'user';
                const parsedCitations = msg.citations ? JSON.parse(msg.citations) : [];
                const isLast = midx === messages.length - 1;

                return (
                  <div key={msg.id} className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    
                    {/* Bot Avatar */}
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/25 flex items-center justify-center shrink-0">
                        <Bot className="w-4.5 h-4.5" />
                      </div>
                    )}

                    <div className={`max-w-[88%] p-5 rounded-2xl border space-y-4 shadow-sm ${
                      isUser 
                        ? 'bg-indigo-600/10 border-indigo-500/20 text-white rounded-tr-none' 
                        : 'bg-slate-900/20 border-white/5 text-slate-100 rounded-tl-none glass'
                    }`}>
                      
                      {/* Message Content */}
                      <div className="space-y-3">
                        {renderMessageContent(msg.content, isLast)}
                      </div>

                      {/* Citations Tray */}
                      {!isUser && parsedCitations && parsedCitations.length > 0 && (
                        <div className="pt-3 border-t border-white/5 space-y-2">
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                            <FileText className="w-3 h-3 text-slate-500" /> Source References
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {parsedCitations.map((cit: any, cidx: number) => (
                              <div 
                                key={cidx} 
                                onClick={() => {
                                  if (cit.document_id) {
                                    setActivePreviewDocId(cit.document_id);
                                    addNotification(`Opening preview for ${cit.filename}`, 'info');
                                  }
                                }}
                                className="p-3 bg-slate-950/40 hover:bg-slate-950/80 rounded-xl border border-white/5 hover:border-indigo-500/20 text-[11px] flex gap-2.5 cursor-pointer transition-all"
                              >
                                <span className="w-4.5 h-4.5 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold shrink-0 text-[10px]">
                                  {cidx + 1}
                                </span>
                                <div className="min-w-0 space-y-0.5">
                                  <p className="font-bold text-slate-300 truncate flex items-center gap-1">
                                    {cit.filename} <Eye className="w-3 h-3 text-slate-500" />
                                  </p>
                                  <p className="text-slate-500 leading-relaxed italic line-clamp-2">"{cit.snippet}"</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Footer Actions & Exports */}
                      {!isUser && (
                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                          
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleTextToSpeech(msg.content)}
                              className="p-1.5 hover:bg-slate-800 text-slate-500 hover:text-white rounded-lg transition-colors"
                              title="Read response"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleBookmark(msg.id, msg.bookmarked)}
                              className={`p-1.5 hover:bg-slate-800 rounded-lg transition-colors ${
                                msg.bookmarked ? 'text-yellow-500' : 'text-slate-500 hover:text-white'
                              }`}
                              title={msg.bookmarked ? 'Remove Star' : 'Star message'}
                            >
                              <Star className="w-4 h-4 fill-current" />
                            </button>
                            
                            {/* Server-Side Document Exports Dropdown */}
                            <div className="relative group ml-1">
                              <button className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-white/5 rounded-lg text-[9px] font-bold text-slate-400 hover:text-white transition-colors">
                                <Download className="w-3 h-3" /> Export Report <ChevronDown className="w-3 h-3" />
                              </button>
                              <div className="absolute left-0 bottom-full mb-1 bg-slate-900 border border-white/5 rounded-xl py-1 w-32 shadow-2xl hidden group-hover:block z-30">
                                <button onClick={() => handleExport(msg.id, 'pdf')} className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-[10px] text-slate-300 hover:text-white font-semibold">PDF Document</button>
                                <button onClick={() => handleExport(msg.id, 'word')} className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-[10px] text-slate-300 hover:text-white font-semibold">Word Document</button>
                                <button onClick={() => handleExport(msg.id, 'markdown')} className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-[10px] text-slate-300 hover:text-white font-semibold">Markdown</button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => handleFeedback(msg.id, 1)}
                              className={`p-1.5 hover:bg-slate-800 rounded-lg transition-colors ${
                                msg.feedback_rating === 1 ? 'text-emerald-400' : 'text-slate-500 hover:text-white'
                              }`}
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg.id, -1)}
                              className={`p-1.5 hover:bg-slate-800 rounded-lg transition-colors ${
                                msg.feedback_rating === -1 ? 'text-rose-400' : 'text-slate-500 hover:text-white'
                              }`}
                            >
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Comment text area */}
                      {!isUser && activeMessageId === msg.id && (
                        <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-2 mt-2">
                          <textarea
                            placeholder="Add your review notes here..."
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 resize-none h-16"
                          />
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setActiveMessageId(null)}
                              className="px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleSubmitFeedbackText(msg.id)}
                              className="px-3 py-1 bg-indigo-600 text-white rounded-md text-[10px] font-bold uppercase hover:bg-indigo-500"
                            >
                              Submit
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Streaming loading skeleton & step roadmap */}
          {isGenerating && (
            <div className="max-w-3xl mx-auto space-y-4">
              {/* Pulse Skeleton placeholder */}
              <div className="flex gap-4 p-5 rounded-2xl border border-white/5 bg-slate-900/10 mr-12 glass">
                <div className="w-8 h-8 rounded-xl bg-slate-900 animate-pulse shrink-0"></div>
                <div className="flex-1 space-y-3.5">
                  <div className="h-3 bg-slate-900 rounded w-1/4 animate-pulse"></div>
                  <div className="h-2 bg-slate-900 rounded w-full animate-pulse"></div>
                  <div className="h-2 bg-slate-900 rounded w-5/6 animate-pulse"></div>
                </div>
              </div>

              {/* Vertical Stepper Roadmap for LangGraph Agents */}
              {streamingStatus.length > 0 && (
                <div className="p-5 bg-slate-950/60 border border-white/5 rounded-2xl max-w-xl space-y-4 shadow-md ml-12">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Orchestrating Multi-Agent flow
                  </div>
                  <div className="space-y-3 border-l-2 border-slate-800 pl-4 py-1.5 ml-2">
                    {streamingStatus.map((status, sidx) => (
                      <div key={sidx} className="text-xs flex gap-2 items-start text-slate-300 font-medium">
                        <span className="text-emerald-400 shrink-0 font-bold">✓</span>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-400 capitalize">{status.agent} Agent: </span>
                          <span className="text-slate-400 font-medium">{status.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input form panel */}
        <div className="p-4 bg-slate-950/40 border-t border-white/5 space-y-3 glass">
          
          {/* Quick Action Bar for Scoped Generations */}
          <div className="max-w-3xl mx-auto flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Modes:</span>
              <button
                type="button"
                onClick={() => setActiveMode(activeMode === 'chat' ? 'research' : 'chat')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold uppercase transition-all border ${
                  activeMode === 'research' 
                    ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 shadow-md shadow-indigo-600/5' 
                    : 'bg-slate-900/60 border-white/5 text-slate-500 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Research Mode
              </button>
              
              <button
                type="button"
                onClick={() => setActiveMode(activeMode === 'chat' ? 'summary' : 'chat')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold uppercase transition-all border ${
                  activeMode === 'summary' 
                    ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 shadow-md' 
                    : 'bg-slate-900/60 border-white/5 text-slate-500 hover:text-white'
                }`}
              >
                Summary
              </button>
              
              <button
                type="button"
                onClick={() => setActiveMode(activeMode === 'chat' ? 'comparison' : 'chat')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold uppercase transition-all border ${
                  activeMode === 'comparison' 
                    ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 shadow-md' 
                    : 'bg-slate-900/60 border-white/5 text-slate-500 hover:text-white'
                }`}
              >
                Comparison
              </button>
            </div>
            
            {activeMode !== 'chat' && (
              <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">
                Custom Directive Active
              </span>
            )}
          </div>

          <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-2">
            <button
              type="button"
              onClick={toggleRecording}
              className={`p-3.5 rounded-xl border transition-all ${
                isRecording 
                  ? 'bg-rose-600 text-white border-rose-600 animate-pulse' 
                  : 'bg-slate-900 border-white/5 text-slate-550 hover:text-white hover:bg-slate-800'
              }`}
              title="Dictate Message"
            >
              {isRecording ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isGenerating}
              placeholder={
                isGenerating 
                  ? 'Agent reasoning active...' 
                  : activeConversationId 
                    ? 'Ask the agents about your references...' 
                    : 'Start a new conversation to begin...'
              }
              className="flex-1 bg-slate-900 border border-white/5 rounded-xl px-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/40 focus:ring-0 disabled:opacity-50 transition-all"
            />

            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-indigo-600/30"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </form>
        </div>
      </div>

      {/* SPLIT SCREEN / RESIZABLE PANEL divider handle */}
      {activePreviewDocId && (
        <div 
          onMouseDown={startResize}
          className={`w-1 hover:w-1.5 cursor-col-resize bg-slate-900 hover:bg-indigo-500 transition-colors z-20 flex items-center justify-center ${
            isDragging ? 'bg-indigo-600 w-1.5' : ''
          }`}
          title="Drag to resize panel"
        >
          <div className="h-8 w-0.5 bg-white/10 rounded"></div>
        </div>
      )}

      {/* RIGHT: Resizable split-screen Document Preview panel */}
      {activePreviewDocId && previewDocDetails && (
        <div 
          style={{ width: `${panelWidth}px` }}
          className="bg-slate-950/80 border-l border-white/5 flex flex-col h-full z-15 glass select-none"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-2 min-w-0">
              <FileCheck className="w-4 h-4 text-indigo-400 shrink-0" />
              <h3 className="font-bold text-white text-xs truncate" title={previewDocDetails.filename}>
                Preview: {previewDocDetails.filename}
              </h3>
            </div>
            <button
              onClick={() => setActivePreviewDocId(null)}
              className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-colors"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Properties grid */}
          <div className="p-4 bg-slate-900/10 border-b border-white/5 grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-semibold font-mono">
            <div>
              <p className="text-slate-500 uppercase font-bold text-[8px] tracking-widest">Version</p>
              <p className="text-slate-300 pt-0.5">v{previewDocDetails.version}</p>
            </div>
            <div>
              <p className="text-slate-500 uppercase font-bold text-[8px] tracking-widest">File Size</p>
              <p className="text-slate-300 pt-0.5">{formatBytes(previewDocDetails.size_bytes)}</p>
            </div>
            <div className="col-span-2 pt-1.5 border-t border-white/5 mt-1">
              <p className="text-slate-500 uppercase font-bold text-[8px] tracking-widest">Index Chunks</p>
              <p className="text-slate-300 pt-0.5">{previewDocDetails.embedding_count} vector shards</p>
            </div>
          </div>

          {/* Chunks Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1 font-mono">
              Parsed Text Preview
            </div>
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-[10px] font-bold font-mono">Querying ChromaDB...</span>
              </div>
            ) : previewChunks.length === 0 ? (
              <div className="text-center py-20 text-slate-650 text-[11px] font-medium leading-relaxed italic">
                No preview chunks available for this file type or status.
              </div>
            ) : (
              previewChunks.map((chunk, cidx) => (
                <div key={cidx} className="p-4 bg-slate-900/30 border border-white/5 rounded-2xl space-y-2 hover:border-white/10 transition-colors">
                  <div className="flex justify-between items-center text-[9px] text-indigo-400 font-bold uppercase tracking-wider font-mono">
                    <span>Segment #{cidx + 1}</span>
                    <span className="px-1.5 py-0.5 bg-indigo-500/10 rounded">Page {chunk.page}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed italic">
                    "{chunk.content}"
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
};

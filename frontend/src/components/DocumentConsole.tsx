import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useUIStore } from '../store/ui';
import { useWorkspaceStore } from '../store/workspace';
import { 
  Upload, 
  FileText, 
  Trash2, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  File, 
  Database,
  X,
  FileCheck,
  Eye,
  AlertCircle
} from 'lucide-react';

interface DocumentFile {
  id: number;
  filename: string;
  file_type: string;
  version: number;
  status: string;
  size_bytes: number;
  embedding_count: number;
  created_at: string;
  updated_at: string;
}

interface PreviewChunk {
  content: string;
  page: number;
}

interface QueueItem {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export const DocumentConsole: React.FC = () => {
  const {
    searchQuery,
    activePreviewDocId,
    setActivePreviewDocId,
    addNotification
  } = useUIStore();

  const {
    workspaces,
    activeWorkspaceId,
    bindDocuments
  } = useWorkspaceStore();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleToggleDocumentBind = async (docId: number, currentBound: boolean) => {
    if (!activeWorkspaceId) return;
    
    let boundIds = activeWorkspace?.documents?.map((d) => d.id) || [];
    if (currentBound) {
      boundIds = boundIds.filter((id) => id !== docId);
    } else {
      boundIds = [...boundIds, docId];
    }
    try {
      await bindDocuments(activeWorkspaceId, boundIds);
      addNotification(currentBound ? 'Removed from workspace' : 'Added to workspace', 'success');
    } catch {
      addNotification('Failed to update workspace files', 'error');
    }
  };

  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [previewChunks, setPreviewChunks] = useState<PreviewChunk[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Upload Queue State
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments().then(() => setLoading(false));
    
    // Poll list status changes
    const interval = setInterval(fetchDocuments, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch document preview chunks when selection changes
  useEffect(() => {
    if (activePreviewDocId) {
      loadPreviewChunks(activePreviewDocId);
    } else {
      setPreviewChunks([]);
    }
  }, [activePreviewDocId]);

  const fetchDocuments = async () => {
    try {
      const response = await api.get('/documents/');
      setDocuments(response.data);
    } catch {}
  };

  const loadPreviewChunks = async (id: number) => {
    setLoadingPreview(true);
    try {
      const response = await api.get(`/documents/${id}/preview`);
      setPreviewChunks(response.data);
    } catch {
      addNotification('Failed to retrieve document preview snippets', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(Array.from(e.target.files));
    }
  };

  const uploadFiles = async (files: File[]) => {
    const validTypes = ['pdf', 'docx', 'csv', 'txt', 'md', 'markdown'];
    const filteredFiles = files.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return validTypes.includes(ext);
    });

    if (filteredFiles.length === 0) {
      addNotification('No supported files selected.', 'error');
      return;
    }

    // Add files to queue
    const newQueueItems: QueueItem[] = filteredFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      status: 'uploading'
    }));

    setUploadQueue(prev => [...newQueueItems, ...prev]);
    addNotification(`Queued ${filteredFiles.length} files for upload.`, 'info');

    // Create single FormData for multi-upload
    const formData = new FormData();
    filteredFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      // Set all items in this batch to processing status
      setUploadQueue(prev => prev.map(item => 
        newQueueItems.some(ni => ni.name === item.name) ? { ...item, status: 'processing' } : item
      ));

      await api.post('/documents/upload-multiple', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Complete items
      setUploadQueue(prev => prev.map(item => 
        newQueueItems.some(ni => ni.name === item.name) ? { ...item, status: 'completed' } : item
      ));

      addNotification('All files uploaded successfully. Parsing in background.', 'success');
      fetchDocuments();
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || 'Failed to upload files.';
      setUploadQueue(prev => prev.map(item => 
        newQueueItems.some(ni => ni.name === item.name) ? { ...item, status: 'failed', error: errMsg } : item
      ));
      addNotification(errMsg, 'error');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (docId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this document from library and clear its vector embeddings?')) {
      try {
        await api.delete(`/documents/${docId}`);
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        if (activePreviewDocId === docId) {
          setActivePreviewDocId(null);
        }
        addNotification('Document deleted from index', 'info');
      } catch (err: any) {
        addNotification('Failed to delete document.', 'error');
      }
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/25">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded-lg border border-rose-500/25">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded-lg border border-indigo-500/25 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing
          </span>
        );
    }
  };

  const filteredDocs = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedDoc = documents.find(d => d.id === activePreviewDocId);

  return (
    <div className="flex-1 flex h-screen bg-slate-950 text-slate-100 overflow-hidden relative font-sans">
      
      {/* Main Table & Upload View */}
      <div className="flex-1 p-8 overflow-y-auto h-full space-y-8 min-w-0 bg-slate-900/10">
        
        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Document Library</h1>
          <p className="text-slate-500 text-xs mt-1">Upload and manage source references. Embedded files are indexed into the ChromaDB vector database.</p>
        </div>

        {activeWorkspace && (
          <div className="p-4 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider">Active Project Scope</span>
              <p className="text-xs font-bold text-white">{activeWorkspace.name}</p>
              <p className="text-[10px] text-slate-400">{activeWorkspace.description || 'No description provided.'}</p>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Toggle checkboxes below to manage project files.</span>
          </div>
        )}

        {/* Upload Card Area */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3.5 ${
            dragActive 
              ? 'border-indigo-500 bg-indigo-500/5' 
              : 'border-slate-800 bg-slate-900/10 hover:bg-slate-900/30 hover:border-slate-700'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.docx,.csv,.txt,.md,.markdown"
            className="hidden"
            multiple
          />

          <div className="p-3.5 bg-slate-900 rounded-2xl text-slate-400 border border-slate-800 shadow-md">
            <Upload className="w-7 h-7 text-indigo-400 animate-bounce" />
          </div>
          
          <div>
            <p className="font-bold text-white text-xs">
              Drag & drop files here or click to browse
            </p>
            <p className="text-slate-500 text-[10px] mt-1">
              Supports multiple PDF, DOCX, CSV, TXT, and Markdown (Max 15MB each)
            </p>
          </div>
        </div>

        {/* Upload Queue Manager */}
        {uploadQueue.length > 0 && (
          <div className="bg-slate-950/45 border border-slate-900 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> Upload Queue Manager
              </h3>
              <button 
                onClick={() => setUploadQueue([])}
                className="text-[9px] text-slate-500 hover:text-white uppercase font-bold tracking-wider"
              >
                Clear Queue
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-36 overflow-y-auto pr-1">
              {uploadQueue.map((item) => (
                <div key={item.id} className="p-3 bg-slate-900/30 border border-slate-900/60 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-bold text-white truncate">{item.name}</p>
                    <p className="text-[9px] text-slate-500 font-semibold uppercase">{formatBytes(item.size)}</p>
                  </div>
                  
                  <div>
                    {item.status === 'uploading' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-500/20">
                        Uploading
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded-lg border border-indigo-500/20 animate-pulse">
                        Processing
                      </span>
                    )}
                    {item.status === 'completed' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20">
                        Indexed
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded-lg border border-rose-500/20" title={item.error}>
                        <AlertCircle className="w-3 h-3" /> Error
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents Table */}
        <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl overflow-hidden shadow-xl glass">
          <div className="px-6 py-4 border-b border-slate-900/60 bg-slate-950/20 flex items-center justify-between">
            <h3 className="font-bold text-white text-xs">Library Files ({filteredDocs.length})</h3>
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Sync Active</span>
          </div>

          {loading ? (
            /* Loading Skeletons */
            <div className="p-6 space-y-4">
              <div className="h-6 bg-slate-900 rounded animate-pulse w-full"></div>
              <div className="h-6 bg-slate-900 rounded animate-pulse w-full"></div>
              <div className="h-6 bg-slate-900 rounded animate-pulse w-full"></div>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-16 text-slate-600 text-xs">
              <File className="w-10 h-10 mx-auto text-slate-800 mb-3" />
              Your Document Library is empty.<br/>Upload files above to begin indexing.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider bg-slate-950/30">
                    {activeWorkspaceId && <th className="px-6 py-4">Link Project</th>}
                    <th className="px-6 py-4">Filename</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Size</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Embeddings Chunks</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40">
                  {filteredDocs.map((doc) => (
                    <tr 
                      key={doc.id} 
                      onClick={() => setActivePreviewDocId(doc.id)}
                      className={`hover:bg-slate-900/20 transition-all cursor-pointer ${
                        activePreviewDocId === doc.id ? 'bg-slate-900/30' : ''
                      }`}
                    >
                      {activeWorkspaceId && (
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={activeWorkspace?.documents?.some((d) => d.id === doc.id) || false}
                            onChange={() => handleToggleDocumentBind(doc.id, activeWorkspace?.documents?.some((d) => d.id === doc.id) || false)}
                            className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-800 rounded focus:ring-0 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span className="truncate max-w-[200px]" title={doc.filename}>{doc.filename}</span>
                        {doc.version > 1 && (
                          <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px] font-bold">
                            v{doc.version}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 uppercase text-slate-500 font-bold tracking-wider text-[10px]">{doc.file_type}</td>
                      <td className="px-6 py-4 text-slate-300">
                        {formatBytes(doc.size_bytes)}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(doc.status)}</td>
                      <td className="px-6 py-4 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-slate-500" />
                          {doc.status === 'processed' ? `${doc.embedding_count} vectors` : '--'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setActivePreviewDocId(doc.id)}
                            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800/80 transition-all"
                            title="Preview Content"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(doc.id, e)}
                            className="p-2 bg-slate-900 hover:bg-red-950/40 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800/80 hover:border-red-900/40 transition-all"
                            title="Delete Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sliding Side Document Preview panel */}
      {activePreviewDocId && selectedDoc && (
        <div className="w-96 bg-slate-950 border-l border-slate-900/60 flex flex-col h-full z-15 animate-in slide-in-from-right duration-250">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-white text-xs truncate max-w-[200px]" title={selectedDoc.filename}>
                Preview: {selectedDoc.filename}
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
          <div className="p-4 bg-slate-900/20 border-b border-slate-900/60 grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-semibold">
            <div>
              <p className="text-slate-500 uppercase font-bold text-[8px] tracking-widest">Version</p>
              <p className="text-slate-300 pt-0.5">v{selectedDoc.version}</p>
            </div>
            <div>
              <p className="text-slate-500 uppercase font-bold text-[8px] tracking-widest">File Size</p>
              <p className="text-slate-300 pt-0.5">{formatBytes(selectedDoc.size_bytes)}</p>
            </div>
            <div className="col-span-2 pt-1.5">
              <p className="text-slate-500 uppercase font-bold text-[8px] tracking-widest">Index Chunks</p>
              <p className="text-slate-300 pt-0.5">{selectedDoc.embedding_count} vector shards</p>
            </div>
          </div>

          {/* Chunks Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">
              Parsed Text Preview
            </div>
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-[10px] font-bold">Querying ChromaDB...</span>
              </div>
            ) : previewChunks.length === 0 ? (
              <div className="text-center py-20 text-slate-600 text-[11px]">
                No preview chunks available for this file type or status.
              </div>
            ) : (
              previewChunks.map((chunk, cidx) => (
                <div key={cidx} className="p-4 bg-slate-900/40 border border-slate-900 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center text-[9px] text-indigo-400 font-bold uppercase tracking-wider">
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

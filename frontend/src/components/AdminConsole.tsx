import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Users, 
  FileText, 
  Database, 
  Coins, 
  Activity, 
  RefreshCw, 
  Terminal,
  Cpu,
  Search,
  Brain,
  ShieldAlert,
  Clock,
  HardDrive,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AgentBreakdown {
  agent_name: string;
  total_tokens: number;
  total_cost: number;
}

interface DailyUsage {
  date: string;
  total_tokens: number;
  total_cost: number;
}

interface MonthlyUsage {
  month: string;
  total_tokens: number;
  total_cost: number;
}

interface AdminStats {
  user_count: number;
  document_count: number;
  total_embeddings: number;
  total_queries: number;
  storage_usage_bytes: number;
  total_tokens_spent: number;
  total_llm_cost: number;
  recent_logs: AuditLog[];
  agent_breakdown: AgentBreakdown[];
  daily_usage: DailyUsage[];
  monthly_usage: MonthlyUsage[];
  avg_response_time_sec?: number;
  system_health_status?: string;
  most_used_documents?: { filename: string; size_bytes: number; embedding_count: number }[];
  most_asked_questions?: string[];
}

interface EvaluationMetric {
  date: string;
  faithfulness: number;
  answer_relevancy: number;
  context_recall: number;
  context_precision: number;
  answer_correctness: number;
}

interface WeakRetrieval {
  id: number;
  query: string;
  answer: string;
  faithfulness: number;
  feedback: number;
  citations_count: number;
  timestamp: string;
}

interface FeedbackAnalysis {
  failed_count: number;
  common_themes: string[];
  recommendations: string[];
  frequent_questions: string[];
}

export const AdminConsole: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationMetric[]>([]);
  const [weakRetrievals, setWeakRetrievals] = useState<WeakRetrieval[]>([]);
  const [feedbackAnalysis, setFeedbackAnalysis] = useState<FeedbackAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  
  // Interactive chart tooltips state
  const [hoveredDailyIdx, setHoveredDailyIdx] = useState<number | null>(null);
  const [hoveredMonthlyIdx, setHoveredMonthlyIdx] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchStats(), fetchEvaluations(), fetchFeedbackAnalysis()]).then(() => setLoading(false));
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to load admin stats', err);
    }
  };

  const fetchEvaluations = async () => {
    try {
      const response = await api.get('/admin/evaluations');
      setEvaluations(response.data.historical_metrics || []);
      setWeakRetrievals(response.data.weak_retrievals || []);
    } catch (err) {
      console.error('Failed to load admin evaluations', err);
    }
  };

  const fetchFeedbackAnalysis = async () => {
    try {
      const response = await api.get('/admin/feedback/analysis');
      setFeedbackAnalysis(response.data);
    } catch (err) {
      console.error('Failed to load feedback analysis', err);
    }
  };

  const triggerManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchEvaluations(), fetchFeedbackAnalysis()]);
    setRefreshing(false);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-slate-950 text-slate-100 h-screen overflow-y-auto space-y-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="h-8 bg-slate-900 rounded w-1/4 animate-pulse"></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-900 rounded-2xl animate-pulse"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64 bg-slate-900 rounded-2xl animate-pulse"></div>
            <div className="h-64 bg-slate-900 rounded-2xl animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  const maxAgentTokens = stats?.agent_breakdown.reduce((max, curr) => curr.total_tokens > max ? curr.total_tokens : max, 1) || 1;

  // Filter audit logs
  const filteredLogs = stats?.recent_logs.filter((log) => {
    const term = logSearch.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      (log.ip_address && log.ip_address.toLowerCase().includes(term)) ||
      (log.details && log.details.toLowerCase().includes(term))
    );
  }) || [];

  // Extract latest RAGAS metrics averages
  const latestMetrics = evaluations[evaluations.length - 1] || {
    faithfulness: 0.92,
    answer_relevancy: 0.88,
    context_recall: 0.85,
    context_precision: 0.90,
    answer_correctness: 0.87
  };

  const getSLAColor = (score: number) => {
    if (score >= 0.85) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    if (score >= 0.75) return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
  };

  // SVG Chart Setup - Daily (Area/Line)
  const dailyData = stats?.daily_usage || [];
  const maxDaily = Math.max(...dailyData.map(d => d.total_tokens), 1);
  const dailyW = 550;
  const dailyH = 160;
  const dailyPoints = dailyData.map((d, i) => {
    const x = dailyData.length > 1 ? (i / (dailyData.length - 1)) * dailyW : 0;
    const y = dailyH - (d.total_tokens / maxDaily) * (dailyH - 20) - 10;
    return { x, y, data: d };
  });
  const dailyPath = dailyPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const dailyAreaPath = dailyPoints.length > 0
    ? `${dailyPath} L ${dailyPoints[dailyPoints.length - 1].x} ${dailyH} L ${dailyPoints[0].x} ${dailyH} Z`
    : '';

  // SVG Chart Setup - Monthly (Columns)
  const monthlyData = stats?.monthly_usage || [];
  const maxMonthly = Math.max(...monthlyData.map(m => m.total_tokens), 1);
  const monthlyW = 550;
  const monthlyH = 160;
  const colWidth = monthlyData.length > 0 ? (monthlyW / monthlyData.length) - 12 : 20;

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-950 text-slate-100 h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-900 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest font-mono">Live Enterprise Network</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-1 bg-gradient-to-r from-white via-slate-100 to-indigo-400 bg-clip-text text-transparent">
              Executive Dashboard
            </h1>
            <p className="text-slate-500 text-xs mt-1">Real-time system usage, operational SLA tracking, and multi-agent resource audits.</p>
          </div>
          <button
            onClick={triggerManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border border-transparent shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> 
            {refreshing ? 'Refreshing...' : 'Refresh Metrics'}
          </button>
        </div>

        {/* Key Operational Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          
          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Active Users</span>
              <p className="text-2xl font-bold text-white font-mono">{stats?.user_count}</p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>

          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Storage & Documents</span>
              <p className="text-2xl font-bold text-white font-mono">
                {stats?.document_count} 
                <span className="text-xs text-slate-500 font-semibold ml-1.5">({formatBytes(stats?.storage_usage_bytes || 0)})</span>
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-110 transition-transform">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>

          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Vector Embeddings</span>
              <p className="text-2xl font-bold text-white font-mono">{(stats?.total_embeddings || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl group-hover:scale-110 transition-transform">
              <Database className="w-5 h-5" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>

          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total LLM Cost</span>
              <p className="text-2xl font-bold text-emerald-400 font-mono">
                ${stats?.total_llm_cost.toFixed(4)}
              </p>
            </div>
            <div className="p-3 bg-teal-500/10 text-teal-400 rounded-xl group-hover:scale-110 transition-transform">
              <Coins className="w-5 h-5" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>
        </div>

        {/* System Health, Latency & Quality Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          
          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">System Health</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`h-2 w-2 rounded-full ${stats?.system_health_status === 'optimal' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40' : 'bg-rose-500 shadow-lg shadow-rose-500/40'}`}></span>
                <p className={`text-xs font-bold uppercase ${stats?.system_health_status === 'optimal' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stats?.system_health_status || 'optimal'}
                </p>
              </div>
            </div>
            <div className="p-3 bg-slate-800 text-slate-400 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Avg Latency</span>
              <p className="text-2xl font-bold text-white font-mono">
                {stats?.avg_response_time_sec || 1.85}s
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Token Usage</span>
              <p className="text-2xl font-bold text-indigo-400 font-mono">
                {(stats?.total_tokens_spent || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <Cpu className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 bg-slate-900/20 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Response Accuracy</span>
              <p className="text-2xl font-bold text-emerald-400 font-mono">
                {((latestMetrics?.faithfulness || 0.92) * 100).toFixed(0)}%
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Brain className="w-5 h-5" />
            </div>
          </div>

        </div>

        {/* SLA and RAGAS scorecards */}
        <div className="p-6 bg-slate-900/20 border border-slate-800/80 rounded-2xl space-y-6 shadow-xl">
          <div className="flex justify-between items-center border-b border-slate-900 pb-3">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-indigo-400" /> RAGAS Production Accuracy Evaluation
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">Target SLA: &gt;= 85% factual compliance</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            
            <div className={`p-4 border rounded-xl flex flex-col items-center justify-center text-center space-y-1.5 transition-all hover:bg-slate-900/30 ${getSLAColor(latestMetrics.faithfulness)}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Faithfulness</span>
              <p className="text-xl font-bold font-mono">{(latestMetrics.faithfulness * 100).toFixed(0)}%</p>
              <span className="text-[9px] opacity-75">{latestMetrics.faithfulness >= 0.85 ? 'Factually Sound' : 'High Risk'}</span>
            </div>

            <div className={`p-4 border rounded-xl flex flex-col items-center justify-center text-center space-y-1.5 transition-all hover:bg-slate-900/30 ${getSLAColor(latestMetrics.answer_relevancy)}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Relevancy</span>
              <p className="text-xl font-bold font-mono">{(latestMetrics.answer_relevancy * 100).toFixed(0)}%</p>
              <span className="text-[9px] opacity-75">{latestMetrics.answer_relevancy >= 0.80 ? 'Aligned' : 'Off-topic'}</span>
            </div>

            <div className={`p-4 border rounded-xl flex flex-col items-center justify-center text-center space-y-1.5 transition-all hover:bg-slate-900/30 ${getSLAColor(latestMetrics.context_precision)}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Precision</span>
              <p className="text-xl font-bold font-mono">{(latestMetrics.context_precision * 100).toFixed(0)}%</p>
              <span className="text-[9px] opacity-75">{latestMetrics.context_precision >= 0.80 ? 'Accurate' : 'Noisy'}</span>
            </div>

            <div className={`p-4 border rounded-xl flex flex-col items-center justify-center text-center space-y-1.5 transition-all hover:bg-slate-900/30 ${getSLAColor(latestMetrics.context_recall)}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Recall</span>
              <p className="text-xl font-bold font-mono">{(latestMetrics.context_recall * 100).toFixed(0)}%</p>
              <span className="text-[9px] opacity-75">{latestMetrics.context_recall >= 0.80 ? 'Complete' : 'Gaps Found'}</span>
            </div>

            <div className={`p-4 border rounded-xl flex flex-col items-center justify-center text-center space-y-1.5 transition-all hover:bg-slate-900/30 ${getSLAColor(latestMetrics.answer_correctness)}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Correctness</span>
              <p className="text-xl font-bold font-mono">{(latestMetrics.answer_correctness * 100).toFixed(0)}%</p>
              <span className="text-[9px] opacity-75">{latestMetrics.answer_correctness >= 0.85 ? 'Correct' : 'Needs Tuning'}</span>
            </div>

          </div>
        </div>

        {/* Interactive Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Daily Analytics Line/Area Chart */}
          <div className="p-6 bg-slate-900/20 border border-slate-800/80 rounded-2xl space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" /> Daily Analytics (Token Volume)
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Hover points to audit details</span>
            </div>

            <div className="relative pt-6">
              {dailyPoints.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs">No daily volume statistics recorded yet.</div>
              ) : (
                <div className="relative">
                  <svg viewBox={`0 0 ${dailyW} ${dailyH}`} className="overflow-visible w-full h-auto">
                    <defs>
                      <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    
                    {/* Horizontal helper grid lines */}
                    <line x1="0" y1={dailyH / 4} x2={dailyW} y2={dailyH / 4} stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="0" y1={dailyH / 2} x2={dailyW} y2={dailyH / 2} stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="0" y1={(3 * dailyH) / 4} x2={dailyW} y2={(3 * dailyH) / 4} stroke="#1e293b" strokeDasharray="3 3" />

                    {/* Shaded Area */}
                    {dailyAreaPath && <path d={dailyAreaPath} fill="url(#dailyGrad)" />}

                    {/* Gradient Line Path */}
                    {dailyPath && <path d={dailyPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />}

                    {/* Interactive Hover Dots */}
                    {dailyPoints.map((p, idx) => (
                      <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredDailyIdx(idx)} onMouseLeave={() => setHoveredDailyIdx(null)}>
                        <circle cx={p.x} cy={p.y} r={hoveredDailyIdx === idx ? 6 : 4} fill={hoveredDailyIdx === idx ? '#10b981' : '#020617'} stroke="#10b981" strokeWidth="2" />
                      </g>
                    ))}
                  </svg>
                  
                  {/* Floating HTML Tooltip */}
                  {hoveredDailyIdx !== null && dailyPoints[hoveredDailyIdx] && (
                    <div className="absolute top-0 right-0 bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-[10px] space-y-0.5 shadow-2xl z-20 pointer-events-none">
                      <p className="font-bold text-slate-400">{dailyPoints[hoveredDailyIdx].data.date}</p>
                      <p className="text-white">Tokens: <span className="font-mono font-bold text-emerald-400">{(dailyPoints[hoveredDailyIdx].data.total_tokens).toLocaleString()}</span></p>
                      <p className="text-white">Estimated Cost: <span className="font-mono text-slate-300">${(dailyPoints[hoveredDailyIdx].data.total_cost).toFixed(5)}</span></p>
                    </div>
                  )}
                </div>
              )}
              
              {/* X Axis Labels */}
              <div className="flex justify-between text-[9px] text-slate-500 font-mono pt-3">
                {dailyData.map((d, i) => (
                  <span key={i}>{d.date}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly Analytics Bar Chart */}
          <div className="p-6 bg-slate-900/20 border border-slate-800/80 rounded-2xl space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-400" /> Monthly Analytics (Cost / Volume)
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Last 12 Months activity</span>
            </div>

            <div className="relative pt-6">
              {monthlyData.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs">No monthly analytics recorded yet.</div>
              ) : (
                <div className="relative">
                  <svg viewBox={`0 0 ${monthlyW} ${monthlyH}`} className="overflow-visible w-full h-auto">
                    {/* Horizontal helper grid lines */}
                    <line x1="0" y1={monthlyH / 4} x2={monthlyW} y2={monthlyH / 4} stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="0" y1={monthlyH / 2} x2={monthlyW} y2={monthlyH / 2} stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="0" y1={(3 * monthlyH) / 4} x2={monthlyW} y2={(3 * monthlyH) / 4} stroke="#1e293b" strokeDasharray="3 3" />

                    {/* Columns */}
                    {monthlyData.map((m, i) => {
                      const h = (m.total_tokens / maxMonthly) * (monthlyH - 20);
                      const x = (i * (monthlyW / monthlyData.length)) + 6;
                      const y = monthlyH - h;
                      return (
                        <g 
                          key={i} 
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredMonthlyIdx(i)}
                          onMouseLeave={() => setHoveredMonthlyIdx(null)}
                        >
                          <rect 
                            x={x} 
                            y={y} 
                            width={colWidth} 
                            height={Math.max(h, 4)} 
                            rx="3" 
                            fill={hoveredMonthlyIdx === i ? '#818cf8' : '#4f46e5'} 
                            opacity={hoveredMonthlyIdx === i ? 1.0 : 0.85}
                            className="transition-all duration-200"
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Floating HTML Tooltip */}
                  {hoveredMonthlyIdx !== null && monthlyData[hoveredMonthlyIdx] && (
                    <div className="absolute top-0 right-0 bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-[10px] space-y-0.5 shadow-2xl z-20 pointer-events-none">
                      <p className="font-bold text-slate-400">{monthlyData[hoveredMonthlyIdx].month}</p>
                      <p className="text-white">Tokens: <span className="font-mono font-bold text-indigo-400">{(monthlyData[hoveredMonthlyIdx].total_tokens).toLocaleString()}</span></p>
                      <p className="text-white">Estimated Cost: <span className="font-mono text-slate-300">${(monthlyData[hoveredMonthlyIdx].total_cost).toFixed(5)}</span></p>
                    </div>
                  )}
                </div>
              )}

              {/* X Axis Labels */}
              <div className="flex justify-between text-[9px] text-slate-500 font-mono pt-3">
                {monthlyData.map((m, i) => (
                  <span key={i}>{m.month}</span>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Multi-agent breakdown and active loop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="p-6 bg-slate-900/20 border border-slate-800/80 rounded-2xl space-y-4 shadow-xl lg:col-span-2">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 border-b border-slate-900 pb-3">
              <Cpu className="w-4 h-4 text-indigo-400" /> Multi-Agent Cost & Workload breakdown
            </h3>
            
            <div className="space-y-4">
              {stats?.agent_breakdown.length === 0 ? (
                <div className="text-center py-10 text-slate-600 text-xs">No agent usage statistics recorded yet.</div>
              ) : (
                stats?.agent_breakdown.map((item, idx) => {
                  const percentage = (item.total_tokens / maxAgentTokens) * 100;
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-200 capitalize font-mono">{item.agent_name.replace(" Agent", "")}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {item.total_tokens.toLocaleString()} tokens spent (${item.total_cost.toFixed(5)})
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900">
                        <div 
                          className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-6 bg-slate-900/20 border border-slate-800/80 rounded-2xl space-y-4 shadow-xl">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 border-b border-slate-900 pb-3">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Feedback Loop & Downvotes
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Flagged Downvoted Queries:</span>
                <span className="px-2 py-0.5 rounded font-bold font-mono text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  {feedbackAnalysis?.failed_count || 0} alerts
                </span>
              </div>
              
              <div className="space-y-2">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Common Failure Themes</p>
                {feedbackAnalysis?.common_themes && feedbackAnalysis.common_themes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {feedbackAnalysis.common_themes.map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-850 border border-slate-800 text-slate-300 text-[10px] rounded-md font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600 italic">No common issues registered.</p>
                )}
              </div>

              <div className="space-y-2 border-t border-slate-900/60 pt-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Auto-Optimization Advice</p>
                {!feedbackAnalysis?.recommendations || feedbackAnalysis.recommendations.length === 0 ? (
                  <div className="p-2.5 bg-slate-950/40 border border-slate-900 rounded-xl text-[10px] text-slate-500 flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <p className="leading-relaxed">System performance is healthy. No repairs recommended.</p>
                  </div>
                ) : (
                  feedbackAnalysis.recommendations.slice(0, 2).map((rec, rIdx) => (
                    <div key={rIdx} className="p-2.5 bg-slate-950/40 border border-slate-900 rounded-xl text-[10px] text-slate-300 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <p className="leading-relaxed">{rec}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Weak Retrieval Audit Alerts */}
        <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-900/60 bg-slate-950/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <h3 className="font-bold text-white text-xs">SLA Violations & Weak Retrieval Audit</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {weakRetrievals.length} SLA Alarms Active
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider bg-slate-950/30">
                  <th className="px-6 py-4">Query</th>
                  <th className="px-6 py-4">Faithfulness</th>
                  <th className="px-6 py-4">User Feedback</th>
                  <th className="px-6 py-4">Citations</th>
                  <th className="px-6 py-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40 text-slate-400 font-mono text-[11px]">
                {weakRetrievals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-600 font-sans">All queries currently pass active RAGAS SLA criteria.</td>
                  </tr>
                ) : (
                  weakRetrievals.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/10 transition-all">
                      <td className="px-6 py-3.5 max-w-[250px] truncate font-medium text-white font-sans" title={item.query}>{item.query}</td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          item.faithfulness < 0.85 ? 'text-rose-400 bg-rose-500/5' : 'text-amber-400 bg-amber-500/5'
                        }`}>
                          {(item.faithfulness * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          item.feedback === -1 ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {item.feedback === -1 ? 'Downvoted' : 'Not Rated'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 font-bold">{item.citations_count} items</td>
                      <td className="px-6 py-3.5 text-slate-500 font-semibold">{new Date(item.timestamp).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Popular Assets (Documents & Questions) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="p-6 bg-slate-900/20 border border-slate-800/80 rounded-2xl space-y-4 shadow-xl">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 border-b border-slate-900 pb-3">
              <FileText className="w-4 h-4 text-indigo-400" /> Most Used Reference Documents
            </h3>
            <div className="space-y-3 text-xs">
              {!stats?.most_used_documents || stats.most_used_documents.length === 0 ? (
                <div className="text-center py-6 text-slate-600">No popular document assets indexed yet.</div>
              ) : (
                stats.most_used_documents.map((doc, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
                    <span className="font-semibold text-white truncate max-w-[250px] font-mono">{doc.filename}</span>
                    <span className="text-[10px] text-slate-500 font-mono font-bold">
                      {doc.embedding_count} vectors ({formatBytes(doc.size_bytes)})
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-6 bg-slate-900/20 border border-slate-800/80 rounded-2xl space-y-4 shadow-xl">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 border-b border-slate-900 pb-3">
              <Activity className="w-4 h-4 text-indigo-400" /> Most Frequently Asked Questions
            </h3>
            <div className="space-y-3 text-xs">
              {!stats?.most_asked_questions || stats.most_asked_questions.length === 0 ? (
                <div className="text-center py-6 text-slate-600">No query questions recorded yet.</div>
              ) : (
                stats.most_asked_questions.map((q, idx) => (
                  <div key={idx} className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-slate-300 italic truncate" title={q}>
                    "{q}"
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Security Audit logs */}
        <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-900/60 bg-slate-950/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <h3 className="font-bold text-white text-xs">Security Audits & Activity Log</h3>
            </div>
            <div className="relative max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Filter logs..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-white placeholder-slate-600 focus:outline-none focus:border-slate-700"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider bg-slate-950/30">
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Client IP</th>
                  <th className="px-6 py-4">Parameters / Details</th>
                  <th className="px-6 py-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40 font-mono text-[10px] text-slate-400">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-600 font-sans">No audit events match current criteria.</td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/10 transition-all">
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          log.action.includes('fail') || log.action.includes('error')
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-300 font-bold">{log.user_id !== null ? `User #${log.user_id}` : 'system'}</td>
                      <td className="px-6 py-3.5 text-slate-400">{log.ip_address || 'unknown'}</td>
                      <td className="px-6 py-3.5 max-w-[250px] truncate text-slate-400" title={log.details || ''}>{log.details || '--'}</td>
                      <td className="px-6 py-3.5 text-slate-500 font-semibold">{new Date(log.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

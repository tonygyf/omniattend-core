import React, { useState } from 'react';
import { fetchDashboardStats, fetchRecentAttendance } from '../services/dataService';
import { generateAttendanceInsights } from '../services/geminiService';
import { Sparkles, Bot, ArrowRight, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; // Actually, let's keep it simple without extra deps if possible, but for markdown response rendering simple text is fine or minimal custom render. I'll use simple formatting.

const AiInsights: React.FC = () => {
  const [insight, setInsight] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // 1. Fetch current data
      const [stats, recent] = await Promise.all([
        fetchDashboardStats(),
        fetchRecentAttendance()
      ]);

      // 2. Call Gemini
      const text = await generateAttendanceInsights(stats, recent);
      setInsight(text);
    } catch (e) {
      setInsight("Failed to connect to AI service.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-2">
          <Sparkles className="text-white w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">智能考勤洞察</h1>
        <p className="text-slate-500 max-w-xl mx-auto">
          使用 Gemini AI 分析考勤趋势，识别置信度异常，优化准点率。
        </p>
      </div>

      {!insight && !generating && (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center">
            <div className="max-w-md mx-auto space-y-6">
                <Bot className="w-16 h-16 text-indigo-200 mx-auto" />
                <h3 className="text-xl font-semibold text-slate-800">准备生成分析报告</h3>
                <p className="text-slate-500">
                    我们将提交统计数据与最近日志的元信息给 Google Gemini，以生成健康度报告。
                </p>
                <button 
                    onClick={handleGenerate}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                >
                    生成报告 <ArrowRight size={20}/>
                </button>
            </div>
        </div>
      )}

      {generating && (
         <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 flex flex-col items-center justify-center space-y-4 min-h-[400px]">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <p className="text-slate-600 font-medium">正在调用 Gemini...</p>
            <p className="text-slate-400 text-sm">分析置信度与时间戳</p>
         </div>
      )}

      {insight && !generating && (
        <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-slate-100 animate-fade-in">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 flex justify-between items-center">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                    <Sparkles size={20} className="text-yellow-300"/> AI 分析报告
                </h2>
                <button 
                    onClick={handleGenerate} 
                    className="text-indigo-100 hover:text-white text-sm font-medium underline"
                >
                    刷新
                </button>
            </div>
            <div className="p-8 prose prose-slate max-w-none text-slate-700">
                {/* Simple whitespace handling for the text response */}
                <div className="whitespace-pre-wrap leading-relaxed">
                    {insight}
                </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400">由 Gemini-3-flash-preview 生成。可在本地日志中查看验证信息。</p>
            </div>
        </div>
      )}
    </div>
  );
};

export default AiInsights;

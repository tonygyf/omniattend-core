import React, { useEffect, useState, useMemo } from 'react';
import { fetchAttendanceAnalysis } from '../services/dataService';
import { generateAttendanceInsights } from '../services/geminiService';
import { StudentAttendanceAnalysis } from '../types';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertTriangle, ArrowUpDown, Sparkles, Bot, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

type SortKey = keyof StudentAttendanceAnalysis | 'attendanceRate';

const AiInsightsPage: React.FC = () => {
  const [analysis, setAnalysis] = useState<StudentAttendanceAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'absentCount', direction: 'desc' });
  const auth = useAuth();

  useEffect(() => {
    if (auth.user?.id) {
      loadAnalysis(auth.user.id);
    }
  }, [auth.user]);

  const loadAnalysis = async (teacherId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAttendanceAnalysis(teacherId);
      setAnalysis(data);
    } catch (err) {
      setError('无法加载考勤分析数据，请稍后重试。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sortedAnalysis = useMemo(() => {
    let sortableItems = [...analysis];
    sortableItems.sort((a, b) => {
      const aValue = sortConfig.key === 'attendanceRate' ? (a.presentCount / a.totalSessions) : a[sortConfig.key as keyof StudentAttendanceAnalysis];
      const bValue = sortConfig.key === 'attendanceRate' ? (b.presentCount / b.totalSessions) : b[sortConfig.key as keyof StudentAttendanceAnalysis];

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [analysis, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const atRiskStudents = useMemo(() => {
    return analysis.filter(s => s.absentCount > 3 || s.lateCount > 5);
  }, [analysis]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-2">
          <Sparkles className="text-white w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">智能考勤洞察</h1>
        <p className="text-slate-500 mt-1 max-w-xl mx-auto">基于历史数据，自动识别考勤模式与风险学生。</p>
      </div>

      {/* At-Risk Summary */}
      <motion.div 
        className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-r-lg shadow-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-8 h-8 text-amber-500 mt-1 flex-shrink-0" />
          <div>
            <h2 className="text-xl font-semibold text-amber-900">高风险学生识别</h2>
            <p className="text-amber-800 mt-1">
              {loading ? '正在分析...' : `发现 ${atRiskStudents.length} 名学生存在显著的缺勤或频繁迟到模式。建议重点关注。`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Full Analysis Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-slate-800">全体学生考勤分析</h2>
        </div>
        {loading ? (
          <div className="flex h-60 items-center justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mr-2" /> 正在加载数据...</div>
        ) : error ? (
          <div className="flex h-60 items-center justify-center text-red-500"><AlertTriangle className="w-6 h-6 mr-2" /> {error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">学生</th>
                  <th className="px-6 py-4 font-semibold cursor-pointer flex items-center gap-1" onClick={() => requestSort('totalSessions')}>总次数 <ArrowUpDown size={14}/></th>
                  <th className="px-6 py-4 font-semibold cursor-pointer flex items-center gap-1" onClick={() => requestSort('presentCount')}>出勤 <ArrowUpDown size={14}/></th>
                  <th className="px-6 py-4 font-semibold cursor-pointer flex items-center gap-1" onClick={() => requestSort('lateCount')}>迟到 <ArrowUpDown size={14}/></th>
                  <th className="px-6 py-4 font-semibold cursor-pointer flex items-center gap-1" onClick={() => requestSort('absentCount')}>缺勤 <ArrowUpDown size={14}/></th>
                  <th className="px-6 py-4 font-semibold cursor-pointer flex items-center gap-1" onClick={() => requestSort('attendanceRate')}>出勤率 <ArrowUpDown size={14}/></th>
                </tr>
              </thead>
              <motion.tbody 
                className="divide-y divide-slate-100"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
              >
                {sortedAnalysis.map(student => {
                  const attendanceRate = student.totalSessions > 0 ? (student.presentCount / student.totalSessions) * 100 : 0;
                  const isAtRisk = student.absentCount > 3 || student.lateCount > 5;
                  return (
                    <motion.tr 
                      key={student.studentId} 
                      className={`hover:bg-slate-50 ${isAtRisk ? 'bg-red-50/50' : ''}`}
                      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                    >
                      <td className="px-6 py-4 font-medium text-slate-800">
                        <div className="flex flex-col">
                          <span>{student.studentName}</span>
                          <span className="text-xs text-slate-500 font-mono">{student.studentSid}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-center">{student.totalSessions}</td>
                      <td className="px-6 py-4 font-mono text-center text-green-600">{student.presentCount}</td>
                      <td className="px-6 py-4 font-mono text-center text-amber-600">{student.lateCount}</td>
                      <td className="px-6 py-4 font-mono text-center text-red-600 font-bold">{student.absentCount}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-200 rounded-full h-2.5">
                            <div 
                              className={`h-2.5 rounded-full ${attendanceRate > 80 ? 'bg-green-500' : attendanceRate > 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${attendanceRate}%` }}
                            ></div>
                          </div>
                          <span className="font-mono text-xs">{attendanceRate.toFixed(0)}%</span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiInsightsPage;

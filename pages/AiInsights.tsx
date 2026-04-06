import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchAttendanceAnalysis } from '../services/dataService';
import { generateAttendanceInsights } from '../services/groqService';
import { StudentAttendanceAnalysis } from '../types';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertTriangle, Sparkles, Bot, HelpCircle, List, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SortKey = keyof StudentAttendanceAnalysis | 'attendanceRate';

import Modal from '../components/Modal';

const COOLDOWN_SECONDS = 60;

const AiInsightsPage: React.FC = () => {
  const [analysis, setAnalysis] = useState<StudentAttendanceAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'absentCount',
    direction: 'desc'
  });
  const [insights, setInsights] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'student' | 'class'>('student');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const auth = useAuth();

  const getCacheKey = useCallback(() => {
    if (!auth.user?.id) return null;
    const date = new Date().toISOString().split('T')[0];
    return `insights_${auth.user.id}_${date}`;
  }, [auth.user?.id]);

  useEffect(() => {
    const cacheKey = getCacheKey();
    if (cacheKey) {
      const cachedInsights = localStorage.getItem(cacheKey);
      if (cachedInsights) {
        setInsights(cachedInsights);
      }
    }
  }, [getCacheKey]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const loadAnalysis = useCallback(async (teacherId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAttendanceAnalysis(teacherId);
      setAnalysis(data);
    } catch (err) {
      console.error(err);
      setError('无法加载考勤分析数据，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const teacherId = Number(auth.user?.id);
    if (Number.isFinite(teacherId) && teacherId > 0) {
      loadAnalysis(teacherId);
    }
  }, [auth.user?.id, loadAnalysis]);

  const handleGenerateInsights = async () => {
    const cacheKey = getCacheKey();
    if (cacheKey) {
      const cachedInsights = localStorage.getItem(cacheKey);
      if (cachedInsights) {
        setInsights(cachedInsights);
        return;
      }
    }

    setGenerating(true);
    setError(null); // Clear previous errors
    try {
      const stats = {
        totalUsers: analysis.length,
        presentToday: analysis.reduce((sum, s) => sum + s.presentCount, 0),
        lateToday: analysis.reduce((sum, s) => sum + s.lateCount, 0),
        absentToday: analysis.reduce((sum, s) => sum + s.absentCount, 0),
      };
      const studentData = analysis.slice(0, 20).map(s => ({
        name: s.studentName,
        class: s.className,
        totalSessions: s.totalSessions,
        present: s.presentCount,
        late: s.lateCount,
        absent: s.absentCount,
        attendanceRate: s.totalSessions > 0 ? (s.presentCount / s.totalSessions).toFixed(2) : '0.00'
      }));
      
      const result = await generateAttendanceInsights(stats, studentData);
      setInsights(result);

      if (cacheKey) {
        localStorage.setItem(cacheKey, result);
      }
      
      setCooldown(COOLDOWN_SECONDS);
    } catch (e: any) {
      console.error(e);
      if (e.status === 429) {
        setError('AI 调用过于频繁，请稍后再试。');
      } else {
        setError('生成洞察失败，请检查 AI 服务连接。');
      }
      setInsights(null); // Clear insights on error
    } finally {
      setGenerating(false);
    }
  };

  const sortedAnalysis = useMemo(() => {
    const items = [...analysis]
    items.sort((a, b) => {
      const aValue =
        sortConfig.key === 'attendanceRate'
          ? a.totalSessions
            ? a.presentCount / a.totalSessions
            : 0
          : (a as any)[sortConfig.key]
      const bValue =
        sortConfig.key === 'attendanceRate'
          ? b.totalSessions
            ? b.presentCount / b.totalSessions
            : 0
          : (b as any)[sortConfig.key]

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
    return items
  }, [analysis, sortConfig])

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc'
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc'
    setSortConfig({ key, direction })
  }

  const atRiskStudents = useMemo(
    () => analysis.filter(s => s.absentCount > 3 || s.lateCount > 5),
    [analysis]
  )

  return (
    <motion.div translate="no" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">

      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-2">
          <Sparkles className="text-white w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">智能考勤洞察</h1>
        <p className="text-slate-500 mt-1 max-w-xl mx-auto">
          基于当前教师班级考勤数据，自动识别考勤模式与风险学生。
        </p>
      </div>

      {/* AI Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 rounded-2xl shadow-lg"
      >
        <div className="flex items-center gap-3 mb-3">
          <Bot className="w-6 h-6" />
          <h2 className="text-lg font-semibold">AI 智能洞察</h2>
        </div>

        {error && (
            <div className="bg-red-800/50 p-3 rounded-lg text-sm mb-4">{error}</div>
        )}

        {insights && !generating ? (
          <pre className="text-sm whitespace-pre-wrap font-sans animate-fade-in">{insights}</pre>
        ) : (
          <button
            onClick={handleGenerateInsights}
            disabled={generating || loading || cooldown > 0}
            className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {generating ? '正在生成...' : cooldown > 0 ? `${cooldown}秒后可再试` : '生成考勤洞察'}
          </button>
        )}
      </motion.div>

      {/* Risk Students */}
      <AnimatePresence>
        {atRiskStudents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="text-red-500" />
              高风险学生 ({atRiskStudents.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {atRiskStudents.slice(0, 3).map(student => (
                <motion.div
                  key={student.studentId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  layout
                  className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold text-red-900">{student.studentName}</span>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="text-sm text-slate-600 mt-2">缺勤 {student.absentCount} 次</div>
                  <div className="text-sm text-slate-600">迟到 {student.lateCount} 次</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">全体学生考勤分析</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button onClick={() => setViewMode('student')} className={`px-3 py-1 rounded-md text-sm font-medium ${viewMode === 'student' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <Users size={16} className="inline mr-1"/>
              学生视图
            </button>
            <button onClick={() => setViewMode('class')} className={`px-3 py-1 rounded-md text-sm font-medium ${viewMode === 'class' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <List size={16} className="inline mr-1"/>
              班级视图
            </button>
          </div>
          <button onClick={() => setIsHelpOpen(true)} className="p-2 text-slate-400 hover:text-slate-600">
            <HelpCircle size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

        {loading ? (
          <div className="flex h-60 items-center justify-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            正在加载数据...
          </div>
        ) : error ? (
          <div className="flex h-60 items-center justify-center text-red-500">
            <AlertTriangle className="w-6 h-6 mr-2" />
            {error}
          </div>
        ) : (
          viewMode === 'student' ? (
            <StudentDetailView analysis={sortedAnalysis} />
          ) : (
            <ClassSummaryView analysis={analysis} />
          )
        )}
      </div>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

    </motion.div>
  )
}

export default AiInsightsPage;

// View Components
const StudentDetailView: React.FC<{ analysis: StudentAttendanceAnalysis[] }> = ({ analysis }) => (
  <div className="overflow-x-auto max-h-[500px]">
    <table className="w-full text-left text-sm">
      {/* ... [The existing table head] ... */}
      <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
        <tr>
          <th className="px-6 py-4 font-semibold">学生</th>
          <th className="px-6 py-4 font-semibold">总次数</th>
          <th className="px-6 py-4 font-semibold">出勤</th>
          <th className="px-6 py-4 font-semibold">迟到</th>
          <th className="px-6 py-4 font-semibold">缺勤</th>
          <th className="px-6 py-4 font-semibold">出勤率</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        <AnimatePresence>
          {analysis.map(student => (
            <motion.tr key={student.studentId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <td className="px-6 py-4">{student.studentName}</td>
              <td className="px-6 py-4 text-center">{student.totalSessions}</td>
              <td className="px-6 py-4 text-center text-green-600">{student.presentCount}</td>
              <td className="px-6 py-4 text-center text-amber-600">{student.lateCount}</td>
              <td className="px-6 py-4 text-center text-red-600">{student.absentCount}</td>
              <td className="px-6 py-4">{student.totalSessions > 0 ? ((student.presentCount / student.totalSessions) * 100).toFixed(0) : '0'}%</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  </div>
);

const ClassSummaryView: React.FC<{ analysis: StudentAttendanceAnalysis[] }> = ({ analysis }) => {
  const byClass = useMemo(() => {
    const grouped: { [key: string]: StudentAttendanceAnalysis[] } = {};
    analysis.forEach(s => {
      if (!grouped[s.className]) grouped[s.className] = [];
      grouped[s.className].push(s);
    });
    return Object.entries(grouped).map(([className, students]) => ({
      className,
      studentCount: students.length,
      avgAttendance: students.length > 0
        ? students.reduce((acc, s) => acc + (s.totalSessions > 0 ? (s.presentCount / s.totalSessions) : 0), 0) / students.length * 100
        : 0,
      totalAbsences: students.reduce((acc, s) => acc + s.absentCount, 0),
      students
    }));
  }, [analysis]);

  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-6 py-4 font-semibold">班级</th>
            <th className="px-6 py-4 font-semibold">学生数</th>
            <th className="px-6 py-4 font-semibold">平均出勤率</th>
            <th className="px-6 py-4 font-semibold">总缺勤</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <AnimatePresence>
            {byClass.map(c => (
              <React.Fragment key={c.className}>
                <motion.tr layout onClick={() => setExpandedClass(expandedClass === c.className ? null : c.className)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-blue-700">{c.className}</td>
                  <td className="px-6 py-4">{c.studentCount}</td>
                  <td className="px-6 py-4">{c.avgAttendance.toFixed(1)}%</td>
                  <td className="px-6 py-4 text-red-600">{c.totalAbsences}</td>
                </motion.tr>
                {expandedClass === c.className && (
                  <motion.tr>
                    <td colSpan={4} className="p-0 bg-slate-50">
                      <div className="p-4">
                        <StudentDetailView analysis={c.students} />
                      </div>
                    </td>
                  </motion.tr>
                )}
              </React.Fragment>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
};

const HelpModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => (
  <Modal open={isOpen} onClose={onClose} title="AI Insights - Common Issues">
    <div className="space-y-4 text-sm text-slate-600">
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">1. Blank Screen or Endless Loading</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>Check browser console (F12) for any red error messages.</li>
          <li>Ensure your `API_BASE_URL` in `services/dataService.ts` is correct and reachable.</li>
          <li>Verify authentication is working; try logging out and back in.</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">2. Insight Generation Fails (500 Error)</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>This can be a temporary server-side issue. Please try again in a few moments.</li>
          <li>Ensure your backend service is running and connected to the database correctly.</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">3. Gemini API or Network Errors</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>This indicates a problem connecting to the Google Gemini API.</li>
          <li>Check your internet connection.</li>
          <li>Verify that the Gemini API key and configuration on your backend are correct.</li>
        </ul>
      </div>
    </div>
  </Modal>
);

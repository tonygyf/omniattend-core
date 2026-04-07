import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchClassrooms, fetchFaceTemplateSummary, enrollFaceBatch, verifyFaceBatch, fetchFaceModelStatus } from '../services/dataService';
import { Classroom, FaceTemplateSummaryItem, FaceVerifyBatchResult, FaceModelStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertTriangle, Sparkles, Bot, HelpCircle, List, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../components/Modal';

type SortKey = keyof FaceTemplateSummaryItem | 'hasTemplate';

const AiInsightsPage: React.FC = () => {
  const [templates, setTemplates] = useState<FaceTemplateSummaryItem[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'templateCount',
    direction: 'asc'
  });
  const [viewMode, setViewMode] = useState<'student' | 'class'>('student');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [modelVer, setModelVer] = useState('mobilefacenet.onnx');
  const [threshold, setThreshold] = useState(0.55);
  const [maxStudents, setMaxStudents] = useState(50);
  const [probeInput, setProbeInput] = useState('');
  const [runningEnroll, setRunningEnroll] = useState(false);
  const [runningVerify, setRunningVerify] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<FaceVerifyBatchResult | null>(null);
  const [modelStatus, setModelStatus] = useState<FaceModelStatus | null>(null);
  const [checkingModel, setCheckingModel] = useState(false);

  const auth = useAuth();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roomData, templateData] = await Promise.all([
        fetchClassrooms(),
        fetchFaceTemplateSummary(selectedClassId > 0 ? selectedClassId : undefined)
      ]);
      setClassrooms(roomData || []);
      setTemplates(templateData || []);
    } catch (err) {
      console.error(err);
      setError('无法加载人脸向量数据，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (auth.user?.id) {
      loadData();
    }
  }, [auth.user?.id, loadData]);

  const handleEnrollBatch = async () => {
    const normalizedModelVer = modelVer.trim();
    const normalizedMaxStudents = Math.min(200, Math.max(1, Number(maxStudents) || 1));
    if (!normalizedModelVer) {
      setError('模型版本不能为空。');
      return;
    }
    if (modelStatus && !modelStatus.available) {
      setError('当前模型不可用，请先点击“检测模型可用性”并确认模型可访问。');
      return;
    }
    setRunningEnroll(true);
    setError(null);
    setEnrollMessage(null);
    try {
      const result = await enrollFaceBatch({
        classId: selectedClassId > 0 ? selectedClassId : undefined,
        modelVer: normalizedModelVer,
        maxStudents: normalizedMaxStudents
      });
      if (!result.success || !result.data) {
        setError(result.error || '批量提取失败');
        return;
      }
      setEnrollMessage(
        `提取完成：总计 ${result.data.totalCount}，成功 ${result.data.successCount}，失败 ${result.data.failCount}，模型 ${result.data.modelVer}`
      );
      await loadData();
    } catch (e: any) {
      setError(e?.message || '批量提取失败');
    } finally {
      setRunningEnroll(false);
    }
  };

  const handleVerifyBatch = async () => {
    const normalizedThreshold = Number(threshold);
    const normalizedMaxStudents = Math.min(200, Math.max(1, Number(maxStudents) || 1));
    if (!Number.isFinite(normalizedThreshold) || normalizedThreshold < 0 || normalizedThreshold > 1) {
      setError('阈值必须在 0 到 1 之间。');
      return;
    }
    if (modelStatus && !modelStatus.available) {
      setError('当前模型不可用，请先点击“检测模型可用性”并确认模型可访问。');
      return;
    }

    let probes: Array<{ studentId: number; vector: number[] }> = [];
    try {
      const parsed = JSON.parse(probeInput || '[]');
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setError('批量验证需要探针向量 probes，请在输入框中提供 JSON 数组。');
        return;
      }
      probes = parsed
        .map((item: any) => ({
          studentId: Number(item?.studentId),
          vector: Array.isArray(item?.vector) ? item.vector.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)) : []
        }))
        .filter((item: { studentId: number; vector: number[] }) => Number.isFinite(item.studentId) && item.studentId > 0 && item.vector.length === 128);
      if (!probes.length) {
        setError('probes 格式不正确：每项必须包含 studentId 和 128 维 vector。');
        return;
      }
    } catch {
      setError('probes JSON 解析失败，请检查格式。');
      return;
    }

    setRunningVerify(true);
    setError(null);
    setVerifyResult(null);
    try {
      const result = await verifyFaceBatch({
        classId: selectedClassId > 0 ? selectedClassId : undefined,
        threshold: normalizedThreshold,
        maxStudents: normalizedMaxStudents,
        probes
      });
      if (!result.success || !result.data) {
        setError(result.error || '批量测试失败');
        return;
      }
      setVerifyResult(result.data);
    } catch (e: any) {
      setError(e?.message || '批量测试失败');
    } finally {
      setRunningVerify(false);
    }
  };

  const handleCheckModel = async () => {
    setCheckingModel(true);
    try {
      const status = await fetchFaceModelStatus();
      setModelStatus(status);
    } finally {
      setCheckingModel(false);
    }
  };

  const sortedTemplates = useMemo(() => {
    const items = [...templates];
    items.sort((a, b) => {
      const aValue = sortConfig.key === 'hasTemplate' ? (a.templateCount > 0 ? 1 : 0) : ((a as any)[sortConfig.key] ?? 0);
      const bValue = sortConfig.key === 'hasTemplate' ? (b.templateCount > 0 ? 1 : 0) : ((b as any)[sortConfig.key] ?? 0);
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [templates, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const riskStudents = useMemo(
    () => templates.filter(s => s.templateCount === 0 || Number(s.latestQuality || 0) < 0.75),
    [templates]
  );

  const classSummary = useMemo(() => {
    const grouped: Record<string, FaceTemplateSummaryItem[]> = {};
    templates.forEach(item => {
      if (!grouped[item.className]) grouped[item.className] = [];
      grouped[item.className].push(item);
    });
    return Object.entries(grouped).map(([className, list]) => {
      const withTemplate = list.filter(v => v.templateCount > 0);
      const avgQuality = withTemplate.length
        ? withTemplate.reduce((sum, v) => sum + Number(v.latestQuality || 0), 0) / withTemplate.length
        : 0;
      return {
        className,
        studentCount: list.length,
        withTemplateCount: withTemplate.length,
        lowQualityCount: list.filter(v => Number(v.latestQuality || 0) > 0 && Number(v.latestQuality || 0) < 0.75).length,
        avgQuality
      };
    });
  }, [templates]);

  return (
    <motion.div translate="no" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-2">
          <Sparkles className="text-white w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">人脸特征中心</h1>
        <p className="text-slate-500 mt-1 max-w-xl mx-auto">
          用于管理学生人脸特征向量、批量提取模板、批量测试模型效果（默认模型 `mobilefacenet.onnx`）。
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 rounded-2xl shadow-lg"
      >
        <div className="flex items-center gap-3 mb-3">
          <Bot className="w-6 h-6" />
          <h2 className="text-lg font-semibold">人脸特征任务</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <select
            className="bg-white/15 rounded-lg px-3 py-2 text-sm"
            value={selectedClassId}
            onChange={e => setSelectedClassId(Number(e.target.value))}
          >
            <option value={0}>全部班级</option>
            {classrooms.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="bg-white/15 rounded-lg px-3 py-2 text-sm"
            value={modelVer}
            onChange={e => setModelVer(e.target.value)}
            placeholder="模型版本，如 mobilefacenet.onnx"
          />
          <input
            className="bg-white/15 rounded-lg px-3 py-2 text-sm"
            type="number"
            step={0.01}
            min={0}
            max={1}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            placeholder="阈值 0~1"
          />
          <input
            className="bg-white/15 rounded-lg px-3 py-2 text-sm"
            type="number"
            min={1}
            max={200}
            value={maxStudents}
            onChange={e => setMaxStudents(Number(e.target.value))}
            placeholder="最大批量人数"
          />
        </div>
        <textarea
          className="w-full bg-white/15 rounded-lg px-3 py-2 text-sm mb-4 min-h-[90px]"
          value={probeInput}
          onChange={e => setProbeInput(e.target.value)}
          placeholder='批量验证 probes(JSON)，例如: [{"studentId":1,"vector":[0.01,...共128维]}]'
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleEnrollBatch}
            disabled={runningEnroll || loading}
            className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
          >
            {runningEnroll ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {runningEnroll ? '提取中...' : '批量提取向量'}
          </button>
          <button
            onClick={handleVerifyBatch}
            disabled={runningVerify || loading}
            className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
          >
            {runningVerify ? <Loader2 className="animate-spin w-4 h-4" /> : <Bot className="w-4 h-4" />}
            {runningVerify ? '测试中...' : '批量验证模型'}
          </button>
          <button
            onClick={handleCheckModel}
            disabled={checkingModel || loading}
            className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
          >
            {checkingModel ? <Loader2 className="animate-spin w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
            {checkingModel ? '检测中...' : '检测ONNX模型可用性'}
          </button>
          {enrollMessage && <span className="text-sm bg-white/15 px-3 py-2 rounded-lg">{enrollMessage}</span>}
        </div>

        {verifyResult && (
          <div className="mt-4 text-sm bg-white/15 p-3 rounded-lg">
            测试结果：总计 {verifyResult.totalCount}，通过 {verifyResult.successCount}，失败 {verifyResult.failCount}，平均分 {verifyResult.avgScore}
          </div>
        )}

        {modelStatus && (
          <div className="mt-3 text-sm bg-white/15 p-3 rounded-lg">
            模型状态：{modelStatus.available ? '可用' : '不可用'} | 路径 {modelStatus.modelPath} | HTTP {modelStatus.status}
            {modelStatus.source ? ` | 来源 ${modelStatus.source}` : ''}
            {modelStatus.message ? ` | 信息 ${modelStatus.message}` : ''}
          </div>
        )}

        {error && <div className="bg-red-800/50 p-3 rounded-lg text-sm mt-4">{error}</div>}
      </motion.div>

      <AnimatePresence>
        {riskStudents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="text-red-500" />
              风险样本 ({riskStudents.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {riskStudents.slice(0, 3).map(student => (
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
                  <div className="text-sm text-slate-600 mt-2">模板数 {student.templateCount}</div>
                  <div className="text-sm text-slate-600">质量 {Number(student.latestQuality || 0).toFixed(3)}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">人脸特征向量总览</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button onClick={() => setViewMode('student')} className={`px-3 py-1 rounded-md text-sm font-medium ${viewMode === 'student' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <Users size={16} className="inline mr-1" />
              学生视图
            </button>
            <button onClick={() => setViewMode('class')} className={`px-3 py-1 rounded-md text-sm font-medium ${viewMode === 'class' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <List size={16} className="inline mr-1" />
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
        ) : viewMode === 'student' ? (
          <StudentDetailView analysis={sortedTemplates} requestSort={requestSort} />
        ) : (
          <ClassSummaryView analysis={classSummary} />
        )}
      </div>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </motion.div>
  );
};

export default AiInsightsPage;

const StudentDetailView: React.FC<{
  analysis: FaceTemplateSummaryItem[];
  requestSort: (key: SortKey) => void;
}> = ({ analysis, requestSort }) => (
  <div className="overflow-x-auto max-h-[500px]">
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
        <tr>
          <th className="px-6 py-4 font-semibold cursor-pointer" onClick={() => requestSort('studentName')}>学生</th>
          <th className="px-6 py-4 font-semibold">学号</th>
          <th className="px-6 py-4 font-semibold">班级</th>
          <th className="px-6 py-4 font-semibold cursor-pointer" onClick={() => requestSort('templateCount')}>模板数</th>
          <th className="px-6 py-4 font-semibold cursor-pointer" onClick={() => requestSort('latestQuality')}>最新质量</th>
          <th className="px-6 py-4 font-semibold">模型版本</th>
          <th className="px-6 py-4 font-semibold">最近更新时间</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        <AnimatePresence>
          {analysis.map(student => (
            <motion.tr key={student.studentId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <td className="px-6 py-4">{student.studentName}</td>
              <td className="px-6 py-4">{student.studentSid}</td>
              <td className="px-6 py-4">{student.className}</td>
              <td className="px-6 py-4 text-center">{student.templateCount}</td>
              <td className="px-6 py-4">{Number(student.latestQuality || 0).toFixed(3)}</td>
              <td className="px-6 py-4">{student.modelVer || '-'}</td>
              <td className="px-6 py-4">{student.lastUpdatedAt || '-'}</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  </div>
);

const ClassSummaryView: React.FC<{
  analysis: Array<{
    className: string;
    studentCount: number;
    withTemplateCount: number;
    lowQualityCount: number;
    avgQuality: number;
  }>;
}> = ({ analysis }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-slate-500">
        <tr>
          <th className="px-6 py-4 font-semibold">班级</th>
          <th className="px-6 py-4 font-semibold">总人数</th>
          <th className="px-6 py-4 font-semibold">已建模</th>
          <th className="px-6 py-4 font-semibold">低质量模板</th>
          <th className="px-6 py-4 font-semibold">平均质量</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        <AnimatePresence>
          {analysis.map(row => (
            <motion.tr key={row.className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <td className="px-6 py-4 font-medium text-blue-700">{row.className}</td>
              <td className="px-6 py-4">{row.studentCount}</td>
              <td className="px-6 py-4">{row.withTemplateCount}</td>
              <td className="px-6 py-4 text-red-600">{row.lowQualityCount}</td>
              <td className="px-6 py-4">{row.avgQuality.toFixed(3)}</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  </div>
);

const HelpModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal open={isOpen} onClose={onClose} title="人脸向量中心 - 常见问题">
    <div className="space-y-4 text-sm text-slate-600">
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">1. 批量提取后模板数仍是 0</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>先确认所选班级下有学生数据。</li>
          <li>确认学生已上传头像（`Student.avatarUri`）；系统默认按头像提取向量。</li>
          <li>若头像缺失或读取失败，后端会返回 `AVATAR_NOT_SET/AVATAR_READ_FAILED`。</li>
          <li>检查后端 `/api/face/jobs/enroll-batch` 是否返回成功。</li>
          <li>点击按钮后等待刷新完成再查看列表。</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">2. 批量测试失败率高</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>确认 probes 已按 JSON 数组提供，且每个 `vector` 为 128 维。</li>
          <li>未提供探针向量时，后端会返回 `MISSING_PROBE_VECTOR`。</li>
          <li>先检查模板质量分布，建议质量低于 0.75 的先重提取。</li>
          <li>适当降低阈值（例如从 0.8 调到 0.75）观察变化。</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">3. 这页与签到任务关系</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>签到发布仍走 `CheckinTask`，并通过 `faceRequired/faceMinScore` 控制人脸校验。</li>
          <li>本页只负责模板管理与模型测试，不改变签到发布入口。</li>
        </ul>
      </div>
    </div>
  </Modal>
);

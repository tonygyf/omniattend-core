import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { fetchClassrooms, fetchFaceTemplateSummary, enrollFaceBatch, fetchFaceModelStatus, fetchFaceInferenceConfig, saveFaceInferenceConfig, clearFaceEmbeddings } from '../services/dataService';
import { Classroom, FaceTemplateSummaryItem, FaceModelStatus, FaceInferenceServiceConfig } from '../types';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertTriangle, Sparkles, Bot, HelpCircle, List, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

type SortKey = keyof FaceTemplateSummaryItem | 'hasTemplate';

const HERO_METEORS = [
  { top: "-10%", left: "60%", delay: 0.1, duration: 2.2 },
  { top: "-20%", left: "30%", delay: 1.2, duration: 1.8 },
  { top: "5%", left: "90%", delay: 0.8, duration: 2.0 },
  { top: "-5%", left: "110%", delay: 2.5, duration: 2.5 },
  { top: "20%", left: "130%", delay: 0.4, duration: 2.2 },
  { top: "-15%", left: "80%", delay: 1.8, duration: 1.9 },
];
const HERO_STARS = [
  { top: "16%", left: "12%", delay: 0.0 },
  { top: "22%", left: "78%", delay: 0.6 },
  { top: "36%", left: "28%", delay: 1.2 },
  { top: "48%", left: "64%", delay: 0.9 },
  { top: "62%", left: "18%", delay: 0.3 },
  { top: "74%", left: "82%", delay: 1.5 },
];

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
  const [availableModels, setAvailableModels] = useState<string[]>(['mobilefacenet.onnx']);
  const [maxStudents, setMaxStudents] = useState(50);
  const [runningEnroll, setRunningEnroll] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<FaceModelStatus | null>(null);
  const [checkingModel, setCheckingModel] = useState(false);
  const [inferenceConfig, setInferenceConfig] = useState<FaceInferenceServiceConfig | null>(null);
  const [configBaseUrl, setConfigBaseUrl] = useState('https://gyf111-mobilefacenet-server.hf.space');
  const [configModelVer, setConfigModelVer] = useState('mobilefacenet.onnx');
  const [configTimeoutMs, setConfigTimeoutMs] = useState(15000);
  const [configApiToken, setConfigApiToken] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(true);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  const lastScrollYRef = useRef(0);

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

  const syncAvailableModels = useCallback((status: FaceModelStatus | null, fallbackModel?: string) => {
    const options = new Set<string>();
    (status?.modelList || []).forEach((name) => {
      const normalized = String(name || '').trim();
      if (normalized) options.add(normalized);
    });
    const statusModel = String(status?.modelVer || '').trim();
    if (statusModel) options.add(statusModel);
    const fallback = String(fallbackModel || '').trim();
    if (fallback) options.add(fallback);
    if (!options.size) options.add('mobilefacenet.onnx');
    const next = Array.from(options);
    setAvailableModels(next);
    setModelVer((prev) => {
      const normalizedPrev = prev.trim();
      return normalizedPrev || next[0];
    });
  }, []);

  useEffect(() => {
    if (auth.user?.id) {
      loadData();
      void (async () => {
        const [cfg, status] = await Promise.all([fetchFaceInferenceConfig(), fetchFaceModelStatus()]);
        if (cfg) {
          setInferenceConfig(cfg);
          setConfigBaseUrl(cfg.baseUrl || 'https://gyf111-mobilefacenet-server.hf.space');
          setConfigModelVer(cfg.modelVer || 'mobilefacenet.onnx');
          setConfigTimeoutMs(Number(cfg.timeoutMs || 15000));
        }
        setModelStatus(status);
        syncAvailableModels(status, cfg?.modelVer || 'mobilefacenet.onnx');
      })();
    }
  }, [auth.user?.id, loadData, syncAvailableModels]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scrollContainer = document.getElementById('main-scroll-container');
    if (!scrollContainer) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = scrollContainer.scrollTop || 0;
        const delta = currentY - lastScrollYRef.current;

        if (currentY < 28) {
          setIsHeroCollapsed(false);
        } else if (delta > 4 && currentY > 90) {
          setIsHeroCollapsed(true);
        } else if (delta < -6) {
          setIsHeroCollapsed(false);
        }

        lastScrollYRef.current = currentY;
        ticking = false;
      });
    };

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, []);

  const handleEnrollBatch = async () => {
    const normalizedModelVer = modelVer.trim();
    const normalizedMaxStudents = Math.min(100, Math.max(1, Number(maxStudents) || 1));
    if (selectedClassId <= 0) {
      setError('请先选择班级，再执行批量提取。');
      return;
    }
    if (!normalizedModelVer) {
      setError('模型版本不能为空。');
      return;
    }
    if (modelStatus && !modelStatus.available) {
      setError('当前模型不可用，请先点击"检测模型可用性"并确认模型可访问。');
      return;
    }
    setRunningEnroll(true);
    setError(null);
    setEnrollMessage(null);
    try {
      const result = await enrollFaceBatch({
        classId: selectedClassId,
        modelVer: normalizedModelVer,
        maxStudents: normalizedMaxStudents
      });
      if (!result.success || !result.data) {
        setError(result.error || '批量提取失败');
        return;
      }
      setEnrollMessage(
        `提取完成（班级ID ${selectedClassId}）：总计 ${result.data.totalCount}，成功 ${result.data.successCount}，失败 ${result.data.failCount}，模型 ${result.data.modelVer}`
      );
      await loadData();
    } catch (e: any) {
      setError(e?.message || '批量提取失败');
    } finally {
      setRunningEnroll(false);
    }
  };

  const handleCheckModel = async () => {
    setCheckingModel(true);
    try {
      const status = await fetchFaceModelStatus();
      setModelStatus(status);
      syncAvailableModels(status, configModelVer);
      if (!status) {
        toast.error('模型状态获取失败，请稍后重试。');
      } else if (!status.available) {
        toast.error(`模型不可用：${status.message || `HTTP ${status.status || 0}`}`);
      }
    } finally {
      setCheckingModel(false);
    }
  };

  const handleClearClassFaceData = async () => {
    if (selectedClassId <= 0) {
      toast.error('请先选择要清空数据的班级。');
      return;
    }
    if (!window.confirm('确定要清空该班级所有人脸特征向量吗？操作不可逆。')) {
      return;
    }
    try {
      const result = await clearFaceEmbeddings({ classId: selectedClassId });
      if (result.success) {
        toast.success('已清空该班级人脸特征');
        await loadData();
      } else {
        toast.error(result.error || '清空失败');
      }
    } catch (e: any) {
      toast.error(e.message || '网络错误');
    }
  };

  const handleClearStudentFaceData = async (studentId: number) => {
    if (!window.confirm('确定要清空该学生的人脸特征向量吗？')) {
      return;
    }
    try {
      const result = await clearFaceEmbeddings({ studentId });
      if (result.success) {
        toast.success('已清空该学生人脸特征');
        await loadData();
      } else {
        toast.error(result.error || '清空失败');
      }
    } catch (e: any) {
      toast.error(e.message || '网络错误');
    }
  };

  // ✅ 修复：补回缺失的函数声明头
  const handleSaveInferenceConfig = async () => {
    const baseUrl = configBaseUrl.trim().replace(/\/+$/, '');
    const model = configModelVer.trim() || 'mobilefacenet.onnx';
    const timeout = Math.min(60000, Math.max(1000, Number(configTimeoutMs) || 15000));
    if (!/^https?:\/\//i.test(baseUrl)) {
      setError('推理服务地址必须是 http/https。');
      return;
    }
    setSavingConfig(true);
    setError(null);
    try {
      const result = await saveFaceInferenceConfig({
        baseUrl,
        modelVer: model,
        timeoutMs: timeout,
        apiToken: configApiToken
      });
      if (!result.success || !result.data) {
        setError(result.error || '保存推理配置失败');
        return;
      }
      setInferenceConfig(result.data);
      setConfigApiToken('');
      setModelVer(model);
      const status = await fetchFaceModelStatus();
      setModelStatus(status);
      syncAvailableModels(status, model);
    } finally {
      setSavingConfig(false);
    }
  };

  const modelOptions = useMemo(() => {
    const merged = new Set<string>();
    availableModels.forEach((name) => {
      const normalized = String(name || '').trim();
      if (normalized) merged.add(normalized);
    });
    const current = modelVer.trim();
    if (current) merged.add(current);
    if (!merged.size) merged.add('mobilefacenet.onnx');
    return Array.from(merged);
  }, [availableModels, modelVer]);

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
    <motion.div translate="no" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 lg:space-y-7">
      <motion.section
        animate={{ height: isHeroCollapsed ? 52 : 'auto' }}
        className="relative w-full overflow-hidden shrink-0 bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 rounded-2xl shadow-lg mb-6 pb-2"
      >
        {/* Background Animation Layer */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.1),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.15),transparent_50%)]" />
          {HERO_STARS.map((star, idx) => (
            <motion.span
              key={`star-${idx}`}
              className="absolute rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              style={{ top: star.top, left: star.left, width: 2 + (idx % 3), height: 2 + (idx % 3) }}
              animate={{ opacity: [0.1, 0.9, 0.1] }}
              transition={{ duration: 1.5 + (idx % 3), delay: star.delay, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
          {HERO_METEORS.map((meteor, idx) => (
            <motion.span
              key={`meteor-${idx}`}
              className="absolute h-[2px] rounded-full bg-gradient-to-l from-transparent via-white/80 to-white shadow-[0_0_12px_rgba(255,255,255,1)]"
              style={{ 
                top: meteor.top, 
                left: meteor.left, 
                width: 250 + (idx * 40)
              }}
              initial={{ x: 0, y: 0, opacity: 0, rotate: -45 }}
              animate={{ x: -1500, y: 1500, opacity: [0, 1, 1, 0], rotate: -45 }}
              transition={{ duration: meteor.duration, delay: meteor.delay, repeat: Infinity, ease: "linear" }}
            />
          ))}
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {!isHeroCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="relative z-10 px-6 pt-8 pb-10 text-white flex flex-col"
            >
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1">
                  <div className="inline-flex items-center justify-center p-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl shadow-lg mb-3">
                    <Sparkles className="text-white w-6 h-6" />
                  </div>
                  <div className="text-xs font-bold tracking-widest text-cyan-100 mb-2">
                    FACE VECTOR WORKSPACE
                  </div>
                  <h1 className="text-3xl font-extrabold tracking-tight mb-3 drop-shadow-md">
                    人脸特征中心
                  </h1>
                  <p className="text-sm text-blue-50 max-w-lg leading-relaxed mb-6">
                    用于管理学生人脸特征向量，提供班级维度批量提取、服务可用性检测与推理中心配置。
                  </p>
                </div>

                <div className="w-full md:w-[500px] bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-5 shadow-inner">
                  <div className="flex items-center gap-2 mb-4">
                    <Bot className="w-5 h-5 text-white" />
                    <h2 className="text-base font-bold tracking-wide">特征提取任务</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <select
                      className="bg-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30 [&>option]:text-slate-800"
                      value={selectedClassId}
                      onChange={e => setSelectedClassId(Number(e.target.value))}
                    >
                      <option value={0}>请选择班级</option>
                      {classrooms.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {modelOptions.length > 0 ? (
                      <select
                        className="bg-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30 [&>option]:text-slate-800"
                        value={modelVer}
                        onChange={e => setModelVer(e.target.value)}
                      >
                        {modelOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="bg-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                        value={modelVer}
                        onChange={e => setModelVer(e.target.value)}
                        placeholder="模型版本"
                      />
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <button
                      onClick={handleEnrollBatch}
                      disabled={runningEnroll || loading}
                      className="flex-1 flex items-center justify-center gap-2 bg-white/20 px-4 py-2 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      {runningEnroll ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                      {runningEnroll ? '提取中...' : '批量提取向量'}
                    </button>
                    <button
                      onClick={handleCheckModel}
                      disabled={checkingModel || loading}
                      className="flex-1 flex items-center justify-center gap-2 bg-white/20 px-4 py-2 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      {checkingModel ? <Loader2 className="animate-spin w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
                      {checkingModel ? '检测中...' : '检测推理中心'}
                    </button>
                  </div>
                  
                  {selectedClassId > 0 && (
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <button
                        onClick={handleClearClassFaceData}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-500/20 text-red-100 px-4 py-2 rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50 text-sm font-medium"
                      >
                        清空该班级特征向量
                      </button>
                    </div>
                  )}

                  {enrollMessage && <div className="text-xs bg-white/15 px-3 py-2 rounded-lg mb-4">{enrollMessage}</div>}

                  <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-white/10 transition-colors"
                      onClick={() => setIsConfigCollapsed(prev => !prev)}
                    >
                      <span>高级配置</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isConfigCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                    <AnimatePresence>
                      {!isConfigCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-3 pb-3"
                        >
                          <div className="space-y-2 mt-2">
                            <input
                              className="w-full bg-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                              value={configBaseUrl}
                              onChange={e => setConfigBaseUrl(e.target.value)}
                              placeholder="推理服务地址"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                className="bg-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                                value={configModelVer}
                                onChange={e => setConfigModelVer(e.target.value)}
                                placeholder="默认模型版本"
                              />
                              <input
                                className="bg-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                                type="number"
                                min={1000}
                                max={60000}
                                value={configTimeoutMs}
                                onChange={e => setConfigTimeoutMs(Number(e.target.value))}
                                placeholder="超时毫秒"
                              />
                            </div>
                            <input
                              className="w-full bg-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                              value={configApiToken}
                              onChange={e => setConfigApiToken(e.target.value)}
                              placeholder="API Key（留空则不改）"
                              type="password"
                            />
                            <button
                              onClick={handleSaveInferenceConfig}
                              disabled={savingConfig || loading}
                              className="w-full bg-white/20 px-4 py-1.5 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 text-xs font-medium"
                            >
                              {savingConfig ? '保存中...' : '保存配置'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {error && <div className="bg-red-500/80 backdrop-blur-sm p-3 rounded-lg text-sm mt-4 border border-red-400">{error}</div>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed Content */}
        <AnimatePresence>
          {isHeroCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none pb-3"
            >
              <span className="text-white font-bold tracking-widest text-sm flex items-center gap-2 drop-shadow-md">
                <Sparkles size={16} className="text-cyan-200" /> 人脸特征中心
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Button */}
        <div className={`absolute left-0 right-0 z-20 flex justify-center pointer-events-none ${isHeroCollapsed ? 'bottom-0' : 'bottom-1'}`}>
          <button
            onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
            className={`pointer-events-auto transition-colors bg-transparent flex items-center justify-center ${
              isHeroCollapsed 
                ? 'text-white/80 hover:text-white pb-1 pt-2 px-8' 
                : 'p-1 text-white/50 hover:text-white rounded-full'
            }`}
          >
            {isHeroCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={18} />}
          </button>
        </div>
      </motion.section>

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
          <StudentDetailView analysis={sortedTemplates} requestSort={requestSort} onClearStudent={handleClearStudentFaceData} />
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
  onClearStudent: (studentId: number) => void;
}> = ({ analysis, requestSort, onClearStudent }) => (
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
          <th className="px-6 py-4 font-semibold text-right">操作</th>
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
              <td className="px-6 py-4 text-right">
                {student.templateCount > 0 && (
                  <button
                    onClick={() => onClearStudent(student.studentId)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors text-xs"
                  >
                    清空
                  </button>
                )}
              </td>
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
          <li>确认学生已上传头像（Student.avatarUri）；系统默认按头像提取向量。</li>
          <li>若头像缺失或读取失败，后端会返回 AVATAR_NOT_SET/AVATAR_READ_FAILED。</li>
          <li>检查后端 /api/face/jobs/enroll-batch 是否返回成功。</li>
          <li>点击按钮后等待刷新完成再查看列表。</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">2. 推理服务检测失败</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>先点击"检测HuggingFace服务可用性"确认外部推理中心在线。</li>
          <li>检查推理中心配置中的地址、模型版本与超时参数。</li>
          <li>若配置了 API Key，请确认密钥可用且权限正确。</li>
          <li>服务恢复后重新发起班级批量提取。</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 mb-1">3. 这页与签到任务关系</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>签到发布仍走 CheckinTask，并通过 faceRequired/faceMinScore 控制人脸校验。</li>
          <li>本页只负责模板管理与模型测试，不改变签到发布入口。</li>
        </ul>
      </div>
    </div>
  </Modal>
);

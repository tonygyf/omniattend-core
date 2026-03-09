import React, { useEffect, useState } from 'react';
import { fetchRecentAttendance, fetchCheckinTasks, createCheckinTask, closeCheckinTask, submitCheckin } from '../services/dataService';
import { AttendanceRecord, AttendanceStatus, CheckinTask, CheckinTaskStatus } from '../types';
import { CheckCircle2, Clock, XCircle, AlertCircle, Plus, Settings, MapPin, Hand, Key, Users, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

const AttendancePage: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinTasks, setCheckinTasks] = useState<CheckinTask[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [attendanceData, tasksData] = await Promise.all([
        fetchRecentAttendance(),
        fetchCheckinTasks(undefined, 'ACTIVE')
      ]);
      
      setRecords(attendanceData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setCheckinTasks(tasksData);
      setLoading(false);
    };
    load();
  }, []);

  const getStatusBadge = (status: AttendanceStatus) => {
    switch (status) {
      case AttendanceStatus.PRESENT:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200"><CheckCircle2 size={14}/> 到勤</span>;
      case AttendanceStatus.LATE:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200"><Clock size={14}/> 迟到</span>;
      case AttendanceStatus.ABSENT:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200"><XCircle size={14}/> 缺勤</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"><AlertCircle size={14}/> {status}</span>;
    }
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/\//g, '-');
  };

  const getTaskStatusBadge = (status: CheckinTaskStatus) => {
    switch (status) {
      case CheckinTaskStatus.ACTIVE:
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200"><CheckCircle2 size={12}/> 进行中</span>;
      case CheckinTaskStatus.DRAFT:
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200"><Clock size={12}/> 草稿</span>;
      case CheckinTaskStatus.CLOSED:
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"><XCircle size={12}/> 已关闭</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"><AlertCircle size={12}/> {status}</span>;
    }
  };

  const handleCreateTask = async (taskData: any) => {
    setCreating(true);
    const result = await createCheckinTask(taskData);
    
    if (result.success) {
      toast.success('签到任务创建成功！');
      setShowCreateModal(false);
      // 刷新任务列表
      const tasks = await fetchCheckinTasks(undefined, 'ACTIVE');
      setCheckinTasks(tasks);
    } else {
      toast.error(result.error || '创建失败');
    }
    setCreating(false);
  };

  const handleCloseTask = async (taskId: number) => {
    const result = await closeCheckinTask(taskId);
    if (result.success) {
      toast.success('任务已关闭');
      const tasks = await fetchCheckinTasks(undefined, 'ACTIVE');
      setCheckinTasks(tasks);
    } else {
      toast.error(result.error || '关闭失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题和创建按钮 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">考勤管理</h1>
          <p className="text-slate-500">发布签到任务，管理学生考勤记录。</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={16} />
          发布签到任务
        </button>
      </div>

      {/* 活动签到任务 */}
      {checkinTasks.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5" /> 活动中的签到任务
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {checkinTasks.map((task) => (
              <div key={task.id} className="p-6 hover:bg-slate-50/50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-slate-900">{task.title}</h3>
                      {getTaskStatusBadge(task.status)}
                    </div>
                    <div className="text-sm text-slate-600 space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock size={14} />
                        {new Date(task.startAt).toLocaleString('zh-CN')} - {new Date(task.endAt).toLocaleString('zh-CN')}
                      </div>
                      {task.locationLat && task.locationLng && (
                        <div className="flex items-center gap-2">
                          <MapPin size={14} />
                          位置签到 (半径: {task.locationRadiusM}m)
                        </div>
                      )}
                      {task.gestureSequence && (
                        <div className="flex items-center gap-2">
                          <Hand size={14} />
                          手势序列: {task.gestureSequence}
                        </div>
                      )}
                      {task.passwordPlain && (
                        <div className="flex items-center gap-2">
                          <Key size={14} />
                          密码签到
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 rounded-lg transition-colors flex items-center gap-1">
                      <Eye size={14} />
                      查看详情
                    </button>
                    <button
                      onClick={() => handleCloseTask(task.id)}
                      className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 border border-red-200 hover:border-red-300 rounded-lg transition-colors"
                    >
                      关闭任务
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 考勤日志 */}

      {showCreateModal && (
        <CreateTaskModal 
          onClose={() => setShowCreateModal(false)} 
          onCreate={handleCreateTask}
          loading={creating}
        />
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">姓名</th>
                <th className="px-6 py-4 font-semibold">时间</th>
                <th className="px-6 py-4 font-semibold">状态</th>
                <th className="px-6 py-4 font-semibold">置信度</th>
                <th className="px-6 py-4 font-semibold text-right">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">正在加载记录...</td></tr>
              ) : records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{record.userName}</td>
                  <td className="px-6 py-4 text-slate-600 font-mono">{formatDate(record.timestamp)}</td>
                  <td className="px-6 py-4">{getStatusBadge(record.status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${record.confidenceScore > 0.9 ? 'bg-green-500' : 'bg-amber-500'}`} 
                          style={{ width: `${record.confidenceScore * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{(record.confidenceScore * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:text-blue-800 font-medium text-xs">查看照片</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const CreateTaskModal: React.FC<{ onClose: () => void; onCreate: (taskData: any) => void; loading: boolean }> = ({ onClose, onCreate, loading }) => {
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('1'); // Default to class 1

  const handleSubmit = () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins from now
    
    onCreate({
      title,
      classId: parseInt(classId),
      teacherId: 1, // Mock teacherId
      startAt: now.toISOString(),
      endAt: end.toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold">发布新签到</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">任务标题</label>
            <input 
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="例如：第五周-软件工程-课前签到"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">目标班级</label>
            <select 
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="1">软件工程2021级</option>
              <option value="2">计算机科学2022级</option>
            </select>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">取消</button>
          <button onClick={handleSubmit} disabled={!title || loading} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            {loading ? '发布中...' : '立即发布'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendancePage;

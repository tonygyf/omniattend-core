import React, { useEffect, useState, useContext } from 'react';
import {
  fetchRecentAttendance,
  fetchCheckinTasks,
  createCheckinTask,
  closeCheckinTask,
  fetchCheckinTaskDetails,
  fetchReviewQueue,
  reviewSubmission,
  fetchClassrooms
} from '../services/dataService';
import { useAuth } from '../context/AuthContext';
import {
  AttendanceRecord,
  AttendanceStatus,
  CheckinTask,
  CheckinTaskStatus,
  CreateCheckinTaskRequest,
  CheckinTaskDetails,
  CheckinSubmission,
  CurrentUserStatus,
  CurrentUser,
  Classroom
} from '../types';
import { CheckCircle2, Clock, XCircle, AlertCircle, Plus, MapPin, Hand, Key, Users, Eye, EyeOff, X, Loader2, UserCheck, UserX, ShieldQuestion } from 'lucide-react';
import toast from 'react-hot-toast';

// Main Page Component
const AttendancePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activeTasks, setActiveTasks] = useState<CheckinTask[]>([]);
  const [closedTasks, setClosedTasks] = useState<CheckinTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<CheckinTask | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const auth = useAuth();

  const loadData = async () => {
    if (!auth?.user?.id) return;
    setLoading(true);
    try {
      const allTasks = await fetchCheckinTasks(); // Fetch all tasks
      setActiveTasks(allTasks.filter(t => t.status === 'ACTIVE'));
      setClosedTasks(allTasks.filter(t => t.status === 'CLOSED'));
    } catch (error) {
      console.error("Failed to load tasks:", error);
      toast.error("加载任务列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [auth.user]);

  const handleTaskCreated = () => {
    setShowCreateModal(false);
    toast.success('签到任务已成功发布！');
    loadData(); // Refresh list
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">考勤与签到</h1>
          <p className="text-slate-500 mt-1">发布新的签到任务，或查看和审核进行中的任务。</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm hover:shadow-md"
        >
          <Plus size={18} />
          <span className="font-medium">发布新签到</span>
        </button>
      </div>

      {/* Active Tasks */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-500" /> 进行中的任务
          </h2>
        </div>
        {loading ? <div className="p-6 text-center text-slate-500">加载中...</div> : 
          activeTasks.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {activeTasks.map((task) => (
                <TaskItem key={task.id} task={task} onSelect={() => setSelectedTask(task)} onClose={loadData}/>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-slate-500">
              <p>当前没有进行中的签到任务。</p>
            </div>
          )
        }
      </div>

      {/* Closed Tasks */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-3">
            <XCircle className="w-6 h-6 text-slate-400" /> 已结束的任务
          </h2>
        </div>
        {loading ? <div className="p-6 text-center text-slate-500">加载中...</div> : 
          closedTasks.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {closedTasks.map((task) => (
                <TaskItem key={task.id} task={task} onSelect={() => setSelectedTask(task)} onClose={loadData}/>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-slate-500">
              <p>没有已结束的签到任务。</p>
            </div>
          )
        }
      </div>
      
      {/* Modals */}
      {showCreateModal && (
        <CreateTaskModal 
          onClose={() => setShowCreateModal(false)} 
          onCreated={handleTaskCreated}
        />
      )}
      {selectedTask && (
        <ActiveTaskDetails task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}

    </div>
  );
};

// Single Task Item in the list
const TaskItem: React.FC<{ task: CheckinTask; onSelect: () => void; onClose: () => void }> = ({ task, onSelect, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定要关闭任务 "${task.title}" 吗？`)) {
        setIsClosing(true);
        const result = await closeCheckinTask(task.id);
        if (result.success) {
            toast.success('任务已关闭');
            onClose();
        } else {
            toast.error(result.error || '关闭失败');
        }
        setIsClosing(false);
    }
  }

  return (
    <div className="p-6 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={onSelect}>
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg text-slate-900">{task.title}</h3>
            {task.status === 'ACTIVE' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200"><CheckCircle2 size={12}/> 进行中</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"><XCircle size={12}/> 已结束</span>
            )}
          </div>
          <div className="text-sm text-slate-600 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2"><Clock size={14} /><span>{new Date(task.startAt).toLocaleString('zh-CN')} - {new Date(task.endAt).toLocaleString('zh-CN')}</span></div>
              {task.locationLat != null && task.locationLng != null && <div className="flex items-center gap-1.5"><MapPin size={14} /><span>位置</span></div>}
              {task.gestureSequence && <div className="flex items-center gap-1.5"><Hand size={14} /><span>手势</span></div>}
              {task.passwordPlain && <div className="flex items-center gap-1.5"><Key size={14} /><span>口令</span></div>}
              {task.faceRequired ? <div className="flex items-center gap-1.5"><ShieldQuestion size={14} /><span>人脸</span></div> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="px-4 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5">
            <Eye size={14} />
            查看详情
          </button>
          {task.status === 'ACTIVE' && (
            <button onClick={handleClose} disabled={isClosing} className="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50">
              {isClosing ? <Loader2 size={14} className="animate-spin"/> : <XCircle size={14}/>}
              关闭任务
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Modal for creating a new task
import MapPicker from '../components/MapPicker';
import GesturePad from '../components/GesturePad';

const CreateTaskModal: React.FC<{ onClose: () => void; onCreated: () => void; }> = ({ onClose, onCreated }) => {
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(true);
  const [task, setTask] = useState<Partial<CreateCheckinTaskRequest>>({
    title: '',
    status: CheckinTaskStatus.ACTIVE,
  });
  const [constraints, setConstraints] = useState({ location: false, gesture: false, password: false, face: false });
  const [time, setTime] = useState({ start: new Date(), end: new Date(Date.now() + 30 * 60 * 1000) });
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const [selectedAddress, setSelectedAddress] = useState('尚未选择位置');

  useEffect(() => {
    const loadClassrooms = async () => {
      setClassroomsLoading(true);
      const classroomList = await fetchClassrooms();
      setClassrooms(classroomList);
      setTask(prev => {
        if (prev.classId || !classroomList.length) return prev;
        return { ...prev, classId: classroomList[0].id };
      });
      setClassroomsLoading(false);
    };
    loadClassrooms();
  }, []);

  const handleFetchLocation = () => {
      if (!navigator.geolocation) {
          toast.error("您的浏览器不支持地理位置功能。");
          return;
      }
      setIsFetchingLocation(true);
      navigator.geolocation.getCurrentPosition(
          (position) => {
              const location = {
                  lat: parseFloat(position.coords.latitude.toFixed(5)),
                  lng: parseFloat(position.coords.longitude.toFixed(5)),
              };
              setTask({
                  ...task,
                  locationLat: location.lat,
                  locationLng: location.lng,
              });
              if (!task.locationRadiusM) {
                   setTask(prev => ({...prev, locationRadiusM: 100})); // Default radius
              }
              setIsFetchingLocation(false);
              toast.success("已成功获取当前位置并居中地图！");
          },
          (error) => {
              let errorMessage = '获取位置失败，请重试或手动在地图上选点。';
              if (error.code === error.PERMISSION_DENIED) {
                  errorMessage = '您已拒绝位置权限，请在浏览器设置中开启后重试。';
              }
              toast.error(errorMessage);
              setIsFetchingLocation(false);
          },
          { enableHighAccuracy: true }
      );
  };

  const handleSubmit = async () => {
    if (!task.classId) {
      toast.error('请选择目标班级');
      return;
    }
    setLoading(true);
    const finalTask: CreateCheckinTaskRequest = {
        ...task,
        teacherId: auth.user!.id,
        title: task.title || '未命名签到',
        classId: task.classId,
        startAt: time.start.toISOString(),
        endAt: time.end.toISOString(),
        status: CheckinTaskStatus.ACTIVE,
        locationLat: constraints.location ? (task.locationLat || null) : null,
        locationLng: constraints.location ? (task.locationLng || null) : null,
        locationRadiusM: constraints.location ? (task.locationRadiusM || null) : null,
        gestureSequence: constraints.gesture ? (task.gestureSequence || null) : null,
        passwordPlain: constraints.password ? (task.passwordPlain || null) : null,
        faceRequired: constraints.face,
        faceMinScore: constraints.face ? (task.faceMinScore ?? 0.75) : null,
      };

    const result = await createCheckinTask(finalTask);
    if (result.success) {
      onCreated();
    } else {
      toast.error(result.error || '创建失败');
    }
    setLoading(false);
  };
  
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold">发布新签到任务</h2>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">任务标题</label>
              <input type="text" value={task.title} onChange={(e) => setTask({...task, title: e.target.value})} className="w-full input" placeholder="例如：软件工程-课前签到" autoComplete="off"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">目标班级</label>
              <select value={task.classId ?? ''} onChange={(e) => setTask({...task, classId: Number(e.target.value)})} className="w-full input bg-white" disabled={classroomsLoading || classrooms.length === 0}>
                {classroomsLoading && <option value="">加载班级中...</option>}
                {!classroomsLoading && classrooms.length === 0 && <option value="">暂无可用班级</option>}
                {!classroomsLoading && classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Time Window */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
                  <input type="datetime-local" value={time.start.toISOString().substring(0, 16)} onChange={(e) => setTime({...time, start: new Date(e.target.value)})} className="w-full input" />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                  <input type="datetime-local" value={time.end.toISOString().substring(0, 16)} onChange={(e) => setTime({...time, end: new Date(e.target.value)})} className="w-full input" />
              </div>
          </div>
          {/* Constraints */}
          <div className="space-y-4">
            <h3 className="font-medium text-slate-800 border-b pb-2">签到约束 (可选)</h3>
            {/* Location */}
            <div className="p-4 rounded-lg border bg-slate-50/50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={constraints.location} onChange={(e) => setConstraints({...constraints, location: e.target.checked})} className="h-4 w-4 rounded"/>
                <MapPin />
                <span className="font-medium">地理位置签到</span>
              </label>
              {constraints.location && (
                <div className="mt-4 pl-8 space-y-3">
                  <MapPicker 
                    onLocationChange={({ lat, lng, address }) => {
                      setTask({ ...task, locationLat: lat, locationLng: lng });
                      setSelectedAddress(address);
                    }}
                    initialLocation={task.locationLat && task.locationLng ? { lat: task.locationLat, lng: task.locationLng } : undefined}
                  />
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <input type="text" value={selectedAddress} readOnly className="input text-sm text-slate-500 bg-slate-50"/>
                    <input type="number" value={task.locationRadiusM || ''} onChange={e => setTask({...task, locationRadiusM: parseInt(e.target.value)})} placeholder="半径 (米)" className="input" autoComplete="off"/>
                  </div>
                  <button
                      type="button"
                      onClick={handleFetchLocation}
                      disabled={isFetchingLocation}
                      className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1.5"
                  >
                      {isFetchingLocation ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                      {isFetchingLocation ? '获取中...' : '获取浏览器当前位置'}
                  </button>
                </div>
              )}
            </div>
            {/* Gesture */}
            <div className="p-4 rounded-lg border bg-slate-50/50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={constraints.gesture} onChange={(e) => setConstraints({...constraints, gesture: e.target.checked})} className="h-4 w-4 rounded"/>
                <Hand />
                <span className="font-medium">手势序列签到</span>
              </label>
              {constraints.gesture && (
                <div className="mt-4 flex justify-center">
                  <GesturePad 
                    onSequenceChange={(sequence) => {
                      setTask(prev => ({ ...prev, gestureSequence: sequence }));
                    }}
                  />
                </div>
              )}
            </div>
            {/* Password */}
            <div className="p-4 rounded-lg border bg-slate-50/50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={constraints.password} onChange={(e) => setConstraints({...constraints, password: e.target.checked})} className="h-4 w-4 rounded"/>
                <Key />
                <span className="font-medium">口令签到</span>
              </label>
              {constraints.password && (
                <div className="mt-4 pl-8">
                  <input type="text" value={task.passwordPlain || ''} onChange={e => setTask({...task, passwordPlain: e.target.value})} placeholder="输入签到口令, e.g., 芝麻开门" className="input w-full md:w-1/2" autoComplete="off"/>
                </div>
              )}
            </div>
            <div className="p-4 rounded-lg border bg-slate-50/50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={constraints.face} onChange={(e) => setConstraints({...constraints, face: e.target.checked})} className="h-4 w-4 rounded"/>
                <ShieldQuestion />
                <span className="font-medium">人脸识别签到</span>
              </label>
              {constraints.face && (
                <div className="mt-4 pl-8">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={task.faceMinScore ?? 0.75}
                    onChange={e => setTask({...task, faceMinScore: Number(e.target.value)})}
                    placeholder="人脸通过阈值（0~1）"
                    className="input w-full md:w-1/2"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3 border-t">
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium">取消</button>
          <button onClick={handleSubmit} disabled={!task.title || !task.classId || loading} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin"/>}
            {loading ? '发布中...' : '立即发布'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal for viewing active task details
const ActiveTaskDetails: React.FC<{ task: CheckinTask, onClose: () => void }> = ({ task, onClose }) => {
  const [details, setDetails] = useState<CheckinTaskDetails | null>(null);
  const [reviewQueue, setReviewQueue] = useState<CheckinSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedPasswordBySubmission, setRevealedPasswordBySubmission] = useState<Record<number, boolean>>({});
  const [showTaskPassword, setShowTaskPassword] = useState(false);
  const auth = useAuth();

  const loadDetails = async () => {
    setLoading(true);
    const [detailsData, reviewData] = await Promise.all([
        fetchCheckinTaskDetails(task.id),
        fetchReviewQueue(task.id)
    ]);
    setDetails(detailsData);
    setReviewQueue(reviewData);
    setLoading(false);
  };

  useEffect(() => {
    loadDetails();
    const interval = setInterval(loadDetails, 5000); // Auto-refresh every 5 seconds
    return () => clearInterval(interval);
  }, [task.id]);

  const handleReview = async (submissionId: number, action: 'approve' | 'reject', markAsLate?: boolean) => {
    const result = await reviewSubmission(submissionId, { action, reviewerId: auth.user!.id, markAsLate });
    if (result.success) {
      toast.success(`操作成功: 已${action === 'approve' ? '通过' : '驳回'}`);
      loadDetails(); // Refresh immediately
    } else {
      toast.error(result.error || '操作失败');
    }
  }

  const StatCard: React.FC<{icon: React.ReactNode, label: string, value: number | string, color: string}> = ({icon, label, value, color}) => (
    <div className={`bg-white p-4 rounded-lg border flex items-start gap-4 ${color}`}>
        <div className="mt-1">{icon}</div>
        <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
    </div>
  );

  const getStatusIcon = (status: CurrentUserStatus) => {
    switch (status) {
      case CurrentUserStatus.APPROVED:
        return <UserCheck className="w-5 h-5 text-green-500" />;
      case CurrentUserStatus.PENDING_REVIEW:
        return <ShieldQuestion className="w-5 h-5 text-amber-500" />;
      case CurrentUserStatus.REJECTED:
        return <UserX className="w-5 h-5 text-red-500" />;
      case CurrentUserStatus.NOT_SUBMITTED:
        return <AlertCircle className="w-5 h-5 text-slate-400" />;
      default: return null;
    }
  };

  const maskValue = (value?: string) => {
    if (!value) return '--';
    return '•'.repeat(Math.max(6, value.length));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b bg-white rounded-t-2xl flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">{task.title}</h2>
                    <p className="text-sm text-slate-500">实时签到状态与审核</p>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X /></button>
            </div>

            {loading && !details ? <div className="flex-grow flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-500"/></div> :
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
                {/* Left Panel: Summary & Review */}
                <div className="w-full md:w-1/3 border-r flex flex-col bg-white">
                    {/* Summary Stats */}
                    <div className="p-6 space-y-4 border-b">
                        <h3 className="font-semibold text-slate-700">实时统计</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <StatCard icon={<UserCheck size={20}/>} label="已签到" value={details?.summary?.signedIn ?? 0} color="border-green-200"/>
                            <StatCard icon={<ShieldQuestion size={20}/>} label="待审核" value={details?.summary?.pendingReview ?? 0} color="border-amber-200"/>
                            <StatCard icon={<UserX size={20}/>} label="未通过" value={details?.summary?.rejected ?? 0} color="border-red-200"/>
                            <StatCard icon={<AlertCircle size={20}/>} label="未提交" value={details?.summary?.notSubmitted ?? 0} color="border-slate-200"/>
                        </div>
                    </div>
                    <div className="p-6 border-b space-y-3">
                        <h3 className="font-semibold text-slate-700">签到方式</h3>
                        <div className="text-xs text-slate-700 space-y-2">
                            <div className="flex items-center justify-between">
                                <span>地理位置</span>
                                <span>{task.locationLat != null && task.locationLng != null ? `开启 (${task.locationRadiusM || 0}m)` : '关闭'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>人脸识别</span>
                                <span>{task.faceRequired ? `开启 (阈值 ${task.faceMinScore ?? 0.75})` : '关闭'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>手势答案</span>
                                <span>{task.gestureSequence || '未设置'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span>签到密码</span>
                                {task.passwordPlain ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span>{showTaskPassword ? task.passwordPlain : maskValue(task.passwordPlain)}</span>
                                        <button
                                            onClick={() => setShowTaskPassword(!showTaskPassword)}
                                            className="inline-flex items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 p-1"
                                            title={showTaskPassword ? '隐藏密码' : '显示密码'}
                                        >
                                            {showTaskPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                                        </button>
                                    </span>
                                ) : (
                                    <span>未设置</span>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Review Queue */}
                    <div className="p-6 flex-grow overflow-y-auto">
                        <h3 className="font-semibold text-slate-700 mb-4">审核队列 ({reviewQueue.length})</h3>
                        {reviewQueue.length > 0 ? (
                            <div className="space-y-3">
                                {reviewQueue.map(sub => (
                                    <div key={sub.id} className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-sm">{sub.studentName} <span className="text-xs text-slate-500">({sub.studentSid})</span></p>
                                                <p className="text-xs text-amber-700 mt-1">原因: {sub.reason}</p>
                                                {(sub.gestureInput || sub.passwordInput) && (
                                                    <div className="mt-2 space-y-1">
                                                        {sub.gestureInput && (
                                                            <div className="text-xs text-slate-700">手势答案：{sub.gestureInput}</div>
                                                        )}
                                                        {sub.passwordInput && (
                                                            <div className="text-xs text-slate-700 flex items-center gap-2">
                                                                <span>密码答案：{revealedPasswordBySubmission[sub.id] ? sub.passwordInput : maskValue(sub.passwordInput)}</span>
                                                                <button
                                                                    onClick={() => setRevealedPasswordBySubmission(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                                                                    className="inline-flex items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 p-1"
                                                                    title={revealedPasswordBySubmission[sub.id] ? '隐藏密码' : '显示密码'}
                                                                >
                                                                    {revealedPasswordBySubmission[sub.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleReview(sub.id, 'reject')} className="px-2 py-1 text-xs font-medium bg-white border rounded hover:bg-red-50">驳回</button>
                                                <button onClick={() => handleReview(sub.id, 'approve')} className="px-2 py-1 text-xs font-medium bg-white border rounded hover:bg-green-50">通过</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-sm text-slate-500 pt-8">暂无待审核项</div>
                        )}
                    </div>
                </div>
                {/* Right Panel: All Users List */}
                <div className="w-full md:w-2/3 flex-grow overflow-y-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-slate-500 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 font-semibold">学生</th>
                                <th className="px-6 py-3 font-semibold">状态</th>
                                <th className="px-6 py-3 font-semibold">提交时间</th>
                                <th className="px-6 py-3 font-semibold">原因</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {details?.users.map(user => (
                            <tr key={user.studentId}>
                                <td className="px-6 py-4 font-medium text-slate-800">{user.name} <span className="text-slate-500">({user.sid})</span></td>
                                <td className="px-6 py-4"><div className="flex items-center gap-2 font-medium">{getStatusIcon(user.status)} {user.status}</div></td>
                                <td className="px-6 py-4 font-mono text-slate-600">{user.submittedAt ? new Date(user.submittedAt).toLocaleTimeString() : '--'}</td>
                                <td className="px-6 py-4 text-red-600 text-xs">{user.reason}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>}
        </div>
    </div>
  );
};

export default AttendancePage;

// Helper CSS class for inputs
const styles = `
  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1; /* slate-300 */
    border-radius: 0.5rem; /* rounded-lg */
    transition: border-color 0.2s;
  }
  .input:focus {
    outline: none;
    border-color: #4f46e5; /* indigo-600 */
    box-shadow: 0 0 0 1px #4f46e5;
  }
`;
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

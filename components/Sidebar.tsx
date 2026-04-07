import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  BrainCircuit, 
  Settings, 
  LogOut,
  X,
  Loader2
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';
import { getFullImageUrl } from '../services/cdn';
import { updateProfileAvatar } from '../services/authService';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isOpen, setIsOpen }) => {
  const { user, logout, login } = useAuth();
  const [editOpen, setEditOpen] = React.useState(false);
  const [editName, setEditName] = React.useState(user?.name || '');
  const [editEmail, setEditEmail] = React.useState(user?.email || (user as any)?.username || '');
  const [editAvatar, setEditAvatar] = React.useState('');
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadStatus, setUploadStatus] = React.useState('');
  const [avatarPreview, setAvatarPreview] = React.useState('');
  const [avatarError, setAvatarError] = React.useState('');
  const [avatarCacheKey, setAvatarCacheKey] = React.useState(Date.now());
  const [cropOpen, setCropOpen] = React.useState(false);
  const [cropSourceUrl, setCropSourceUrl] = React.useState('');
  const [cropZoom, setCropZoom] = React.useState(1);
  const [cropOffsetX, setCropOffsetX] = React.useState(0);
  const [cropOffsetY, setCropOffsetY] = React.useState(0);
  const [cropImageSize, setCropImageSize] = React.useState<{ width: number; height: number } | null>(null);
  const cropViewportSize = 280;
  const dragRef = React.useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  React.useEffect(() => {
    if (editOpen) {
      setEditName(user?.name || '');
      setEditEmail(user?.email || (user as any)?.username || '');
      const existing = ((user as any)?.avatarUri || (user as any)?.avatarUrl || '') as string;
      setEditAvatar(existing);
      setAvatarFile(null);
      setAvatarPreview('');
      setAvatarError('');
      setUploadStatus('');
      setCropOpen(false);
      setCropSourceUrl('');
    }
  }, [editOpen, user]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            setAvatarError('文件过大，请选择小于10MB的图片。');
            setAvatarFile(null);
            return;
        }
        setAvatarError('');
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          if (!result) return;
          setCropSourceUrl(result);
          setCropZoom(1);
          setCropOffsetX(0);
          setCropOffsetY(0);
          setCropOpen(true);
        };
        reader.readAsDataURL(file);
    }
    e.currentTarget.value = '';
  };

  React.useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarFile]);

  React.useEffect(() => {
    if (!cropOpen || !cropSourceUrl) {
      setCropImageSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setCropImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setCropOffsetX(0);
      setCropOffsetY(0);
    };
    img.src = cropSourceUrl;
  }, [cropOpen, cropSourceUrl]);

  const getDisplaySize = React.useCallback((zoom: number) => {
    if (!cropImageSize) return { width: cropViewportSize, height: cropViewportSize };
    const base = Math.max(cropViewportSize / cropImageSize.width, cropViewportSize / cropImageSize.height);
    const scale = base * zoom;
    return {
      width: cropImageSize.width * scale,
      height: cropImageSize.height * scale,
    };
  }, [cropImageSize]);

  const clampOffsets = React.useCallback((nextX: number, nextY: number, zoom = cropZoom) => {
    const { width, height } = getDisplaySize(zoom);
    const maxX = Math.max(0, (width - cropViewportSize) / 2);
    const maxY = Math.max(0, (height - cropViewportSize) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextX)),
      y: Math.min(maxY, Math.max(-maxY, nextY)),
    };
  }, [cropZoom, getDisplaySize]);

  const handleCropZoomChange = (nextZoom: number) => {
    const z = Math.min(3, Math.max(1, nextZoom));
    setCropZoom(z);
    setCropOffsetX((prev) => clampOffsets(prev, cropOffsetY, z).x);
    setCropOffsetY((prev) => clampOffsets(cropOffsetX, prev, z).y);
  };

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = { active: true, x: clientX, y: clientY };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragRef.current.active) return;
    const dx = clientX - dragRef.current.x;
    const dy = clientY - dragRef.current.y;
    dragRef.current.x = clientX;
    dragRef.current.y = clientY;
    const next = clampOffsets(cropOffsetX + dx, cropOffsetY + dy);
    setCropOffsetX(next.x);
    setCropOffsetY(next.y);
  };

  const endDrag = () => {
    dragRef.current.active = false;
  };

  const createCroppedAvatarFile = async (sourceUrl: string) => {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = sourceUrl;
    });

    const { width: displayW, height: displayH } = getDisplaySize(cropZoom);
    const left = cropViewportSize / 2 + cropOffsetX - displayW / 2;
    const top = cropViewportSize / 2 + cropOffsetY - displayH / 2;
    const srcX = Math.max(0, ((0 - left) / displayW) * img.naturalWidth);
    const srcY = Math.max(0, ((0 - top) / displayH) * img.naturalHeight);
    const srcW = Math.min(img.naturalWidth - srcX, (cropViewportSize / displayW) * img.naturalWidth);
    const srcH = Math.min(img.naturalHeight - srcY, (cropViewportSize / displayH) * img.naturalHeight);

    const outSize = 512;
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持 Canvas');

    ctx.clearRect(0, 0, outSize, outSize);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outSize, outSize);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('头像导出失败'));
      }, 'image/png', 0.95);
    });

    return new File([blob], `avatar_${Date.now()}.png`, { type: 'image/png' });
  };

  const handleCropConfirm = async () => {
    if (!cropSourceUrl) return;
    try {
      const file = await createCroppedAvatarFile(cropSourceUrl);
      setAvatarFile(file);
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
      setCropOpen(false);
      setCropSourceUrl('');
      setAvatarError('');
      toast.success('已完成头像裁剪');
    } catch (e: any) {
      setAvatarError(e?.message || '裁剪失败，请重试');
    }
  };
  
  const handleAvatarUpload = async () => {
    if (!user || !avatarFile) return;

    setAvatarError('');
    setUploading(true);
    const uploadToast = toast.loading('准备上传...');

    try {
        setUploadStatus(`压缩图片... (原始: ${(avatarFile.size / 1024 / 1024).toFixed(2)} MB)`);
        toast.loading(uploadStatus, { id: uploadToast });

        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1024,
            useWebWorker: true,
        };
        const compressedFile = await imageCompression(avatarFile, options);
        
        setUploadStatus(`上传中... (压缩后: ${(compressedFile.size / 1024).toFixed(0)} KB)`);
        toast.loading(uploadStatus, { id: uploadToast });

        const type = compressedFile.type || 'image/jpeg';
        const ext = type.includes('png') ? 'png' : 'jpg';
        const rawKey = editAvatar || `avatars/teacher-${String(user.id)}.${ext}`;
        const suggestedKey = rawKey.replace(/^https?:\/\/[^\/]+\//, '').replace(/^\/+/, '');
        
        const res = await updateProfileAvatar(String(user.id), compressedFile, suggestedKey);
        
        if (res.success && res.data) {
            toast.success('头像上传成功！', { id: uploadToast });
            const updated = { ...user } as any;
            updated.avatarUri = res.data.avatarUri;
            login(updated);
            setEditAvatar(res.data.avatarUri);
            setAvatarFile(null);
            setAvatarCacheKey(Date.now()); // Bust the cache!
        } else {
            toast.error(res.error || '头像上传失败', { id: uploadToast });
            setAvatarError(res.error || '头像上传失败');
        }
    } catch (error: any) {
        toast.error(error.message || '上传过程中出现错误', { id: uploadToast });
        setAvatarError(error.message || '上传过程中出现错误');
    } finally {
        setUploading(false);
        setUploadStatus('');
    }
  };

  const remembered = (() => {
    try {
      return !!localStorage.getItem('facecheck_admin_credentials');
    } catch {
      return false;
    }
  })();
  const rawAvatar = (user as any)?.avatarUri || (user as any)?.avatarUrl;
  const normalizedAvatar = typeof rawAvatar === 'string' ? rawAvatar.trim() : '';
  const candidate = getFullImageUrl(normalizedAvatar, avatarCacheKey);
  const avatarUrl = normalizedAvatar
    ? candidate
    : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user?.name || 'Teacher') + '&background=0D8ABC&color=fff';
  
  const navItems = [
    { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
    { id: 'classrooms', label: '班级管理', icon: Users },
    { id: 'attendance', label: '考勤与签到', icon: History },
    { id: 'insights', label: 'AI 洞察', icon: BrainCircuit },
  ];

  const handleNav = (id: string) => {
    onNavigate(id);
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-white text-slate-800 border-r border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg">F</span>
            </div>
            FaceCheck
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Current User Card */}
        {user && (
          <div className="mx-4 mb-3 p-3 bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl">
            <div className="flex items-center gap-3">
              <img
                src={avatarUrl}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800 dark:text-white">{user.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{user.email || user.username}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded-full ${remembered ? 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
                {remembered ? '已记住登录' : '未记住登录'}
              </span>
              <button
                onClick={() => setEditOpen(true)}
                className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                管理账户
              </button>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <button 
            onClick={() => handleNav('settings')}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-xl transition-colors">
            <Settings size={20} />
            <span className="font-medium">设置</span>
          </button>
          <button 
            onClick={() => { logout(); setIsOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-xl transition-colors">
            <LogOut size={20} />
            <span className="font-medium">退出登录</span>
          </button>
        </div>
      </aside>
      
      {/* Edit Current User Modal */}
      <Modal open={editOpen} title="编辑账户信息" onClose={() => setEditOpen(false)}>
        <div className="space-y-4">
          {/* Avatar Section */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">头像预览</label>
            <div className="flex items-center gap-4">
                <img
                  src={avatarPreview || getFullImageUrl(editAvatar, avatarCacheKey)}
                  alt="avatar preview"
                  className="w-24 h-24 rounded-full object-cover border-4 border-slate-200 dark:border-slate-700 shadow-sm"
                />
                <div className='flex-1'>
                    <label htmlFor="avatar-upload" className="cursor-pointer px-4 py-2 text-sm rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 font-medium">
                        选择图片
                    </label>
                    <input id="avatar-upload" type="file" accept="image/*" onChange={handleFileChange} className="hidden"/>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">支持PNG, JPG, WEBP. 建议小于10MB。</p>
                    {avatarFile && (
                        <div className="text-xs mt-2 text-slate-500">原始大小: {(avatarFile.size / 1024 / 1024).toFixed(2)} MB</div>
                    )}
                </div>
            </div>
          </div>
          
          {/* Other Fields */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">姓名</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">头像路径 (R2 Key)</label>
            <input type="text" placeholder="e.g., avatars/teacher1.jpg" value={editAvatar} onChange={(e) => setEditAvatar(e.target.value)} className="input"/>
          </div>
          
          {/* Status & Error */}
          {uploading && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-600 dark:text-blue-200">
                {uploadStatus}
            </div>
          )}
          {avatarError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-200">
                {avatarError}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button onClick={() => setEditOpen(false)} className="btn-secondary">
              取消
            </button>
            <button
              disabled={!avatarFile || uploading}
              onClick={handleAvatarUpload}
              className="btn-primary disabled:opacity-60 flex items-center gap-2"
            >
              {uploading && <Loader2 size={16} className="animate-spin"/>}
              {uploading ? '处理中...' : '上传头像'}
            </button>
            <button
              onClick={() => { /* ... save logic ... */ setEditOpen(false); }}
              className="btn-primary"
            >
              保存信息
            </button>
          </div>
        </div>
      </Modal>
      <Modal open={cropOpen} title="裁剪头像" onClose={() => { setCropOpen(false); setCropSourceUrl(''); }}>
        <div className="space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">拖拽图片调整位置，滚动条缩放后确认裁剪。</div>
          <div className="flex justify-center">
            <div
              className="relative overflow-hidden rounded-2xl bg-black select-none touch-none"
              style={{ width: `${cropViewportSize}px`, height: `${cropViewportSize}px` }}
              onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
              onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (!t) return;
                startDrag(t.clientX, t.clientY);
              }}
              onTouchMove={(e) => {
                const t = e.touches[0];
                if (!t) return;
                moveDrag(t.clientX, t.clientY);
              }}
              onTouchEnd={endDrag}
            >
              {cropSourceUrl && (
                <img
                  src={cropSourceUrl}
                  alt="crop source"
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: `${getDisplaySize(cropZoom).width}px`,
                    height: `${getDisplaySize(cropZoom).height}px`,
                    transform: `translate(calc(-50% + ${cropOffsetX}px), calc(-50% + ${cropOffsetY}px))`,
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                />
              )}
              <div className="absolute inset-0 pointer-events-none">
                <div className="w-full h-full rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">缩放</div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={cropZoom}
              onChange={(e) => handleCropZoomChange(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setCropZoom(1);
                setCropOffsetX(0);
                setCropOffsetY(0);
              }}
              className="btn-secondary"
            >
              重置
            </button>
            <button onClick={() => { setCropOpen(false); setCropSourceUrl(''); }} className="btn-secondary">
              取消
            </button>
            <button onClick={handleCropConfirm} className="btn-primary">
              确认裁剪
            </button>
          </div>
        </div>
      </Modal>
      <style>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; background: transparent; }
        .dark .input { border-color: #475569; }
        .btn-primary { padding: 0.5rem 1rem; border-radius: 0.5rem; background: #4f46e5; color: white; font-weight: 500; }
        .btn-primary:hover { background: #4338ca; }
        .btn-secondary { padding: 0.5rem 1rem; border-radius: 0.5rem; background: #f1f5f9; color: #1e293b; font-weight: 500; }
        .dark .btn-secondary { background: #334155; color: #f1f5f9; }
        .btn-secondary:hover { background: #e2e8f0; }
        .dark .btn-secondary:hover { background: #475569; }
      `}</style>
    </>
  );
};

export default Sidebar;

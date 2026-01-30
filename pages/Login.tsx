import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loginAdmin, sendEmailVerificationCode, verifyEmailCode } from '../services/authService';
import { Lock, Mail, Loader2, ArrowRight, Zap, Clock, Eye, EyeOff } from 'lucide-react';

interface LoginProps {
  onNavigateRegister: () => void;
}

type LoginMode = 'password' | 'email-code';

const Login: React.FC<LoginProps> = ({ onNavigateRegister }) => {
  const { login } = useAuth();

  // --- Password Login State ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('facecheck_admin_credentials');
      if (saved) {
        const obj = JSON.parse(saved);
        if (obj && typeof obj === 'object') {
          if (obj.email) setEmail(obj.email);
          if (obj.password) setPassword(obj.password);
          setRemember(true);
        }
      }
    } catch {}
  }, []);

  // --- Email Code Login State ---
  const [loginMode, setLoginMode] = useState<LoginMode>('password');
  const [codeEmail, setCodeEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeCountdown, setCodeCountdown] = useState(0);

  // Password Login
  const performLogin = async (e: string, p: string) => {
    setError('');
    setLoading(true);

    const res = await loginAdmin(e, p);
    if (res.success && res.data) {
      login(res.data);
      if (remember) {
        try {
          localStorage.setItem('facecheck_admin_credentials', JSON.stringify({ email: e, password: p }));
        } catch {}
      } else {
        try {
          localStorage.removeItem('facecheck_admin_credentials');
        } catch {}
      }
    } else {
      setError(res.error || 'Invalid credentials');
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(email, password);
  };

  // Email Code Login - Send Code
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');
    setCodeSending(true);

    const res = await sendEmailVerificationCode(codeEmail);
    if (res.success) {
      setCodeSent(true);
      setCodeCountdown(60); // 60 seconds countdown
      // Start countdown
      const interval = setInterval(() => {
        setCodeCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCodeError(res.error || 'Failed to send verification code');
    }
    setCodeSending(false);
  };

  // Email Code Login - Verify Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');
    setCodeLoading(true);

    const res = await verifyEmailCode(codeEmail, verificationCode);
    if (res.success && res.data) {
      login(res.data);
    } else {
      setCodeError(res.error || 'Invalid verification code');
      setCodeLoading(false);
    }
  };

  // Switch login mode
  const switchMode = (mode: LoginMode) => {
    setLoginMode(mode);
    setError('');
    setCodeError('');
    setCodeSent(false);
    setVerificationCode('');
    setCodeCountdown(0);
  };

  const handleDemoLogin = () => {
    setEmail('demo@facecheck.com');
    setPassword('demo123');
    performLogin('demo@facecheck.com', 'demo123');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl shadow-lg shadow-blue-200">
            F
          </div>
          <h1 className="text-2xl font-bold text-slate-800">欢迎回来</h1>
          <p className="text-slate-500">登录 OmniAttend</p>
        </div>

        {/* Login Mode Toggle */}
        <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => switchMode('password')}
            className={`py-2 px-3 rounded-md font-medium text-sm transition-all ${
              loginMode === 'password'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            密码登录
          </button>
          <button
            onClick={() => switchMode('email-code')}
            className={`py-2 px-3 rounded-md font-medium text-sm transition-all ${
              loginMode === 'email-code'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            邮箱验证码
          </button>
        </div>

        {/* === PASSWORD LOGIN MODE === */}
        {loginMode === 'password' && (
          <>
            {error && (
              <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                {error}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">邮箱或用户名</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="admin@example.com 或 用户名"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  记住密码
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <>登录 <ArrowRight size={18} /></>}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px bg-slate-200 flex-1"></div>
              <span className="text-xs text-slate-400 font-medium uppercase">Or</span>
              <div className="h-px bg-slate-200 flex-1"></div>
            </div>

            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <Zap size={18} className="text-amber-500 fill-amber-500" />
              <span>快速体验登录</span>
            </button>
          </>
        )}

        {/* === EMAIL CODE LOGIN MODE === */}
        {loginMode === 'email-code' && (
          <>
            {codeError && (
              <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                {codeError}
              </div>
            )}

            <form onSubmit={codeSent ? handleVerifyCode : handleSendCode} className="space-y-5">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">邮箱地址</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    disabled={codeSent}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-slate-50 disabled:text-slate-500"
                    placeholder="teacher@example.com"
                    value={codeEmail}
                    onChange={(e) => setCodeEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Verification Code Input (shown after code is sent) */}
              {codeSent && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">验证码</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center text-xl font-mono tracking-widest"
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    请输入邮箱中收到的 6 位验证码
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={codeSending || codeLoading || (codeSent && verificationCode.length !== 6)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {codeSending ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    正在发送...
                  </>
                ) : codeLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    正在验证...
                  </>
                ) : codeSent ? (
                  <>验证验证码 <ArrowRight size={18} /></>
                ) : (
                  <>发送验证码 <ArrowRight size={18} /></>
                )}
              </button>

              {/* Resend Countdown */}
              {codeSent && codeCountdown > 0 && (
                <p className="text-sm text-center text-slate-600 flex items-center justify-center gap-2">
                  <Clock size={16} />
                  {codeCountdown}s 后可重新发送
                </p>
              )}

              {/* Change Email Button */}
              {codeSent && (
                <button
                  type="button"
                  onClick={() => {
                    setCodeSent(false);
                    setVerificationCode('');
                    setCodeCountdown(0);
                    setCodeError('');
                  }}
                  className="w-full py-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  更换邮箱
                </button>
              )}
            </form>
            <p className="text-xs text-slate-500 mt-4 text-center">
              邮箱找回密码：未开通；当前可用接口：/api/auth/email-code/send，/api/auth/email-code/verify
            </p>
          </>
          
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
            还没有账户？{' '}
            Don't have an account?{' '}
              立即创建
              Create one
            </button>
          </p>
        </div>
      </div>
    </div>
};

export default Login;

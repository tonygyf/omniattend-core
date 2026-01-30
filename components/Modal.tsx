import React from 'react';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string; // allow custom width
}

const Modal: React.FC<ModalProps> = ({ open, title, onClose, children, widthClass = 'max-w-md' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`w-full ${widthClass} bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden`}>
          {title && (
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{title}</h3>
            </div>
          )}
          <div className="p-5">{children}</div>
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/40 border-t border-slate-100 dark:border-slate-700 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;

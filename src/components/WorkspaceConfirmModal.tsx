import React from 'react';
import { AlertTriangle, Trash2, X, Check, ShieldAlert } from 'lucide-react';

export interface WorkspaceConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  affectedItems?: string[];
  confirmButtonText?: string;
  confirmButtonVariant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isProcessing?: boolean;
}

export const WorkspaceConfirmModal: React.FC<WorkspaceConfirmModalProps> = ({
  isOpen,
  title,
  description,
  affectedItems = [],
  confirmButtonText = 'ยืนยันดำเนินการ',
  confirmButtonVariant = 'danger',
  onConfirm,
  onCancel,
  isProcessing = false
}) => {
  if (!isOpen) return null;

  const getButtonBg = () => {
    switch (confirmButtonVariant) {
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-950/50';
      default:
        return 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        {/* Header */}
        <div className="bg-slate-950/80 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${confirmButtonVariant === 'danger' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
              {confirmButtonVariant === 'danger' ? (
                <Trash2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-sm sm:text-base font-black text-white">
                {title}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                ต้องได้รับการยืนยันจากผู้ใช้ก่อนดำเนินการ
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
            title="ยกเลิกและปิด"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 text-xs">
          <div className="text-slate-200 leading-relaxed font-normal">
            {description}
          </div>

          {affectedItems && affectedItems.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400">
                รายการที่จะได้รับผลกระทบ ({affectedItems.length} รายการ):
              </span>
              <div className="max-h-36 overflow-y-auto bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                {affectedItems.map((item, idx) => (
                  <div key={idx} className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5 truncate">
                    <span className="text-slate-500 shrink-0">•</span>
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-2.5 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90 leading-tight">
              การดำเนินการนี้จะเปลี่ยนแปลงข้อมูลในบัญชี Google Workspace ของคุณ กรุณาตรวจสอบให้แน่ใจก่อนกดยืนยัน
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 font-bold hover:bg-slate-700 transition-all cursor-pointer text-xs"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-lg active:scale-95 flex items-center gap-1.5 ${getButtonBg()} disabled:opacity-50`}
          >
            {isProcessing ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>{confirmButtonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ApiConfirmModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'warning' | 'danger';
    requireCheckbox?: boolean;
    checkboxLabel?: string;
    loading?: boolean;
}

export function ApiConfirmModal({
    open,
    onClose,
    onConfirm,
    title,
    description,
    detail,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'warning',
    requireCheckbox = true,
    checkboxLabel = 'I understand this action cannot be undone',
    loading = false,
}: ApiConfirmModalProps) {
    const [checked, setChecked] = useState(false);
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) setChecked(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!open) return null;

    const isDanger = variant === 'danger';
    const canConfirm = requireCheckbox ? checked : true;

    return (
        <div
            ref={backdropRef}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: 'acmFadeIn 150ms ease-out' }} />

            {/* Modal */}
            <div
                className="relative w-full max-w-md bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                style={{ animation: 'acmSlideUp 200ms ease-out' }}
            >
                {/* Warning stripe */}
                <div className={`h-1 w-full ${isDanger ? 'bg-red-500' : 'bg-amber-500'}`} />

                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isDanger ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                            <AlertTriangle className={`w-6 h-6 ${isDanger ? 'text-red-400' : 'text-amber-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-white">{title}</h3>
                            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{description}</p>
                        </div>
                        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Detail */}
                    {detail && (
                        <div className="bg-zinc-800/50 border border-white/5 rounded-xl p-3 mb-4">
                            <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap break-all">{detail}</pre>
                        </div>
                    )}

                    {/* Checkbox */}
                    {requireCheckbox && (
                        <label className="flex items-start gap-3 mb-6 cursor-pointer group">
                            <div className="relative mt-0.5 flex-shrink-0">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => setChecked(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${
                                    checked
                                        ? isDanger ? 'bg-red-500 border-red-500' : 'bg-amber-500 border-amber-500'
                                        : 'border-zinc-600 group-hover:border-zinc-500'
                                }`}>
                                    {checked && (
                                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </div>
                            </div>
                            <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors leading-snug">
                                {checkboxLabel}
                            </span>
                        </label>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={!canConfirm || loading}
                            className={`flex-1 py-3 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed ${
                                isDanger
                                    ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20'
                                    : 'bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                            }`}
                        >
                            {loading ? (
                                <span className="inline-flex items-center gap-2">
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                                    </svg>
                                    Processing...
                                </span>
                            ) : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes acmFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes acmSlideUp {
                    from { opacity: 0; transform: translateY(16px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}

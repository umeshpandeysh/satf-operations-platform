"use client";

import React, { useState, useEffect } from "react";
import { KeyRound, ShieldCheck, Lock, AlertCircle, X, Loader2, User } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { invalidateClientCsrfToken } from "@/lib/operations-client";

interface StaffAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (info: { operator: string; role?: string }) => void;
}

export function StaffAuthModal({ isOpen, onClose, onSuccess }: StaffAuthModalProps) {
  const { t } = useLanguage();
  const [passphrase, setPassphrase] = useState("");
  const [username, setUsername] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = React.useCallback(() => {
    setPassphrase("");
    setUsername("");
    setMfaCode("");
    setError(null);
    setLoading(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !loading) {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, handleClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) {
      setError(t("auth.passphrase_label") + " is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: Record<string, string> = {
        passphrase: passphrase.trim(),
      };
      if (username.trim()) payload.username = username.trim();
      if (mfaCode.trim()) payload.mfaCode = mfaCode.trim();

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(data.error || "Authentication failed. Please verify credentials.");
        setLoading(false);
        return;
      }

      invalidateClientCsrfToken();
      onSuccess({
        operator: data.operator || "Duty Coordinator",
        role: data.role || "coordinator",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error during authentication.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#244d70]/10 text-[#244d70]">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-sm font-bold text-slate-900 leading-tight">
                {t("auth.modal_title")}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">SATF Operations Platform</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label={t("auth.cancel")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t("auth.modal_desc")}
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg animate-in fade-in duration-150">
              <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
              <div className="leading-tight">{error}</div>
            </div>
          )}

          {/* Passphrase Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              {t("auth.passphrase_label")}
            </label>
            <div className="relative">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={t("auth.passphrase_placeholder")}
                disabled={loading}
                autoFocus
                className="w-full px-3 py-2 pl-9 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#244d70] focus:border-[#244d70] transition-colors"
              />
              <Lock size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Toggle for individual coordinator accounts */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] text-[#244d70] hover:text-[#172d43] font-medium cursor-pointer underline decoration-dotted"
            >
              {showAdvanced ? "▲ Hide Individual Coordinator Fields" : "▼ Individual Coordinator Login (Optional)"}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  {t("auth.username_label")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("auth.username_placeholder")}
                    disabled={loading}
                    className="w-full px-3 py-2 pl-9 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#244d70] focus:border-[#244d70] transition-colors"
                  />
                  <User size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  {t("auth.mfa_label")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder={t("auth.mfa_placeholder")}
                    disabled={loading}
                    className="w-full px-3 py-2 pl-9 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#244d70] focus:border-[#244d70] tracking-widest transition-colors"
                  />
                  <ShieldCheck size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              {t("auth.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#244d70] hover:bg-[#1a3852] active:bg-[#132a3d] rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              <span>{loading ? t("auth.authenticating") : t("auth.submit")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

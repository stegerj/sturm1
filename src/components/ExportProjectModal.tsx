import React, { useState } from 'react';
import { Download, Github, Check, Copy, Terminal, FolderArchive, Sparkles, X } from 'lucide-react';
import { downloadProjectZip } from '../utils/exportProjectZip';

interface ExportProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportProjectModal: React.FC<ExportProjectModalProps> = ({ isOpen, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await downloadProjectZip('storm-alert-source');
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      console.error('Download error:', err);
      alert('Could not generate ZIP archive. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const gitCommands = [
    '# 1. Open your terminal in the unzipped project folder',
    'git init',
    'git add .',
    'git commit -m "Initial commit from Storm Alert App"',
    'git branch -M main',
    'git remote add origin https://github.com/<your-username>/<your-repo-name>.git',
    'git push -u origin main'
  ];

  const handleCopyCommand = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = () => {
    const all = gitCommands.filter(c => !c.startsWith('#')).join('\n');
    navigator.clipboard.writeText(all);
    setCopiedIndex(999);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Github className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Export to GitHub / Download
            </h3>
            <p className="text-xs text-slate-400">
              Download your entire codebase and sync with GitHub
            </p>
          </div>
        </div>

        {/* 1-Click ZIP Download Action */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FolderArchive className="w-5 h-5 text-sky-400" />
              <div>
                <div className="text-sm font-bold text-white">Full Source Code Archive</div>
                <div className="text-xs text-slate-400">Includes all React components, services, and configs</div>
              </div>
            </div>
          </div>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Bundling ZIP...' : downloadSuccess ? 'Downloaded!' : 'Download Project (.zip)'}</span>
          </button>
        </div>

        {/* Git Push Step-by-Step Instructions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Push to your GitHub repository:
            </span>
            <button
              onClick={handleCopyAll}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              {copiedIndex === 999 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedIndex === 999 ? 'Copied all!' : 'Copy commands'}</span>
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 space-y-1.5 max-h-48 overflow-y-auto">
            {gitCommands.map((cmd, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between gap-2 p-1 rounded hover:bg-slate-900 ${
                  cmd.startsWith('#') ? 'text-slate-500 italic' : ''
                }`}
              >
                <span className="truncate">{cmd}</span>
                {!cmd.startsWith('#') && (
                  <button
                    onClick={() => handleCopyCommand(cmd, idx)}
                    className="text-slate-500 hover:text-slate-200 shrink-0 p-1 cursor-pointer"
                    title="Copy command"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>You can push to any public or private repository on GitHub, GitLab, or Bitbucket.</span>
        </div>
      </div>
    </div>
  );
};

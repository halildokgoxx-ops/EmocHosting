import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, fetchAuthenticatedBlob, downloadAuthenticatedFile } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import {
  FolderIcon,
  FileCodeIcon,
  UploadIcon,
  TrashIcon,
  PlusIcon,
  DownloadIcon,
  EditFileIcon,
  CopyIcon,
  ZipExtractIcon,
  SearchGlassIcon,
} from '../icons/EmoIcons';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

export function FileManagerTab({ serverId, defaultPath = '' }) {
  const toast = useToast();
  const [currentPath, setCurrentPath] = useState(defaultPath);
  const [entries, setEntries] = useState([]);
  const [diskUsedMb, setDiskUsedMb] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [newName, setNewName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const loadDir = useCallback(
    async (p = currentPath) => {
      try {
        const data = await apiRequest(`/api/servers/${serverId}/files?path=${encodeURIComponent(p)}`);
        setEntries(data.entries || []);
        setDiskUsedMb(data.diskUsedMb || 0);
        setCurrentPath(data.path || '');
        setSelectedPaths([]);
      } catch (err) {
        toast.error(err.message);
      }
    },
    [serverId, currentPath, toast]
  );

  useEffect(() => {
    loadDir(defaultPath);
  }, [serverId, defaultPath]);

  const filtered = entries.filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()));

  async function openFile(entry) {
    if (entry.isDir) {
      loadDir(entry.path);
      return;
    }
    const lower = entry.name.toLowerCase();
    if (IMAGE_EXTS.some((ext) => lower.endsWith(ext))) {
      try {
        const blob = await fetchAuthenticatedBlob(`/api/servers/${serverId}/raw?path=${encodeURIComponent(entry.path)}`);
        const objUrl = URL.createObjectURL(blob);
        setImagePreview((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return { name: entry.name, url: objUrl };
        });
      } catch (err) {
        toast.error(err.message);
      }
      return;
    }
    try {
      const data = await apiRequest(`/api/servers/${serverId}/file?path=${encodeURIComponent(entry.path)}`);
      setEditingFile(entry.path);
      setFileContent(data.content);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const saveFile = useCallback(async () => {
    if (!editingFile) return;
    try {
      await apiRequest(`/api/servers/${serverId}/file`, {
        method: 'POST',
        body: { path: editingFile, content: fileContent },
      });
      toast.success(`Kaydedildi: ${editingFile}`);
      loadDir(currentPath);
    } catch (err) {
      toast.error(err.message);
    }
  }, [editingFile, fileContent, serverId, currentPath, loadDir, toast]);

  // Ctrl+S inside editor
  useEffect(() => {
    if (!editingFile) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingFile, saveFile]);

  async function createItem(isDir) {
    const clean = newName.trim();
    if (!clean) return;
    const target = currentPath ? `${currentPath}/${clean}` : clean;
    try {
      if (isDir) {
        await apiRequest(`/api/servers/${serverId}/mkdir`, { method: 'POST', body: { path: target } });
      } else {
        await apiRequest(`/api/servers/${serverId}/file`, { method: 'POST', body: { path: target, content: '' } });
      }
      setNewName('');
      loadDir(currentPath);
      toast.success(`${isDir ? 'Klasör' : 'Dosya'} oluşturuldu`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function renameEntry(entry) {
    const nextName = window.prompt('Yeni ad / yol:', entry.name);
    if (!nextName || nextName === entry.name) return;
    const dirPrefix = currentPath ? `${currentPath}/` : '';
    try {
      await apiRequest(`/api/servers/${serverId}/rename`, {
        method: 'POST',
        body: { from: entry.path, to: `${dirPrefix}${nextName}` },
      });
      toast.success('Yeniden adlandırıldı');
      loadDir(currentPath);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function duplicateEntry(entry) {
    const dirPrefix = currentPath ? `${currentPath}/` : '';
    const copyName = `${dirPrefix}copy_${entry.name}`;
    try {
      await apiRequest(`/api/servers/${serverId}/copy`, {
        method: 'POST',
        body: { from: entry.path, to: copyName },
      });
      toast.success(`Kopyalandı: copy_${entry.name}`);
      loadDir(currentPath);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function extractZip(entry) {
    try {
      await apiRequest(`/api/servers/${serverId}/extract`, {
        method: 'POST',
        body: { path: entry.path, destDir: currentPath },
      });
      toast.success(`${entry.name} klasöre çıkartıldı!`);
      loadDir(currentPath);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function compressSelected() {
    if (selectedPaths.length === 0) return;
    const archiveName = window.prompt('Oluşturulacak .zip dosya adı:', `arsiv-${Date.now()}.zip`);
    if (!archiveName) return;
    const outName = currentPath ? `${currentPath}/${archiveName}` : archiveName;
    try {
      await apiRequest(`/api/servers/${serverId}/compress`, {
        method: 'POST',
        body: { paths: selectedPaths, outName },
      });
      toast.success(`${archiveName} sıkıştırıldı!`);
      loadDir(currentPath);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function bulkDelete() {
    if (selectedPaths.length === 0) return;
    if (!window.confirm(`${selectedPaths.length} öğe kalıcı olarak silinsin mi?`)) return;
    await apiRequest(`/api/servers/${serverId}/bulk-delete`, {
      method: 'POST',
      body: { paths: selectedPaths },
    });
    toast.info('Seçilenler silindi');
    loadDir(currentPath);
  }

  async function deleteEntry(entry) {
    if (!window.confirm(`"${entry.name}" kalıcı olarak silinsin mi?`)) return;
    try {
      await apiRequest(`/api/servers/${serverId}/file?path=${encodeURIComponent(entry.path)}`, { method: 'DELETE' });
      toast.info('Silindi');
      loadDir(currentPath);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function uploadFilesList(fileList) {
    if (!fileList || fileList.length === 0) return;
    const fd = new FormData();
    fd.append('dir', currentPath);
    for (const f of Array.from(fileList)) {
      fd.append('files', f);
    }
    try {
      const res = await apiRequest(`/api/servers/${serverId}/upload`, { method: 'POST', body: fd, isFormData: true });
      toast.success(`${res.files?.length || 1} dosya yüklendi!`);
      loadDir(currentPath);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function downloadFile(entry) {
    try {
      await downloadAuthenticatedFile(`/api/servers/${serverId}/download?path=${encodeURIComponent(entry.path)}`, entry.name);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const goUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    loadDir(parts.join('/'));
  };

  const toggleSelect = (p) => {
    setSelectedPaths((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const lineCount = fileContent.split('\n').length;

  return (
    <div
      className={`space-y-4 rounded-2xl transition ${dragOver ? 'ring-2 ring-cyan-400 bg-cyan-500/5 p-2' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        uploadFilesList(e.dataTransfer.files);
      }}
    >
      {/* Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <button onClick={() => loadDir('')} className="px-2.5 py-1.5 rounded-lg bg-white/5 text-cyan-300 font-bold">
            /kök
          </button>
          {currentPath && (
            <>
              <button onClick={goUp} className="px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-300">
                ← Üst
              </button>
              <span className="text-slate-400 break-all">/{currentPath}</span>
            </>
          )}
          <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">{diskUsedMb} MB</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <SearchGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Dosya ara..."
              className="w-full sm:w-40 pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-white"
            />
          </div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="yeni.txt / klasör"
            className="flex-1 sm:w-36 px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-white"
          />
          <AnimatedButton size="xs" variant="secondary" onClick={() => createItem(false)}>
            <PlusIcon className="w-3.5 h-3.5" /> Dosya
          </AnimatedButton>
          <AnimatedButton size="xs" variant="secondary" onClick={() => createItem(true)}>
            <PlusIcon className="w-3.5 h-3.5" /> Klasör
          </AnimatedButton>
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/35 text-cyan-200 text-xs font-semibold">
            <UploadIcon className="w-3.5 h-3.5" />
            <span>Çoklu Yükle</span>
            <input type="file" multiple className="hidden" onChange={(e) => uploadFilesList(e.target.files)} />
          </label>
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {selectedPaths.length > 0 && !editingFile && (
        <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-cyan-200">{selectedPaths.length} öğe seçildi</span>
          <div className="flex gap-2">
            <AnimatedButton size="xs" variant="secondary" onClick={compressSelected}>
              .ZIP Arşivle
            </AnimatedButton>
            <AnimatedButton size="xs" variant="danger" onClick={bulkDelete}>
              Seçilenleri Sil
            </AnimatedButton>
          </div>
        </div>
      )}

      {editingFile ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono bg-white/5 px-4 py-2.5 rounded-2xl">
            <span className="text-cyan-300 truncate">/{editingFile} ({lineCount} satır • Ctrl+S ile kaydet)</span>
            <div className="flex gap-2">
              <AnimatedButton size="xs" variant="ghost" onClick={() => setEditingFile(null)}>Kapat</AnimatedButton>
              <AnimatedButton size="xs" variant="emerald" onClick={saveFile}>Kaydet</AnimatedButton>
            </div>
          </div>
          <div className="flex rounded-2xl bg-[#03050a] border border-cyan-400/30 overflow-hidden">
            <div className="hidden sm:block py-4 px-3 bg-white/[0.02] border-r border-white/5 text-right font-mono text-[11px] text-slate-600 select-none leading-5">
              {Array.from({ length: Math.min(lineCount, 400) }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              rows={20}
              spellCheck={false}
              className="w-full p-4 bg-transparent font-mono text-xs leading-5 text-slate-100 outline-none resize-y"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-950/50">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Klasör boş veya arama sonucu yok. Dosyaları buraya sürükleyip bırakabilirsiniz.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map((e) => (
                <div key={e.path} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 hover:bg-white/5 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedPaths.includes(e.path)}
                      onChange={() => toggleSelect(e.path)}
                      className="rounded border-white/20 shrink-0"
                    />
                    <button onClick={() => openFile(e)} className="flex items-center gap-2.5 text-left min-w-0 flex-1">
                      {e.isDir ? <FolderIcon className="w-4 h-4 shrink-0" /> : <FileCodeIcon className="w-4 h-4 text-slate-300 shrink-0" />}
                      <span className="font-mono text-slate-100 hover:text-cyan-300 truncate">{e.name}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                    <span className="text-slate-500 font-mono hidden md:inline">
                      {e.isDir ? 'Klasör' : `${(e.size / 1024).toFixed(1)} KB`}
                    </span>
                    {!e.isDir && e.name.toLowerCase().endsWith('.zip') && (
                      <button onClick={() => extractZip(e)} className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-300" title="ZIP Çıkart">
                        <ZipExtractIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => renameEntry(e)} className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white" title="Yeniden Adlandır">
                      <EditFileIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => duplicateEntry(e)} className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-cyan-300" title="Kopyala">
                      <CopyIcon className="w-3.5 h-3.5" />
                    </button>
                    {!e.isDir && (
                      <button onClick={() => downloadFile(e)} className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-emerald-300" title="İndir">
                        <DownloadIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteEntry(e)} className="p-1.5 rounded-lg bg-white/5 text-rose-400 hover:bg-rose-500/20" title="Sil">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image Preview Modal */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => {
            if (imagePreview?.url) URL.revokeObjectURL(imagePreview.url);
            setImagePreview(null);
          }}
        >
          <div className="glass-panel rounded-3xl p-5 max-w-lg w-full space-y-3 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="font-mono text-xs text-cyan-300">{imagePreview.name}</div>
            <img src={imagePreview.url} alt={imagePreview.name} className="max-h-80 mx-auto rounded-xl border border-white/10" />
            <AnimatedButton
              size="xs"
              variant="secondary"
              onClick={() => {
                if (imagePreview?.url) URL.revokeObjectURL(imagePreview.url);
                setImagePreview(null);
              }}
            >
              Kapat
            </AnimatedButton>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { 
  Users, 
  QrCode, 
  Search, 
  UserPlus, 
  Printer, 
  Sparkles, 
  Check, 
  AlertCircle,
  ShieldCheck,
  ExternalLink,
  Upload,
  Download
} from 'lucide-react';
import { Participant } from '../types';
import { StorageService } from '../services/storage';
import { importParticipantsFromExcel } from '../services/excelImport';

interface ParticipantRegistryProps {
  onSimulateScan: (uid: number) => void;
}

export const ParticipantRegistry: React.FC<ParticipantRegistryProps> = ({
  onSimulateScan
}) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});
  
  // Add participant form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState('Team Falcon');
  const [newUid, setNewUid] = useState<number>(1031);
  const [newDietary, setNewDietary] = useState<Participant['dietary']>('Regular');
  const [addMessage, setAddMessage] = useState<string | null>(null);

  // Excel import state
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk QR download state
  const [isZipping, setIsZipping] = useState(false);
  const [zipMessage, setZipMessage] = useState<string | null>(null);

  const refreshParticipants = () => {
    const list = StorageService.getParticipants();
    setParticipants(list);
    // Find next available UID
    const maxUid = list.reduce((max, p) => (p.uid > max ? p.uid : max), 1000);
    setNewUid(maxUid + 1);
  };

  useEffect(() => {
    refreshParticipants();
    const unsub = StorageService.subscribe(refreshParticipants);
    return () => unsub();
  }, []);

  // Generate QR code data URLs for participants
  useEffect(() => {
    participants.forEach((p) => {
      // Encode only numeric UID per PRD 4.1
      QRCode.toDataURL(
        String(p.uid),
        {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 140,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        },
        (err, url) => {
          if (!err && url) {
            setQrUrls((prev) => ({ ...prev, [p.uid]: url }));
          }
        }
      );
    });
  }, [participants]);

  const teams = Array.from(new Set(participants.map((p) => p.team))).sort();

  const filtered = participants.filter((p) => {
    const matchesTeam = selectedTeam === 'ALL' || p.team === selectedTeam;
    const matchesQuery =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(p.uid).includes(searchQuery) ||
      p.team.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTeam && matchesQuery;
  });

  const handleCreateParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUid) return;

    const success = StorageService.addParticipant({
      uid: Number(newUid),
      name: newName.trim(),
      team: newTeam.trim(),
      dietary: newDietary
    });

    if (success) {
      setAddMessage(`Participant #${newUid} registered successfully.`);
      setNewName('');
      setTimeout(() => setAddMessage(null), 3000);
      refreshParticipants();
    } else {
      setAddMessage(`UID #${newUid} is already registered.`);
    }
  };

  const handlePrintSingle = (p: Participant) => {
    const qrSrc = qrUrls[p.uid];
    if (!qrSrc) return;

    const printWindow = window.open('', '_blank', 'width=400,height=500');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Event Pass #${p.uid}</title>
          <style>
            @page { size: auto; margin: 10mm; }
            body {
              font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
            }
            .badge {
              border: 2px solid #0f172a;
              border-radius: 16px;
              padding: 20px;
              text-align: center;
              width: 260px;
            }
            .uid {
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              color: #2563eb;
              margin-bottom: 4px;
            }
            .name { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
            .team { font-size: 12px; color: #475569; margin: 2px 0 12px; }
            .qr { width: 160px; height: 160px; }
            .pass { font-family: monospace; font-weight: 700; font-size: 11px; color: #0f172a; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="badge">
            <div class="uid">UID #${p.uid}</div>
            <p class="name">${p.name}</p>
            <p class="team">${p.team}</p>
            <img class="qr" src="${qrSrc}" alt="QR Code for ${p.uid}" />
            <div class="pass">EVENT PASS #${p.uid}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setIsImporting(true);
    setImportMessage(null);

    const result = await importParticipantsFromExcel(file);

    setIsImporting(false);

    if (!result.success) {
      setImportMessage(`Import failed: ${result.errors[0] || 'Unknown error'}`);
      return;
    }

    const summary = `Imported ${result.added} participant${result.added === 1 ? '' : 's'}` +
      (result.skipped > 0 ? `, skipped ${result.skipped} row${result.skipped === 1 ? '' : 's'}.` : '.');
    setImportMessage(summary);
    setTimeout(() => setImportMessage(null), 6000);
  };

  const sanitizeFileName = (value: string) =>
    value.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'participant';

  const handleDownloadAllQRs = async () => {
    if (participants.length === 0 || isZipping) return;

    setIsZipping(true);
    setZipMessage(null);

    try {
      const zip = new JSZip();

      // Generate a higher-resolution PNG per participant so the exported
      // codes are print-quality, independent of the small preview QRs.
      for (const p of participants) {
        const dataUrl = await QRCode.toDataURL(String(p.uid), {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 512,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        });
        const base64 = dataUrl.split(',')[1];
        const fileName = `${p.uid}_${sanitizeFileName(p.team)}_${sanitizeFileName(p.name)}.png`;
        zip.file(fileName, base64, { base64: true });
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const dateStamp = new Date().toISOString().slice(0, 10);

      const link = document.createElement('a');
      link.href = url;
      link.download = `participant-qrs-${dateStamp}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setZipMessage(`Downloaded ${participants.length} QR code${participants.length === 1 ? '' : 's'} as a ZIP archive.`);
      setTimeout(() => setZipMessage(null), 5000);
    } catch (err) {
      setZipMessage('Unable to generate the QR archive. Please try again.');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                ID Cards & Wristbands
              </span>
              <span className="text-xs text-slate-500 font-mono">Total: {participants.length}</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-0.5">
              Participant QR Registry
            </h1>
            
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-400" />
            <span>{showAddForm ? 'Hide Form' : 'Register Attendee'}</span>
          </button>

          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isImporting ? 'Importing...' : 'Import Excel'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelected}
          />

          <button
            onClick={handleDownloadAllQRs}
            disabled={isZipping || participants.length === 0}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>{isZipping ? 'Preparing archive...' : 'Download All QR Codes'}</span>
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800 rounded-xl px-4 py-2">
          {importMessage}
        </div>
      )}

      {zipMessage && (
        <div className="text-xs font-medium text-purple-300 bg-purple-950/40 border border-purple-800 rounded-xl px-4 py-2">
          {zipMessage}
        </div>
      )}

      {/* Add Attendee Form */}
      {showAddForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <UserPlus className="w-4 h-4 text-blue-400" />
              <span>Register New Event Participant</span>
            </h2>
            {addMessage && (
              <span className="text-xs text-blue-400 font-medium">{addMessage}</span>
            )}
          </div>

          <form onSubmit={handleCreateParticipant} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Numeric UID (QR Value)</label>
              <input
                type="number"
                required
                value={newUid}
                onChange={(e) => setNewUid(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Maya Sen"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Team Name</label>
              <input
                type="text"
                required
                value={newTeam}
                onChange={(e) => setNewTeam(e.target.value)}
                placeholder="e.g. Team Falcon"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex items-end space-x-2">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Dietary</label>
                <select
                  value={newDietary}
                  onChange={(e) => setNewDietary(e.target.value as Participant['dietary'])}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
                >
                  <option value="Regular">Regular</option>
                  <option value="Vegetarian">Vegetarian</option>
                  <option value="Vegan">Vegan</option>
                  <option value="Jain">Jain</option>
                  <option value="Gluten-Free">Gluten-Free</option>
                </select>
              </div>

              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedTeam('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
              selectedTeam === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Teams ({participants.length})
          </button>
          {teams.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTeam(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                selectedTeam === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search UID or participant name..."
            className="bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Wristbands Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((p) => {
          const qrSrc = qrUrls[p.uid];
          return (
            <div
              key={p.uid}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-sm hover:border-slate-700 transition-all group"
            >
              {/* Badge Top */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-800">
                    UID #{p.uid}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1 leading-tight">{p.name}</h3>
                  <p className="text-xs text-slate-400">{p.team}</p>
                </div>
                {p.dietary && p.dietary !== 'Regular' && (
                  <span className="text-[10px] font-semibold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                    {p.dietary}
                  </span>
                )}
              </div>

              {/* QR Code Container */}
              <div className="bg-white p-2.5 rounded-xl flex flex-col items-center justify-center mx-auto shadow-inner">
                {qrSrc ? (
                  <img
                    src={qrSrc}
                    alt={`QR Code for ${p.uid}`}
                    className="w-28 h-28 object-contain"
                  />
                ) : (
                  <div className="w-28 h-28 flex items-center justify-center text-slate-400 text-xs">
                    Generating QR...
                  </div>
                )}
                <span className="text-[10px] font-mono font-bold text-slate-900 mt-1">
                  EVENT PASS #{p.uid}
                </span>
              </div>

              <button
                onClick={() => handlePrintSingle(p)}
                disabled={!qrSrc}
                className="w-full px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Print This QR</span>
              </button>

            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-sm">No participants match your query.</p>
        </div>
      )}

    </div>
  );
};

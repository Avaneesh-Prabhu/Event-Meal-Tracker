import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, 
  Maximize2, 
  Minimize2, 
  Users, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Sparkles, 
  Search,
  Filter,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Meal, Participant } from '../types';
import { StorageService } from '../services/storage';

interface DashboardViewProps {
  activeMeal: Meal | null;
  meals: Meal[];
  currentTimeString: string;
  onOpenScheduleModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  activeMeal,
  meals,
  currentTimeString,
  onOpenScheduleModal
}) => {
  // Allow organizer to either track the active meal or inspect another meal
  const [selectedMealId, setSelectedMealId] = useState<string>(activeMeal?.id || meals[0]?.id || '');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamData, setTeamData] = useState<ReturnType<typeof StorageService.getPendingGroupedByTeam>>([]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [completedTeamAlerts, setCompletedTeamAlerts] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep selectedMealId in sync with active meal when it changes unless user selected another
  useEffect(() => {
    if (activeMeal) {
      setSelectedMealId(activeMeal.id);
    }
  }, [activeMeal?.id]);

  // Load pending participants grouped by team
  const refreshDashboardData = () => {
    if (!selectedMealId) return;

    const data = StorageService.getPendingGroupedByTeam(selectedMealId);
    setTeamData(data);
    setLastRefreshedAt(new Date());

    // Check if any new team reached 100% completion
    data.forEach((team) => {
      if (team.totalInTeam > 0 && team.pendingCount === 0) {
        if (!completedTeamAlerts.has(team.team)) {
          // Trigger confetti for this newly completed team!
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6 }
          });
          setCompletedTeamAlerts((prev) => new Set([...prev, team.team]));
        }
      }
    });
  };

  // 5-second polling interval per PRD 4.4 ("the dashboard polls the server every 5 seconds")
  useEffect(() => {
    refreshDashboardData();

    const interval = setInterval(() => {
      refreshDashboardData();
    }, 5000);

    const unsub = StorageService.subscribe(refreshDashboardData);

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [selectedMealId]);

  // Fullscreen toggle for TV/projector display
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const currentInspectedMeal = meals.find((m) => m.id === selectedMealId) || activeMeal;

  // Aggregate stats
  const totalParticipants = teamData.reduce((acc, t) => acc + t.totalInTeam, 0);
  const totalServed = teamData.reduce((acc, t) => acc + t.servedCount, 0);
  const totalPending = teamData.reduce((acc, t) => acc + t.pendingCount, 0);
  const overallPct = totalParticipants > 0 ? Math.round((totalServed / totalParticipants) * 100) : 0;
  const completedTeamsCount = teamData.filter((t) => t.totalInTeam > 0 && t.pendingCount === 0).length;

  return (
    <div
      ref={containerRef}
      className={`min-h-[calc(100vh-64px)] transition-colors ${
        isFullscreen ? 'bg-slate-950 p-6 sm:p-8 text-white' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6'
      }`}
    >
      {/* Dashboard Top Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Left: Meal title & active indicator */}
        <div className="flex items-center space-x-3.5">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight mt-0.5 flex items-center space-x-2">
              <span>{currentInspectedMeal ? currentInspectedMeal.name : 'Meal Tracking'}</span>
            </h1>
          </div>
        </div>

        {/* Right: Controls & Meal Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Meal selector */}
          <div className="flex items-center space-x-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
            <span className="text-xs text-slate-400">Meal:</span>
            <select
              value={selectedMealId}
              onChange={(e) => setSelectedMealId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              {meals.map((m) => (
                <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                  {m.name} ({m.startTime}–{m.endTime}) {activeMeal?.id === m.id ? '• ACTIVE' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Search participant */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name/UID..."
              className="bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-44"
            />
          </div>

          {/* Fullscreen TV Mode Toggle */}
          <button
            id="toggle-tv-fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Open TV Fullscreen Monitor'}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

      </div>

      {/* Aggregate Metric Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-medium text-slate-400">Total Registered</span>
          <div className="text-2xl font-bold text-white mt-1">{totalParticipants}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">Across {teamData.length} teams</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-medium text-blue-400">Served So Far</span>
          <div className="text-2xl font-bold text-blue-400 mt-1">{totalServed}</div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-medium text-amber-400">Remaining to Serve</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">{totalPending}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">{100 - overallPct}% remaining</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-medium text-cyan-400">Teams Completed</span>
          <div className="text-2xl font-bold text-cyan-400 mt-1">
            {completedTeamsCount} / {teamData.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Fully served teams</p>
        </div>

      </div>

      {/* Team Cards Grid: Pending-only per PRD 4.4 */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <span>Pending Meal Verification by Team</span>
          </h2>
         
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teamData.map((team) => {
            // Apply optional search filter
            const filteredPending = searchQuery.trim()
              ? team.pendingParticipants.filter(
                  (p) =>
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    String(p.uid).includes(searchQuery)
                )
              : team.pendingParticipants;

            const isTeamDone = team.totalInTeam > 0 && team.pendingCount === 0;

            if (isTeamDone) {
              // PRD 4.4: "When a team empties out, an 'All members served' message replaces their card."
              return (
                <div
                  key={team.team}
                  className="bg-blue-950/40 border-2 border-blue-500/60 rounded-2xl p-6 text-center flex flex-col items-center justify-center space-y-3 shadow-lg shadow-blue-950/30 min-h-[220px] animate-in fade-in zoom-in-95"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300">
                    <CheckCircle className="w-7 h-7 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">{team.team}</h3>
                    <p className="text-sm font-semibold text-blue-300 mt-1">
                      All members have been served
                    </p>
                    <p className="text-xs text-blue-400/80 mt-0.5">
                      All {team.totalInTeam} members verified for {currentInspectedMeal?.name}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={team.team}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-sm hover:border-slate-700 transition-all"
              >
                {/* Team Card Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">{team.team}</h3>
                    <span className="text-xs text-slate-400">
                      {team.servedCount} of {team.totalInTeam} served ({Math.round((team.servedCount / team.totalInTeam) * 100)}%)
                    </span>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-xs font-bold">
                    {team.pendingCount} left
                  </span>
                </div>

                {/* Progress bar inside card */}
                <div className="w-full bg-slate-800 h-1 rounded-full mb-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${(team.servedCount / team.totalInTeam) * 100}%` }}
                  ></div>
                </div>

                {/* Pending Members List */}
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[220px] pr-1">
                  {filteredPending.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 text-center">
                      {searchQuery ? 'No match for search' : 'No pending participants'}
                    </p>
                  ) : (
                    filteredPending.map((p) => (
                      <div
                        key={p.uid}
                        className="p-2 bg-slate-800/60 hover:bg-slate-800 rounded-lg flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[11px] text-blue-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                            #{p.uid}
                          </span>
                          <span className="font-medium text-slate-200">{p.name}</span>
                        </div>
                        {p.dietary && p.dietary !== 'Regular' && (
                          <span className="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-900">
                            {p.dietary}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

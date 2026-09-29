import React from 'react';
import { 
  QrCode, 
  Tv, 
  Users, 
  FileSpreadsheet, 
  UserPlus, 
  Clock, 
  Volume2, 
  VolumeX, 
  LogOut, 
  CalendarClock,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { AppUser, Meal } from '../types';
import { soundService } from '../services/sound';

interface NavbarProps {
  currentTab: 'scanner' | 'dashboard' | 'participants';
  setCurrentTab: (tab: 'scanner' | 'dashboard' | 'participants') => void;
  currentUser: AppUser | null;
  activeMeal: Meal | null;
  nextMeal: Meal | null;
  currentTimeString: string;
  isTimeOverridden: boolean;
  onOpenVolunteerModal: () => void;
  onOpenScheduleModal: () => void;
  onExportExcel: () => void;
  onLogout: () => void;
  onResetData: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  currentUser,
  activeMeal,
  nextMeal,
  currentTimeString,
  isTimeOverridden,
  onOpenVolunteerModal,
  onOpenScheduleModal,
  onExportExcel,
  onLogout,
  onResetData
}) => {
  const [soundOn, setSoundOn] = React.useState(soundService.enabled);

  const toggleSound = () => {
    soundService.enabled = !soundService.enabled;
    setSoundOn(soundService.enabled);
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & App Title */}
          <div className="flex items-center space-x-3">
           
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-tight">Event Meal Tracker</span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block"></p>
            </div>
          </div>

          {/* Active Meal Status Badge & Clock */}
          <div className="hidden md:flex items-center space-x-3 bg-slate-800/80 px-2.75 py-1.75 rounded-lg border border-slate-700/60">
            <button 
              onClick={onOpenScheduleModal}
              title="Click to view/edit meal schedule & simulate clock"
              className="flex items-center space-x-2 text-xs hover:text-white transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-semibold text-slate-200">{currentTimeString}</span>
              {isTimeOverridden && (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.2 rounded border border-amber-500/30">
                  Simulation
                </span>
              )}
            </button>

            <span className="text-slate-600">|</span>

            {activeMeal ? (
              <div className="flex items-center space-x-1 text-xs text-blue-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                <span>Active: <strong className="text-white">{activeMeal.name}</strong> ({activeMeal.startTime}–{activeMeal.endTime})</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>No meal active {nextMeal ? `(Next: ${nextMeal.name} @ ${nextMeal.startTime})` : ''}</span>
              </div>
            )}
          </div>

          {/* Navigation Views */}
          <nav className="flex items-center space-x-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/60">
            <button
              id="nav-scanner-btn"
              onClick={() => setCurrentTab('scanner')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTab === 'scanner'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
             
              <span>Scanner</span>
            </button>

            <button
              id="nav-dashboard-btn"
              onClick={() => setCurrentTab('dashboard')}
              className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
             
              <span>Live Dashboard</span>
            </button>

            <button
              id="nav-participants-btn"
              onClick={() => setCurrentTab('participants')}
              className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTab === 'participants'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              
              <span className="hidden sm:inline">Wristbands & QRs</span>
              <span className="sm:hidden">QRs</span>
            </button>
          </nav>

          {/* Action Tools & User Profile */}
          <div className="flex items-center space-x-2">
            
            {/* Export Excel (.xlsx) */}
            <button
              id="export-excel-btn"
              onClick={onExportExcel}
              title="Download full meal attendance report as Excel (.xlsx)"
              className="flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all border border-blue-500/40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              title={soundOn ? 'Mute audio feedback' : 'Enable audio chime'}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              {soundOn ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            {/* Schedule & Simulation */}
            <button
              onClick={onOpenScheduleModal}
              title="Configure meal schedule & simulated clock"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <CalendarClock className="w-4 h-4" />
            </button>

            {/* Add Volunteer */}
            <button
              id="add-volunteer-btn"
              onClick={onOpenVolunteerModal}
              title="Add a volunteer login"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
            </button>

            {/* User Session Info */}
            {currentUser && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-700">
                <div className="hidden lg:block text-right">
                  <p className="text-xs font-semibold text-slate-200 leading-none">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{currentUser.role}</p>
                </div>
                <button
                  id="logout-btn"
                  onClick={onLogout}
                  title="Log out of session"
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};

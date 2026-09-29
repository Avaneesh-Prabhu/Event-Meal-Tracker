import React, { useState } from 'react';
import { Clock, X, Check, Save, RotateCcw, PlayCircle, Info } from 'lucide-react';
import { Meal } from '../types';
import { StorageService } from '../services/storage';

interface MealScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  meals: Meal[];
  onMealsUpdated: () => void;
}

export const MealScheduleModal: React.FC<MealScheduleModalProps> = ({
  isOpen,
  onClose,
  meals,
  onMealsUpdated
}) => {
  const [editableMeals, setEditableMeals] = useState<Meal[]>(meals);
  const [simulatedTime, setSimulatedTime] = useState<string>(
    StorageService.getTimeOverride() || StorageService.getCurrentClockTime()
  );
  const [isSimulating, setIsSimulating] = useState<boolean>(!!StorageService.getTimeOverride());
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleMealChange = (index: number, field: 'startTime' | 'endTime' | 'name', value: string) => {
    const updated = [...editableMeals];
    updated[index] = { ...updated[index], [field]: value };
    setEditableMeals(updated);
  };

  const handleSaveMeals = (e: React.FormEvent) => {
    e.preventDefault();
    StorageService.updateMeals(editableMeals);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    onMealsUpdated();
  };

  const handleApplySimulatedTime = (time: string) => {
    setSimulatedTime(time);
    setIsSimulating(true);
    StorageService.setTimeOverride(time);
    onMealsUpdated();
  };

  const handleResetToRealClock = () => {
    setIsSimulating(false);
    StorageService.setTimeOverride(null);
    setSimulatedTime(StorageService.getCurrentClockTime());
    onMealsUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-xl w-full p-6 text-white max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Meal Windows & Clock Settings</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-6 flex-1 pr-1">
          
          {/* Quick Time Simulator / Clock Override (Great for testing any meal anytime) */}
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PlayCircle className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Clock Simulation & Testing
                </h3>
              </div>
              {isSimulating ? (
                <span className="text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                  Simulation Active
                </span>
              ) : (
                <span className="text-[11px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                  Live System Clock
                </span>
              )}
            </div>

            

            {/* Quick Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleApplySimulatedTime('08:30')}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-center transition-colors"
              >
                <span className="block font-bold text-blue-400">Breakfast</span>
                <span className="text-[10px] text-slate-400">08:30 AM</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplySimulatedTime('13:30')}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-center transition-colors"
              >
                <span className="block font-bold text-blue-400">Lunch</span>
                <span className="text-[10px] text-slate-400">01:30 PM</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplySimulatedTime('17:00')}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-center transition-colors"
              >
                <span className="block font-bold text-blue-400">Snacks</span>
                <span className="text-[10px] text-slate-400">05:00 PM</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplySimulatedTime('20:30')}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-center transition-colors"
              >
                <span className="block font-bold text-blue-400">Dinner</span>
                <span className="text-[10px] text-slate-400">08:30 PM</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="time"
                value={simulatedTime}
                onChange={(e) => handleApplySimulatedTime(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-cyan-500 font-mono"
              />
              {isSimulating && (
                <button
                  type="button"
                  onClick={handleResetToRealClock}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs rounded-lg text-slate-200 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Use Real Device Clock</span>
                </button>
              )}
            </div>
          </div>

          {/* Editable Meal Schedule Form */}
          <form onSubmit={handleSaveMeals} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Configured Meal Windows (24-Hour Clock)
              </h3>
              {savedSuccess && (
                <span className="text-xs text-blue-400 flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Changes saved</span>
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              {editableMeals.map((meal, idx) => (
                <div key={meal.id} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={meal.name}
                      onChange={(e) => handleMealChange(idx, 'name', e.target.value)}
                      className="bg-transparent font-semibold text-sm text-white focus:outline-none focus:border-b border-blue-500"
                    />
                    <p className="text-[11px] text-slate-400">{meal.description || 'Meal counter slot'}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Start</span>
                      <input
                        type="time"
                        required
                        value={meal.startTime}
                        onChange={(e) => handleMealChange(idx, 'startTime', e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:border-blue-500"
                      />
                    </div>
                    <span className="text-slate-500 pt-3">–</span>
                    <div>
                      <span className="text-[10px] text-slate-400 block">End</span>
                      <input
                        type="time"
                        required
                        value={meal.endTime}
                        onChange={(e) => handleMealChange(idx, 'endTime', e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-1 text-[11px] text-slate-400">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>Windows crossing midnight (e.g. 22:00–02:00) are handled.</span>
              </div>

              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Schedule</span>
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
};

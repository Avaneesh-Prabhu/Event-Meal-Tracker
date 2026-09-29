import React, { useState } from 'react';
import { UserPlus, X, Shield, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { StorageService } from '../services/storage';
import { AppUser } from '../types';

interface VolunteerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVolunteerAdded: () => void;
}

export const VolunteerModal: React.FC<VolunteerModalProps> = ({
  isOpen,
  onClose,
  onVolunteerAdded
}) => {
  const [name, setName] = useState('');
  const [usn, setUsn] = useState('');
  const [password, setPassword] = useState('eventpass');
  const [role, setRole] = useState('Volunteer');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const users = StorageService.getUsers();

  const handleAddVolunteer = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!name.trim() || !usn.trim() || !password.trim()) {
      setStatusMessage({ type: 'error', text: 'Please complete all required fields.' });
      return;
    }

    const result = StorageService.addVolunteer(name, usn, password, role);
    if (result.success) {
      setStatusMessage({ type: 'success', text: `${name.trim()} has been registered as a volunteer.` });
      setName('');
      setUsn('');
      setPassword('eventpass');
      setRole('Volunteer');
      onVolunteerAdded();
    } else {
      setStatusMessage({ type: 'error', text: result.message || 'Unable to add this volunteer. Please try again.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-xl w-full p-6 text-white max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Volunteer Management</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto py-4 space-y-6 flex-1 pr-1">
          
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl flex items-center space-x-2.5 text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-blue-500/20 border border-blue-500/40 text-blue-200'
                  : 'bg-red-500/20 border border-red-500/40 text-red-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Add Form */}
          <form onSubmit={handleAddVolunteer} className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Create New Volunteer Account</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Samarth Jain"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">USN / Login ID</label>
                <input
                  type="text"
                  required
                  value={usn}
                  onChange={(e) => setUsn(e.target.value.toUpperCase())}
                  placeholder="e.g. VOL004"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono uppercase focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Password</label>
                <input
                  type="text"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a password"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Role / Designation</label>
                <input
                  type="text"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Volunteer, Treasurer"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-lg text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register Volunteer</span>
              </button>
            </div>
          </form>

          {/* Roster of registered volunteers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Registered Volunteers ({users.length})</span>
              </h3>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
              {users.map((u) => (
                <div key={u.id} className="p-3 bg-slate-800/40 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-200">{u.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-900">
                      USN: {u.usn}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">{u.role}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

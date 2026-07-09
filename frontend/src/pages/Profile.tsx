import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, User, Lock, RefreshCw } from 'lucide-react';
import { userApi } from '../api';
import { useAuth } from '../context/AuthContext';

const Profile: React.FC = () => {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    userApi.getProfile()
      .then(res => setProfile({ firstName: res.data.firstName, lastName: res.data.lastName, phone: res.data.phone || '', email: res.data.email }))
      .finally(() => setLoading(false));
  }, []);

  const setP = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProfile(p => ({ ...p, [field]: e.target.value }));

  const setPw = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPasswords(p => ({ ...p, [field]: e.target.value }));

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await userApi.updateProfile({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone });
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch {
      setProfileMsg({ type: 'error', text: 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (passwords.newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    setChangingPw(true);
    try {
      await userApi.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      setPwMsg({ type: 'success', text: 'Password changed. Please sign in again.' });
      setTimeout(logout, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPwMsg({ type: 'error', text: msg || 'Failed to change password.' });
    } finally {
      setChangingPw(false);
    }
  };

  const Msg: React.FC<{ msg: { type: string; text: string } | null }> = ({ msg }) => {
    if (!msg) return null;
    const ok = msg.type === 'success';
    return (
      <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4
        ${ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
        {ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
        {msg.text}
      </div>
    );
  };

  if (loading) {
    return <div className="flex justify-center py-16"><RefreshCw size={20} className="animate-spin text-mc-muted" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="card-surface p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-mc-gradient flex items-center justify-center text-2xl font-bold">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div>
            <h2 className="text-xl font-bold">{user?.firstName} {user?.lastName}</h2>
            <p className="text-mc-muted text-sm">{user?.email}</p>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full mt-1">
              <CheckCircle size={10} /> Verified Account
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-mc-orange" />
          <h3 className="font-semibold">Personal Information</h3>
        </div>

        <Msg msg={profileMsg} />

        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-mc-muted mb-1.5">First Name</label>
              <input type="text" value={profile.firstName} onChange={setP('firstName')} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm text-mc-muted mb-1.5">Last Name</label>
              <input type="text" value={profile.lastName} onChange={setP('lastName')} className="input-field" required />
            </div>
          </div>
          <div>
            <label className="block text-sm text-mc-muted mb-1.5">Email</label>
            <input type="email" value={profile.email} className="input-field opacity-50 cursor-not-allowed" disabled />
          </div>
          <div>
            <label className="block text-sm text-mc-muted mb-1.5">Phone</label>
            <input type="tel" value={profile.phone} onChange={setP('phone')} className="input-field" placeholder="+1 (555) 000-0000" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="card-surface p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-mc-orange" />
          <h3 className="font-semibold">Change Password</h3>
        </div>

        <Msg msg={pwMsg} />

        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="block text-sm text-mc-muted mb-1.5">Current Password</label>
            <input type="password" value={passwords.currentPassword} onChange={setPw('currentPassword')} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm text-mc-muted mb-1.5">New Password</label>
            <input type="password" value={passwords.newPassword} onChange={setPw('newPassword')} className="input-field" required minLength={8} />
          </div>
          <div>
            <label className="block text-sm text-mc-muted mb-1.5">Confirm New Password</label>
            <input type="password" value={passwords.confirmPassword} onChange={setPw('confirmPassword')} className="input-field" required />
          </div>
          <button type="submit" disabled={changingPw} className="btn-primary">
            {changingPw ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Profile;

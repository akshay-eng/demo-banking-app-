import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '' });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mc-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative w-16 h-10">
              <div className="absolute left-0 w-10 h-10 rounded-full bg-mc-red opacity-90" />
              <div className="absolute right-0 w-10 h-10 rounded-full bg-mc-orange opacity-90" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">DemoBank</h1>
          <p className="text-mc-muted mt-2 text-sm">Open your account in minutes</p>
        </div>

        <div className="card-surface p-8">
          <h2 className="text-xl font-semibold mb-6">Create your account</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-4 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-mc-muted mb-1.5">First Name</label>
                <input type="text" value={form.firstName} onChange={set('firstName')}
                  className="input-field" placeholder="John" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-mc-muted mb-1.5">Last Name</label>
                <input type="text" value={form.lastName} onChange={set('lastName')}
                  className="input-field" placeholder="Doe" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-mc-muted mb-1.5">Email Address</label>
              <input type="email" value={form.email} onChange={set('email')}
                className="input-field" placeholder="you@example.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-mc-muted mb-1.5">Phone (optional)</label>
              <input type="tel" value={form.phone} onChange={set('phone')}
                className="input-field" placeholder="+1 (555) 000-0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-mc-muted mb-1.5">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')}
                  className="input-field pr-12" placeholder="Min 8 characters" required minLength={8} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-mc-muted hover:text-white transition-colors">
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-xs text-mc-muted text-center mt-4">
            A checking & savings account with sample cards and transactions will be created automatically.
          </p>

          <div className="mt-6 pt-6 border-t border-mc-border text-center">
            <p className="text-mc-muted text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-mc-orange hover:underline font-medium">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;

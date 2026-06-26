'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Compass, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Show error message if redirected from a failed callback
    const err = searchParams.get('error');
    if (err === 'unauthorized_callback') {
      setError('Your login session expired. Please sign in again to authorize the integration.');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to login.');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign up.');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 md:py-12 relative overflow-hidden">
      {/* Background Decorative Rings */}
      <div className="absolute w-[300px] h-[300px] md:w-[450px] md:h-[450px] rounded-full bg-violet-600/10 blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-[350px] h-[350px] md:w-[500px] md:h-[500px] rounded-full bg-cyan-600/10 blur-3xl -bottom-32 -right-20 pointer-events-none" />

      {/* Main Login Box */}
      <div className="w-full max-w-md p-6 md:p-8 glass-card border border-slate-800/60 rounded-3xl relative z-10 animate-fade-in shadow-2xl">
        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 text-white mb-3 md:mb-4 shadow-lg shadow-violet-500/20 animate-float">
            <Compass className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Compass Generator
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1.5 md:mt-2">
            Sign in or register to generate customized learning paths.
          </p>
        </div>

        {/* Custom Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-900 rounded-full mb-6">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`py-1.5 md:py-2 px-4 rounded-full text-xs md:text-sm font-semibold transition-all duration-300 ${
              isLogin ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-md scale-[1.02]' : 'text-slate-400 hover:text-white'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`py-1.5 md:py-2 px-4 rounded-full text-xs md:text-sm font-semibold transition-all duration-300 ${
              !isLogin ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-md scale-[1.02]' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs md:text-sm">
            ⚠️ {error}
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Email Address</label>
              <div className="relative focus-ring-glow rounded-2xl">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500 transition-colors duration-200" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 md:py-3 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-white placeholder-slate-600 outline-none transition-all duration-200 text-xs md:text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Password</label>
              <div className="relative focus-ring-glow rounded-2xl">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500 transition-colors duration-200" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 md:py-3 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-white placeholder-slate-600 outline-none transition-all duration-200 text-xs md:text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 mt-2 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs md:text-sm font-bold rounded-2xl shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-[0.98] hover:scale-[1.01] outline-none border-none transition-all duration-200 flex justify-center items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Log In <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Name</label>
              <div className="relative focus-ring-glow rounded-2xl">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500 transition-colors duration-200" />
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 md:py-3 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-white placeholder-slate-600 outline-none transition-all duration-200 text-xs md:text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Email Address</label>
              <div className="relative focus-ring-glow rounded-2xl">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500 transition-colors duration-200" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 md:py-3 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-white placeholder-slate-600 outline-none transition-all duration-200 text-xs md:text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Password</label>
              <div className="relative focus-ring-glow rounded-2xl">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500 transition-colors duration-200" />
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 md:py-3 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-white placeholder-slate-600 outline-none transition-all duration-200 text-xs md:text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Confirm Password</label>
              <div className="relative focus-ring-glow rounded-2xl">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500 transition-colors duration-200" />
                <input
                  type="password"
                  required
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 md:py-3 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-white placeholder-slate-600 outline-none transition-all duration-200 text-xs md:text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 mt-2 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs md:text-sm font-bold rounded-2xl shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-[0.98] hover:scale-[1.01] outline-none border-none transition-all duration-200 flex justify-center items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Create Account <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030712]">
        <div className="w-12 h-12 border-4 border-violet-600/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

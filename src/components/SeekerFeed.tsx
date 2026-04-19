import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { User as DbUser } from '../lib/schema';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { MapPin, ShieldCheck, Lock, BookOpen, Heart, Sparkles, Briefcase, Clock, Utensils, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

export const SeekerFeed: React.FC = () => {
  const { firebaseUser, dbUser } = useAuth();
  const [seekers, setSeekers] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [noGender, setNoGender] = useState(false);

  useEffect(() => {
    if (!firebaseUser || !dbUser) return;

    if (!dbUser.gender) {
      setNoGender(true);
      setLoading(false);
      return;
    }

    fetch(`/api/users/seekers?firebaseUid=${encodeURIComponent(firebaseUser.uid)}`)
      .then((r) => r.json())
      .then((data: DbUser[]) => {
        setSeekers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [firebaseUser, dbUser]);

  const handleConnect = async (target: DbUser) => {
    if (!firebaseUser || !dbUser) return;

    if (!dbUser.isIntroCompleted) {
      toast.error("Complete the Marriage Readiness intro module first!");
      return;
    }

    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderFirebaseUid: firebaseUser.uid, receiverDbId: target.id }),
    });

    const result = await res.json();

    if (!res.ok) {
      if (result.message?.includes('maximum')) {
        setShowLimitModal(true);
      } else {
        toast.error(result.message ?? 'Failed to send request');
      }
      return;
    }

    const msg =
      result.status === 'PENDING_MALE_PARENT'
        ? `Request forwarded to your Wali for review`
        : `Connection request sent — awaiting ${target.displayName ?? 'their'} Wali's approval`;

    toast.success(msg);
    // Remove from local list so they can't double-send
    setSeekers((prev) => prev.filter((s) => s.id !== target.id));
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Curating your daily batch...</div>;

  if (noGender) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-rose-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-800">Complete your profile first</h2>
        <p className="text-slate-500">You need to set your gender in your profile before browsing matches.</p>
        <Link to="/profile" className="inline-flex items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 h-8 text-sm font-medium transition-colors">
          Go to Profile
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8">
      <header className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-rose-500" />
            Daily Curated Batch
          </h1>
          <p className="text-slate-600">Intentional connections based on shared values and readiness.</p>
        </div>
        {!dbUser?.isIntroCompleted && (
          <a href="/readiness">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 cursor-pointer">
              Complete Readiness Hub to connect
            </Badge>
          </a>
        )}
      </header>

      {seekers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <Heart className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500">No new profiles in your batch today. Check back tomorrow!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-12 max-w-2xl mx-auto">
          {seekers.map((seeker, index) => (
            <motion.div
              key={seeker.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="overflow-hidden border-none shadow-2xl bg-white flex flex-col">
                {/* Modesty-first visual header */}
                <div className="relative h-48 bg-slate-900 overflow-hidden">
                  {seeker.photoUrl ? (
                    <img
                      src={seeker.photoUrl}
                      className={`w-full h-full object-cover ${seeker.modestyBlurEnabled ? 'blur-3xl opacity-40 grayscale' : 'opacity-60 grayscale'}`}
                      alt="Profile"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900" />
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-full mb-3">
                      <Lock className="h-8 w-8 text-white/80" />
                    </div>
                    <Badge className="bg-rose-500 text-white border-none shadow-lg px-4 py-1">
                      {seeker.role === 'DEPENDENT' ? 'Wali Involved' : 'Verified Profile'}
                    </Badge>
                  </div>
                </div>

                <div className="p-8 -mt-6 bg-white rounded-t-3xl relative z-10 space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {seeker.displayName ?? 'Anonymous'}
                      </h3>
                      <div className="flex items-center text-slate-400 gap-4 text-sm font-medium">
                        {seeker.location && <span className="flex items-center"><MapPin className="h-4 w-4 mr-1.5" />{seeker.location}</span>}
                        {seeker.profession && <span className="flex items-center"><Briefcase className="h-4 w-4 mr-1.5" />{seeker.profession}</span>}
                      </div>
                    </div>
                    {seeker.age && (
                      <div className="text-right">
                        <span className="text-4xl font-black text-rose-500/10 block leading-none">{seeker.age}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Years Old</span>
                      </div>
                    )}
                  </div>

                  {/* Deen metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-rose-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prayer</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800">{seeker.prayerFrequency ?? 'Not specified'}</p>
                    </div>
                    <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Utensils className="h-4 w-4 text-rose-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dietary</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800">{seeker.dietaryHabits ?? 'Not specified'}</p>
                    </div>
                  </div>

                  {/* Readiness badges */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        Readiness Certifications
                      </h4>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {seeker.completedModules?.length ?? 0} Modules
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(seeker.completedModules?.length ?? 0) > 0
                        ? seeker.completedModules.map((m) => (
                            <div key={m} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50/50 border border-emerald-100 rounded-full text-[11px] font-bold text-emerald-700">
                              <BookOpen className="h-3.5 w-3.5" />
                              {m.charAt(0).toUpperCase() + m.slice(1)}
                            </div>
                          ))
                        : <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl w-full text-center">Foundational modules in progress...</p>
                      }
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100">
                    <Button
                      onClick={() => handleConnect(seeker)}
                      disabled={!dbUser?.isIntroCompleted}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white py-6 text-lg font-bold rounded-2xl disabled:opacity-40"
                    >
                      <Heart className="h-5 w-5 mr-2" />
                      {dbUser?.isIntroCompleted ? 'Send Connection Request' : 'Complete Readiness Hub First'}
                    </Button>
                    {seeker.role === 'DEPENDENT' && (
                      <p className="text-xs text-center text-slate-400 mt-3 flex items-center justify-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        This request will be reviewed by their Wali
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Active connection limit modal */}
      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connection Limit Reached</DialogTitle>
            <DialogDescription>
              NikahPath limits you to 3 active connections at a time to ensure intentional, focused courtship.
              Please close an existing connection before opening a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowLimitModal(false)} className="bg-rose-600 hover:bg-rose-700 text-white">
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

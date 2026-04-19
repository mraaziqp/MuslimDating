import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import type { User as DbUser } from '../lib/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Check, X, ShieldAlert, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

type EnrichedConnection = {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  sender: DbUser;
  receiver: DbUser;
};

export const ParentDashboard: React.FC = () => {
  const { firebaseUser, dbUser } = useAuth();
  const [pendingApprovals, setPendingApprovals] = useState<EnrichedConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser || dbUser?.role !== 'PARENT') return;

    fetch(`/api/connections/pending-parent?firebaseUid=${encodeURIComponent(firebaseUser.uid)}`)
      .then((r) => r.json())
      .then((data) => {
        setPendingApprovals(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [firebaseUser, dbUser]);

  const handleApproval = async (connectionId: string, approved: boolean) => {
    if (!firebaseUser) return;
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          action: approved ? 'approve' : 'reject',
        }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.message ?? 'Action failed.'); return; }
      toast.success(result.message);
      // Remove from pending list
      setPendingApprovals((prev) => prev.filter((c) => c.id !== connectionId));
    } catch {
      toast.error("Action failed.");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading dashboard...</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-8">
      <header className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900">Guardian Dashboard</h1>
          <p className="text-slate-600">Review and vet potential matches for your family members.</p>
        </div>
        <Badge variant="secondary" className="bg-rose-100 text-rose-700 hover:bg-rose-100">
          <ShieldAlert className="h-4 w-4 mr-1" />
          Active Vetting
        </Badge>
      </header>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="pending">Pending Review ({pendingApprovals.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {pendingApprovals.length === 0 ? (
            <Card className="border-dashed border-2 bg-slate-50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <UserCheck className="h-12 w-12 text-slate-300 mb-4" />
                <p className="text-slate-500 font-medium">No pending match requests to review.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {pendingApprovals.map((conn) => (
                <Card key={conn.id} className="overflow-hidden border-none shadow-md">
                  <div className="flex flex-col md:flex-row">
                    <div className="p-6 flex-1 space-y-4">
                      <div className="flex items-center space-x-4">
                        <Avatar className="h-16 w-16 border-2 border-rose-100">
                          <AvatarImage src={conn.sender.photoUrl} />
                          <AvatarFallback>{conn.sender.displayName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{conn.sender.displayName}</h3>
                          <p className="text-sm text-slate-500">Requesting to connect with your dependent</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mb-1">Profession</p>
                          <p className="text-sm font-bold text-slate-700">{conn.sender.profession || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mb-1">Location</p>
                          <p className="text-sm font-bold text-slate-700">{conn.sender.location || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mb-1">Prayer</p>
                          <p className="text-sm font-bold text-slate-700">{conn.sender.prayerFrequency || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mb-1">Diet</p>
                          <p className="text-sm font-bold text-slate-700">{conn.sender.dietaryHabits || 'N/A'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mb-1">Readiness</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                        {conn.sender.completedModules?.map((m: string) => (
                              <Badge key={m} variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-100">
                                {m}
                              </Badge>
                            )) || <span className="text-[10px] text-slate-400">No modules completed</span>}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mb-1">Bio</p>
                          <p className="text-xs text-slate-600 italic leading-relaxed">"{conn.sender.bio || 'No bio provided'}"</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-100 p-6 flex flex-col justify-center space-y-3 md:w-48">
                      <Button 
                        onClick={() => handleApproval(conn.id, true)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button 
                        onClick={() => handleApproval(conn.id, false)}
                        variant="outline" 
                        className="w-full border-rose-200 text-rose-600 hover:bg-rose-50"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Decline
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <div className="p-12 text-center text-slate-400">
            Historical vetting records will appear here.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

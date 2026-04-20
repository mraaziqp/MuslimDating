import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Connection, UserProfile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { MessageSquare, ChevronRight, ShieldCheck } from 'lucide-react';

export const ChatList: React.FC = () => {
  const { profile } = useAuth();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'connections'),
      where('status', '==', 'approved')
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      const connections = snap.docs.map(d => ({ id: d.id, ...d.data() } as Connection));
      
      const filtered = connections.filter(c => 
        c.senderUid === profile.uid || 
        c.receiverUid === profile.uid || 
        c.mahramUid === profile.uid
      );

      const enriched = await Promise.all(filtered.map(async (conn) => {
        const otherUid = conn.senderUid === profile.uid ? conn.receiverUid : conn.senderUid;
        const otherSnap = await getDoc(doc(db, 'users', otherUid));
        return { ...conn, otherUser: otherSnap.data() as UserProfile };
      }));

      setChats(enriched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  if (loading) return <div className="p-8 text-center">Loading chats...</div>;

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Your Conversations</h1>
        <Badge variant="outline" className="text-slate-500">
          {chats.length} / 3 Active Limit
        </Badge>
      </header>

      <div className="space-y-3">
        {chats.length === 0 ? (
          <Card className="border-dashed border-2 bg-slate-50 py-12 text-center">
            <MessageSquare className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No active conversations yet.</p>
            <p className="text-xs text-slate-400 mt-1">Connections appear here after mutual approval.</p>
          </Card>
        ) : (
          chats.map((chat) => (
            <Link key={chat.id} to={`/chat/${chat.id}`}>
              <Card className="hover:bg-slate-50 transition-colors cursor-pointer border-none shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Avatar className="h-12 w-12 border-2 border-rose-50">
                      <AvatarImage src={chat.otherUser.photoUrl} className="blur-sm grayscale" />
                      <AvatarFallback>{chat.otherUser.displayName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-slate-900">{chat.otherUser.displayName}</h3>
                      <div className="flex items-center space-x-2">
                        <p className="text-xs text-slate-500">Active Connection</p>
                        {chat.mahramUid && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-none text-[9px] px-1.5 h-4">
                            <ShieldCheck className="h-2.5 w-2.5 mr-1" />
                            Chaperoned
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

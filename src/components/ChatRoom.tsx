import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Message, Connection, UserProfile } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Send, ShieldCheck, Eye, EyeOff, Info, User as UserIcon, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export const ChatRoom: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [inputText, setInputText] = useState('');
  const [participants, setParticipants] = useState<{ name: string, role: string, isOnline: boolean }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!connectionId || !profile) return;

    const unsubConn = onSnapshot(doc(db, 'connections', connectionId), async (snap) => {
      if (!snap.exists()) {
        navigate('/chats');
        return;
      }
      const data = snap.data() as Connection;
      setConnection(data);

      const otherUid = data.senderUid === profile.uid ? data.receiverUid : data.senderUid;
      const otherSnap = await getDoc(doc(db, 'users', otherUid));
      const otherData = otherSnap.data() as UserProfile;
      setOtherUser(otherData);

      // Build participants list
      const parts = [
        { name: profile.displayName, role: profile.role, isOnline: true },
        { name: otherData.displayName, role: otherData.role, isOnline: true }
      ];
      if (data.mahramUid) {
        const mahramSnap = await getDoc(doc(db, 'users', data.mahramUid));
        if (mahramSnap.exists()) {
          const mahramData = mahramSnap.data() as UserProfile;
          parts.push({ name: mahramData.displayName, role: 'Mahram', isOnline: true });
        }
      }
      setParticipants(parts);
    });

    const q = query(
      collection(db, 'connections', connectionId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubMsgs = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    });

    return () => {
      unsubConn();
      unsubMsgs();
    };
  }, [connectionId, profile]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !connectionId || !profile) return;

    try {
      await addDoc(collection(db, 'connections', connectionId, 'messages'), {
        text: inputText,
        senderUid: profile.uid,
        createdAt: new Date().toISOString()
      });
      setInputText('');
    } catch (error) {
      console.error(error);
      toast.error("Failed to send message");
    }
  };

  const handleToggleReveal = async () => {
    if (!connection || !connectionId || !profile) return;

    const isSender = profile.uid === connection.senderUid;
    const updateField = isSender ? 'photoRevealedBySender' : 'photoRevealedByReceiver';
    const currentValue = isSender ? !!connection.photoRevealedBySender : !!connection.photoRevealedByReceiver;

    try {
      await updateDoc(doc(db, 'connections', connectionId), {
        [updateField]: !currentValue,
        updatedAt: new Date().toISOString()
      });
      
      const newStatus = !currentValue ? "shared" : "withdrawn";
      toast.info(`Photo reveal consent ${newStatus}.`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update reveal status");
    }
  };

  if (!connection || !otherUser) return <div className="p-8 text-center">Loading chat...</div>;

  const isBothRevealed = connection.photoRevealedBySender && connection.photoRevealedByReceiver;
  const myConsent = profile.uid === connection.senderUid ? !!connection.photoRevealedBySender : !!connection.photoRevealedByReceiver;
  const isMahram = profile?.uid === connection.mahramUid;

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4 h-[calc(100vh-4.5rem)] sm:h-[calc(100vh-6rem)] flex flex-col gap-2 sm:gap-4">
      {/* Participants Bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
          <Users className="h-3 w-3" />
          Participants:
        </div>
        {participants.map((p, i) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap">
            <div className={`h-2 w-2 rounded-full ${p.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-sm font-medium text-slate-700">{p.name}</span>
            <Badge variant="outline" className="text-[10px] py-0 h-4 bg-slate-50 text-slate-500 border-slate-200">
              {p.role}
            </Badge>
          </div>
        ))}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-none shadow-xl">
        <CardHeader className="border-b bg-white p-3 sm:p-4 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
            <div className="relative shrink-0">
              <div className={`p-0.5 sm:p-1 rounded-full transition-all duration-700 ${isBothRevealed ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <Avatar className={`h-10 w-10 sm:h-14 sm:w-14 transition-all duration-700 ${!isBothRevealed ? 'blur-2xl grayscale' : ''}`}>
                  <AvatarImage src={otherUser.photoUrl} />
                  <AvatarFallback>{otherUser.displayName[0]}</AvatarFallback>
                </Avatar>
                {!isBothRevealed && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-white/90 drop-shadow-md" />
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-xl font-bold text-slate-900 truncate">{otherUser.displayName}</CardTitle>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest bg-slate-50 border-slate-200">
                  {otherUser.role}
                </Badge>
                {connection.mahramUid && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 text-[10px] font-bold">
                    <ShieldCheck className="h-3 w-3" />
                    Chaperone
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isMahram && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleToggleReveal}
                className={`text-xs rounded-full transition-colors px-2 sm:px-3 ${myConsent ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'text-slate-500'}`}
              >
                {myConsent ? <Eye className="h-3 w-3 sm:mr-2" /> : <EyeOff className="h-3 w-3 sm:mr-2" />}
                <span className="hidden sm:inline">{myConsent ? 'Consent Given' : 'Unblur Photos'}</span>
              </Button>
            )}
            {isBothRevealed && (
              <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px] hidden sm:flex">
                Mutual Reveal
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0 bg-slate-50/50">
          <ScrollArea className="h-full p-4">
            <div className="space-y-4">
              {/* Chaperone System Message */}
              <div className="flex justify-center">
                <div className="bg-white border border-emerald-100 rounded-2xl p-4 max-w-md shadow-sm">
                  <div className="flex items-center justify-center text-emerald-700 text-xs font-bold mb-2 gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    MODESTY & SAFETY PROTOCOL
                  </div>
                  <p className="text-[11px] text-slate-600 text-center leading-relaxed">
                    This room is active. A designated Mahram has been assigned to this chat to ensure all interactions remain within Islamic boundaries. 
                    <br />
                    <span className="font-bold text-emerald-600">Mahram Status: Present & Monitoring</span>
                  </p>
                </div>
              </div>

              {messages.map((msg) => {
                const isMine = msg.senderUid === profile?.uid;
                const sender = participants.find(p => p.name === (isMine ? profile.displayName : otherUser.displayName));
                
                return (
                  <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
                      isMine ? 'bg-rose-600 text-white rounded-tr-none' : 'bg-white text-slate-900 rounded-tl-none'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">
                      {format(new Date(msg.createdAt), 'HH:mm')}
                    </span>
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        </CardContent>

        <div className="p-4 border-t bg-white">
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <Input 
              value={inputText} 
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isMahram ? "Mahrams have read-only access" : "Type your message..."}
              disabled={isMahram}
              className="flex-1 bg-slate-50 border-none focus-visible:ring-rose-500"
            />
            <Button 
              type="submit" 
              disabled={!inputText.trim() || isMahram}
              className="bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};


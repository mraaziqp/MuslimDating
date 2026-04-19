import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, LogOut, BookOpen, ShieldCheck, MessageSquare, UserCircle } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { auth } from '../lib/firebase';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

export const Navbar: React.FC = () => {
  const { firebaseUser, dbUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  return (
    <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center space-x-2">
            <Heart className="h-8 w-8 text-rose-600 fill-rose-600" />
            <span className="text-2xl font-bold tracking-tight text-slate-900">NikahPath</span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            {firebaseUser && dbUser && (
              <>
                {(dbUser.role === 'SOLO' || dbUser.role === 'DEPENDENT') && (
                  <Link to="/feed" className="text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors">Find Matches</Link>
                )}
                {dbUser.role === 'PARENT' && (
                  <Link to="/parent-dashboard" className="text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors">Parent Dashboard</Link>
                )}
                <Link to="/readiness" className="text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors">Readiness Hub</Link>
                <Link to="/chats" className="text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors">Messages</Link>
                <Link to="/profile" className="text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors flex items-center gap-1.5">
                  <UserCircle className="h-4 w-4" />
                  Profile
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {firebaseUser ? (
              <div className="flex items-center space-x-4">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={firebaseUser.photoURL ?? undefined} />
                  <AvatarFallback>{firebaseUser.displayName?.charAt(0) || firebaseUser.email?.charAt(0)}</AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" onClick={handleLogout}>
                  <LogOut className="h-5 w-5 text-slate-600" />
                </Button>
              </div>
            ) : (
              <Link to="/onboarding">
                <Button className="bg-rose-600 hover:bg-rose-700 text-white">Get Started</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

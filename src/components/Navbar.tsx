import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, LogOut, BookOpen, ShieldCheck, MessageSquare, UserCircle, Menu, X, LayoutDashboard } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { auth } from '../lib/firebase';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

export const Navbar: React.FC = () => {
  const { firebaseUser, dbUser } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await auth.signOut();
    setMobileMenuOpen(false);
    navigate('/');
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center space-x-2" onClick={closeMenu}>
            <Heart className="h-7 w-7 text-rose-600 fill-rose-600" />
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">NikahPath</span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            {firebaseUser && dbUser && (
              <>
                {(dbUser.role === 'SOLO' || dbUser.role === 'DEPENDENT') && (
                  <Link to="/feed" className="text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors">Find Matches</Link>
                )}
                {dbUser.role === 'PARENT' && (
                  <Link to="/parent-dashboard" className="flex items-center gap-1.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg transition-colors">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Admin
                  </Link>
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

          <div className="flex items-center space-x-2">
            {firebaseUser ? (
              <>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={firebaseUser.photoURL ?? undefined} />
                  <AvatarFallback>{firebaseUser.displayName?.charAt(0) || firebaseUser.email?.charAt(0)}</AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" onClick={handleLogout} className="hidden md:flex">
                  <LogOut className="h-5 w-5 text-slate-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  aria-label="Toggle menu"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </>
            ) : (
              <Link to="/onboarding">
                <Button className="bg-rose-600 hover:bg-rose-700 text-white text-sm px-4">Get Started</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && firebaseUser && dbUser && (
        <div className="md:hidden border-t bg-white shadow-lg">
          <div className="px-4 py-2 space-y-0.5">
            {(dbUser.role === 'SOLO' || dbUser.role === 'DEPENDENT') && (
              <Link to="/feed" onClick={closeMenu} className="flex items-center gap-3 px-3 py-3.5 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors">
                <Heart className="h-4 w-4 shrink-0" />
                Find Matches
              </Link>
            )}
            {dbUser.role === 'PARENT' && (
              <Link to="/parent-dashboard" onClick={closeMenu} className="flex items-center gap-3 px-3 py-3.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors">
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                Admin Dashboard
              </Link>
            )}
            <Link to="/readiness" onClick={closeMenu} className="flex items-center gap-3 px-3 py-3.5 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors">
              <BookOpen className="h-4 w-4 shrink-0" />
              Readiness Hub
            </Link>
            <Link to="/chats" onClick={closeMenu} className="flex items-center gap-3 px-3 py-3.5 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors">
              <MessageSquare className="h-4 w-4 shrink-0" />
              Messages
            </Link>
            <Link to="/profile" onClick={closeMenu} className="flex items-center gap-3 px-3 py-3.5 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors">
              <UserCircle className="h-4 w-4 shrink-0" />
              Profile
            </Link>
            <div className="border-t mt-1 pt-1">
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-3.5 w-full text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-rose-600 rounded-xl transition-colors">
                <LogOut className="h-4 w-4 shrink-0" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

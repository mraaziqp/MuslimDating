import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { BookOpen, CheckCircle2, PlayCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const MODULES = [
  {
    id: 'intro',
    title: 'Etiquette of Halal Courtship',
    description: 'Learn the foundational principles of Islamic interaction and boundaries.',
    duration: '15 mins',
    required: true
  },
  {
    id: 'wali',
    title: 'The Role of the Wali',
    description: 'Understanding the wisdom behind familial involvement in marriage.',
    duration: '10 mins',
    required: false
  },
  {
    id: 'finance',
    title: 'Financial Responsibilities',
    description: 'A guide to Mahr and household management in Islam.',
    duration: '20 mins',
    required: false
  }
];

export const ReadinessHub: React.FC = () => {
  const { firebaseUser, dbUser, setDbUser } = useAuth();
  const [completing, setCompleting] = useState<string | null>(null);

  const handleCompleteModule = async (moduleId: string) => {
    if (!firebaseUser || !dbUser) return;
    if (moduleId !== 'intro' && !dbUser.isIntroCompleted) {
      toast.info("Complete the intro module first to unlock others.");
      return;
    }
    if (dbUser.completedModules?.includes(moduleId)) {
      toast.info("You've already completed this module.");
      return;
    }

    setCompleting(moduleId);
    try {
      const res = await fetch('/api/users/modules/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: firebaseUser.uid, moduleId }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDbUser(updated);
      if (moduleId === 'intro') {
        toast.success("Intro module complete! You can now send connection requests.");
      } else {
        toast.success("Module completed!");
      }
    } catch {
      toast.error("Failed to record progress. Please try again.");
    } finally {
      setCompleting(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-6 sm:space-y-8">
      <header className="text-center space-y-2 py-4 sm:py-8">
        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight">Marriage Readiness Hub</h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Equip yourself with the knowledge and etiquette required for a successful, blessed union.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {MODULES.map((module, index) => (
          <motion.div
            key={module.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className={`border-none shadow-md ${module.id === 'intro' && !dbUser?.isIntroCompleted ? 'ring-2 ring-rose-500/20' : ''}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base sm:text-xl">{module.title}</CardTitle>
                    {module.required && <Badge variant="destructive" className="bg-rose-100 text-rose-600 border-none text-xs">Required</Badge>}
                  </div>
                  <CardDescription className="text-sm">{module.description}</CardDescription>
                </div>
                <div className="bg-slate-100 p-2.5 sm:p-3 rounded-full shrink-0">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-slate-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-slate-500">
                  <PlayCircle className="h-4 w-4 mr-1" />
                  {module.duration}
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t flex justify-between items-center py-4">
                {dbUser?.completedModules?.includes(module.id) ? (
                  <div className="flex items-center text-emerald-600 font-medium">
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Completed
                  </div>
                ) : (
                  <Button 
                    onClick={() => handleCompleteModule(module.id)}
                    disabled={completing === module.id || (module.id !== 'intro' && !dbUser?.isIntroCompleted)}
                    className={module.id === 'intro' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-800 hover:bg-slate-900'}
                  >
                    {completing === module.id ? 'Saving...' : 'Start Module'}
                  </Button>
                )}
                
                {module.id !== 'intro' && !dbUser?.isIntroCompleted && (
                  <div className="flex items-center text-xs text-slate-400">
                    <Lock className="h-3 w-3 mr-1" />
                    Unlock after Intro
                  </div>
                )}
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

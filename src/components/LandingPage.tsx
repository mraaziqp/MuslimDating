import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShieldCheck, Users, Lock, BookOpen, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { motion } from 'motion/react';

export const LandingPage: React.FC = () => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center px-4 py-2 rounded-full bg-rose-50 text-rose-600 text-sm font-medium border border-rose-100"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Built for the Ummah
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight"
            >
              Intentional Matchmaking <br />
              <span className="text-rose-600">Rooted in Faith</span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-slate-600 max-w-2xl mx-auto"
            >
              A platform that honors Islamic principles of modesty, privacy, and familial involvement. No swiping. Just intentional courtship.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link to="/onboarding">
                <Button size="lg" className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-6 text-lg rounded-full">
                  Start Your Journey
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/readiness">
                <Button size="lg" variant="outline" className="px-8 py-6 text-lg rounded-full border-slate-200">
                  Explore Readiness Hub
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 bg-rose-400 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-amber-400 rounded-full blur-3xl" />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Why NikahPath is Different</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                icon: <Users className="h-8 w-8 text-rose-600" />,
                title: "Familial Involvement",
                description: "Parents and Walis are integrated into the process from day one, ensuring transparency and blessing."
              },
              {
                icon: <Lock className="h-8 w-8 text-rose-600" />,
                title: "Privacy First",
                description: "Photos are blurred by default. You control who sees your identity and when."
              },
              {
                icon: <BookOpen className="h-8 w-8 text-rose-600" />,
                title: "Educational Foundation",
                description: "Complete our marriage readiness modules before connecting, ensuring everyone is prepared for the commitment."
              }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

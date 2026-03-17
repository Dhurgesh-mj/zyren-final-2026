'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Brain, User, Mail, Phone, MapPin, 
  Github, Linkedin, Globe, Code, Calendar, 
  TrendingUp, Award, Sparkles, Save, RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type Profile = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  bio?: string;
  phone?: string;
  location?: string;
  github_url?: string;
  linkedin_url?: string;
  website_url?: string;
  skills: string[];
  experience_years: number;
  education: { school: string; degree: string; year: string }[];
  preferred_languages: string[];
  total_interviews: number;
  avg_technical_score: number;
  avg_problem_solving_score: number;
  avg_communication_score: number;
  streak_days: number;
  created_at: string;
};

type ProfileStats = {
  total_interviews: number;
  completed_interviews: number;
  average_scores: {
    technical: number;
    problem_solving: number;
    communication: number;
    overall: number;
  };
  recent_interviews: any[];
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, token, isAuthenticated } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    phone: '',
    location: '',
    github_url: '',
    linkedin_url: '',
    website_url: '',
    skills: '',
    experience_years: 0,
    preferred_languages: [] as string[],
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (isAuthenticated && token) {
      loadProfile();
    }
  }, [token, isAuthenticated]);

  const loadProfile = async () => {
    if (!token) return;
    try {
      const [profileData, statsData] = await Promise.all([
        api.getProfile(token),
        api.getProfileStats(token),
      ]);
      setProfile(profileData);
      setStats(statsData);
      setFormData({
        name: profileData.name || '',
        bio: profileData.bio || '',
        phone: profileData.phone || '',
        location: profileData.location || '',
        github_url: profileData.github_url || '',
        linkedin_url: profileData.linkedin_url || '',
        website_url: profileData.website_url || '',
        skills: (profileData.skills || []).join(', '),
        experience_years: profileData.experience_years || 0,
        preferred_languages: profileData.preferred_languages || [],
      });
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const data = {
        ...formData,
        skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
      };
      await api.updateProfile(data, token);
      setEditMode(false);
      await loadProfile();
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-400';
    if (score >= 6) return 'text-amber-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-6 bg-[#0a0a0f]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.1] text-white/80 px-4 py-2 rounded-lg text-sm font-medium border border-white/[0.08] transition-colors"
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Profile Header */}
        <div className="glass-card mb-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-4xl font-bold text-white shadow-lg shadow-indigo-500/30">
              {profile?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            
            <div className="flex-1">
              {editMode ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="text-2xl font-bold text-white bg-transparent border-b border-white/20 focus:border-indigo-500 outline-none w-full mb-2"
                  placeholder="Your name"
                />
              ) : (
                <h1 className="text-2xl font-bold text-white mb-2">{profile?.name}</h1>
              )}
              
              {editMode ? (
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="text-white/60 bg-transparent border border-white/10 rounded-lg p-2 w-full outline-none focus:border-indigo-500"
                  placeholder="Tell us about yourself..."
                  rows={2}
                />
              ) : (
                <p className="text-white/60 mb-4">{profile?.bio || 'No bio yet'}</p>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-white/40">
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" /> {profile?.email}
                </span>
                {profile?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> {profile.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> Joined {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="glass-card text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-3">
              <Brain className="w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats?.completed_interviews || 0}</p>
            <p className="text-xs text-white/40">Interviews</p>
          </div>
          
          <div className="glass-card text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats?.average_scores.overall.toFixed(1) || '0.0'}</p>
            <p className="text-xs text-white/40">Avg Score</p>
          </div>
          
          <div className="glass-card text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
              <Award className="w-6 h-6 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-white">{profile?.streak_days || 0}</p>
            <p className="text-xs text-white/40">Day Streak</p>
          </div>
          
          <div className="glass-card text-center">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mx-auto mb-3">
              <Code className="w-6 h-6 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white">{profile?.experience_years || 0}</p>
            <p className="text-xs text-white/40">Years Exp</p>
          </div>
        </div>

        {/* Detailed Scores */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="glass-card">
            <h3 className="text-sm font-medium text-white/60 mb-4">Score Breakdown</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">Technical</span>
                  <span className={getScoreColor(stats?.average_scores.technical || 0)}>
                    {stats?.average_scores.technical.toFixed(1) || '0.0'}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full">
                  <div 
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${((stats?.average_scores.technical || 0) / 10) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">Problem Solving</span>
                  <span className={getScoreColor(stats?.average_scores.problem_solving || 0)}>
                    {stats?.average_scores.problem_solving.toFixed(1) || '0.0'}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full">
                  <div 
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${((stats?.average_scores.problem_solving || 0) / 10) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">Communication</span>
                  <span className={getScoreColor(stats?.average_scores.communication || 0)}>
                    {stats?.average_scores.communication.toFixed(1) || '0.0'}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full">
                  <div 
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${((stats?.average_scores.communication || 0) / 10) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="glass-card">
            <h3 className="text-sm font-medium text-white/60 mb-4">Skills</h3>
            {editMode ? (
              <input
                type="text"
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                placeholder="Python, JavaScript, React..."
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {(profile?.skills || []).length > 0 ? (
                  profile?.skills?.map((skill, i) => (
                    <span key={i} className="badge-brand">{skill}</span>
                  ))
                ) : (
                  <p className="text-white/30 text-sm">No skills added</p>
                )}
              </div>
            )}
          </div>

          {/* Languages */}
          <div className="glass-card">
            <h3 className="text-sm font-medium text-white/60 mb-4">Preferred Languages</h3>
              <div className="flex flex-wrap gap-2">
                {(profile?.preferred_languages || []).length > 0 ? (
                  profile?.preferred_languages?.map((lang, i) => (
                    <span key={i} className="badge bg-white/10 text-white/70">{lang}</span>
                  ))
                ) : (
                <p className="text-white/30 text-sm">No preferences</p>
              )}
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="glass-card">
          <h3 className="text-sm font-medium text-white/60 mb-4">Links</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {editMode ? (
              <>
                <input
                  type="text"
                  value={formData.github_url}
                  onChange={(e) => setFormData({ ...formData, github_url: e.target.value })}
                  className="bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  placeholder="GitHub URL"
                />
                <input
                  type="text"
                  value={formData.linkedin_url}
                  onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  className="bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  placeholder="LinkedIn URL"
                />
                <input
                  type="text"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  className="bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  placeholder="Website URL"
                />
              </>
            ) : (
              <>
                <a href={profile?.github_url || '#'} className="flex items-center gap-2 text-white/60 hover:text-white">
                  <Github className="w-4 h-4" /> {profile?.github_url || 'Not set'}
                </a>
                <a href={profile?.linkedin_url || '#'} className="flex items-center gap-2 text-white/60 hover:text-white">
                  <Linkedin className="w-4 h-4" /> {profile?.linkedin_url || 'Not set'}
                </a>
                <a href={profile?.website_url || '#'} className="flex items-center gap-2 text-white/60 hover:text-white">
                  <Globe className="w-4 h-4" /> {profile?.website_url || 'Not set'}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

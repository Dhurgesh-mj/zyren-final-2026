-- InterviewLens Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem TEXT NOT NULL,
    problem_title VARCHAR(255) NOT NULL DEFAULT 'Untitled Problem',
    language VARCHAR(50) NOT NULL DEFAULT 'python',
    code_snapshot TEXT,
    transcript TEXT,
    ast_analysis JSONB,
    technical_score INTEGER CHECK (technical_score >= 1 AND technical_score <= 10),
    problem_solving_score INTEGER CHECK (problem_solving_score >= 1 AND problem_solving_score <= 10),
    communication_score INTEGER CHECK (communication_score >= 1 AND communication_score <= 10),
    overall_score DECIMAL(3,1),
    feedback TEXT,
    scorecard JSONB,
    status VARCHAR(50) DEFAULT 'in_progress',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS code_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    language VARCHAR(50) NOT NULL,
    analysis JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status);
CREATE INDEX IF NOT EXISTS idx_interview_messages_interview_id ON interview_messages(interview_id);
CREATE INDEX IF NOT EXISTS idx_code_snapshots_interview_id ON code_snapshots(interview_id);

-- Insert demo user
INSERT INTO users (id, name, email, password_hash) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Demo User', 'demo@interviewlens.dev', '$2b$12$LJ3/dGH.GbJkGJyV7qx1JOQ0K5bN0s0M9s5tX8qE9TkJ5x5E5Q5a6')
ON CONFLICT (email) DO NOTHING;

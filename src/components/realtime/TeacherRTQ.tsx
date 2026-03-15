import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './teacherRTQ.css';

type ScoreEntry = { name: string; role: 'Student' | 'Teacher'; score: number };
type Scores = Record<string, ScoreEntry>;

const BACKEND_URL = import.meta.env.VITE_RTQ_BACKEND_URL || 'http://localhost:3010';

export default function TeacherRTQ() {
  const socketRef = useRef<Socket | null>(null);
  const [scores, setScores] = useState<Scores>({});

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    const name = 'Teacher';
    socket.emit('joinQuiz', { name, role: 'Teacher' });
    socket.on('updateScores', (incoming: Scores) => setScores(incoming));
    return () => socket.disconnect();
  }, []);

  const students = useMemo(() => Object.values(scores).filter(s => s.role === 'Student'), [scores]);
  const average = useMemo(() => {
    if (students.length === 0) return 0;
    return Math.round(students.reduce((sum, s) => sum + (s.score || 0), 0) / students.length);
  }, [students]);

  const sorted = useMemo(() => [...students].sort((a, b) => b.score - a.score), [students]);

  return (
    <div className="teacher-root">
      <div className="dashboard-container slide-in">
        <div className="header">
          <h1>🎓 Teacher Dashboard</h1>
          <p>Control and monitor your quiz session</p>
        </div>
        <div className="controls-section">
          <h3 className="section-title">🎮 Quiz Controls</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{students.length}</div>
              <div className="stat-label">Students Connected</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{average}%</div>
              <div className="stat-label">Average Score</div>
            </div>
          </div>
        </div>

        <div className="grid-layout">
          <div className="responses-section">
            <h3 className="section-title">💬 Student Responses</h3>
            <div className="log-container">
              <pre id="log">Waiting for student responses...</pre>
            </div>
          </div>

          <div className="scoreboard-section">
            <h3 className="section-title">🏆 Live Scoreboard</h3>
            <div id="scoreBoard" className="scoreboard">
              {sorted.length === 0 ? (
                <div className="empty-state">No students connected yet...</div>
              ) : (
                sorted.map((s, index) => (
                  <div key={`${s.name}-${index}`} className="score-card slide-in" style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="student-info">
                      <div className="student-name">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤'} {s.name}</div>
                      <div className="student-role">{s.role}</div>
                    </div>
                    <div className="student-score">{s.score}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



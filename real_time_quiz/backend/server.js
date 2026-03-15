const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

// ---- ADD Multer for Uploads ----
const multer = require('multer');
const fs = require('fs');

// Make sure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Use student name and timestamp for filename if provided
    const studentName = req.body.student ? req.body.student.replace(/\s+/g, '_') : 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `${studentName}_${timestamp}${ext}`);
  }
});
const upload = multer({ storage: storage });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST']
  }
});

// MongoDB Connection (optional)
let dbEnabled = false;
mongoose.connect('mongodb://localhost:27017/quizDB')
  .then(() => {
    dbEnabled = true;
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    dbEnabled = false;
    console.error('MongoDB connection error (continuing without DB):', err.message);
  });

const db = mongoose.connection;
db.on('error', () => {/* ignore when optional */});

// Student Response Schema & Model
const studentResponseSchema = new mongoose.Schema({
  studentName: String,
  answers: [String],
  correctAnswersCount: Number,
  totalQuestions: Number,
  percentage: Number,
  passed: Boolean,
  submittedAt: {
    type: Date,
    default: Date.now
  }
});

const StudentResponse = mongoose.model('StudentResponse', studentResponseSchema);

// Quiz Questions
const questions = [
  {
    question: "What is the capital of France?",
    options: ["Berlin", "Madrid", "Paris", "Rome"],
    correctAnswer: "Paris",
    explanation: "Paris is the capital of France."
  },
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Earth", "Mars", "Jupiter", "Venus"],
    correctAnswer: "Mars",
    explanation: "Mars is known as the Red Planet."
  },
  {
    question: "Who wrote the play 'Hamlet'?",
    options: ["William Shakespeare", "Charles Dickens", "Jane Austen", "Leo Tolstoy"],
    correctAnswer: "William Shakespeare",
    explanation: "'Hamlet' was written by William Shakespeare."
  },
  {
    question: "What is the smallest prime number?",
    options: ["0", "1", "2", "3"],
    correctAnswer: "2",
    explanation: "2 is the smallest and only even prime number."
  }
];

let scores = {};

// Serve static files from frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// ---- ADD: Upload Endpoint ----
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  // Student name is available in req.body.student
  console.log(`Received video from: ${req.body.student || 'unknown'} (${req.file.filename})`);
  res.status(200).send('Video uploaded successfully.');
});

// Routes
app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/teacher.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/student.html'));
});

app.get('/', (req, res) => {
  res.redirect('/student');
});

// Optional: View all saved responses (for testing)
app.get('/api/results', async (req, res) => {
  const results = await StudentResponse.find({});
  res.json(results);
});

// Expose questions for client fallback
app.get('/api/questions', (req, res) => {
  res.json(questions);
});

function sendAllQuestions(socket) {
  socket.emit('questions', questions);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinQuiz', ({ name, role }) => {
    scores[socket.id] = { name, role, score: 0 };
    io.emit('updateScores', scores);
    if (role === 'Student') {
      sendAllQuestions(socket);
    }
  });

  socket.on('submitAllAnswers', ({ answers, name }) => {
    let correctCount = 0;
    answers.forEach((ans, i) => {
      if (ans === questions[i]?.correctAnswer) {
        correctCount++;
      }
    });

    const total = questions.length;
    const percentage = Math.round((correctCount / total) * 100);
    const passed = percentage >= 40;

    let submittedAtTs = Date.now();
    if (dbEnabled) {
      const response = new StudentResponse({
        studentName: name,
        answers,
        correctAnswersCount: correctCount,
        totalQuestions: total,
        percentage,
        passed,
        submittedAt: submittedAtTs
      });
      response.save().then(() => {
        submittedAtTs = response.submittedAt?.getTime?.() || submittedAtTs;
      }).catch(err => console.error('Failed to save submission:', err));
    }

    if (scores[socket.id]) {
      scores[socket.id].score = percentage;
      scores[socket.id].name = name;
    }

    const resultPayload = {
      score: percentage,
      total,
      answers: questions.map((q, idx) => ({
        question: q.question,
        correctAnswer: q.correctAnswer,
        userAnswer: answers[idx],
        explanation: q.explanation
      })),
      submittedAt: submittedAtTs
    };

    socket.emit('quizResults', resultPayload);
    io.emit('quizResults', resultPayload);

    io.emit('updateScores', scores);
  });

  socket.on('disconnect', () => {
    delete scores[socket.id];
    io.emit('updateScores', scores);
  });
});

const PORT = process.env.PORT || 3010;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

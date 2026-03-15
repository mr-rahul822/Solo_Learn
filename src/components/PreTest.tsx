import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

type Props = {
  courseName: string;
  onComplete: (level: 'low' | 'medium' | 'hard', finalScore: number) => void;
};

type Question = {
  question: string;
  options: string[];
  answer: string;
};

const PreTest: React.FC<Props> = ({ courseName, onComplete }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState('');
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [timer, setTimer] = useState(60);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const quizRef = useRef<HTMLDivElement>(null);

  const correctMessages = [
    "✅ Correct! You're on fire! 🔥",
    "🎉 Well done! Crushing it! 🚀",
    "💡 Brilliant answer! Keep going!",
    "✅ Superb! Python master in progress! 🐍",
    "🎯 Nailed it! Fantastic work! 🌟",
  ];

  const incorrectMessages = [
    "❌ Oops! You’ve got this! 💪",
    "😅 Mistakes are part of learning! 🌱",
    "🚀 No worries! You're improving step by step!",
    "📚 Keep going! Progress is happening! 🔄",
    "💊 Stay strong! Python pro loading... ⏳",
  ];

  const getGeminiFeedback = async (question: string, correct: string, user: string) => {
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:3000/api/gemini', {
        prompt: `Explain in 2-3 lines why this answer is wrong and what the correct concept is. Use emojis.\nQuestion: ${question}\nCorrect Answer: ${correct}\nUser Answer: ${user}`,
      });
      setFeedback(res.data.reply || '✅ Got it!');
    } catch {
      setFeedback('❌ Could not get explanation from AI 🤖.');
    }
    setLoading(false);
  };

  const parseQuestionsFromText = (text: string): Question[] => {
    const blocks = text.trim().split(/\n(?=\d+\.)/g);
    return blocks.map((block) => {
      const lines = block.trim().split('\n');
      const questionLine = lines.find((line) => /^\d+\./.test(line)) || '';
      const options = lines.filter((line) => /^[a-d]\)/i.test(line)).map((line) => line.slice(3).trim());
      const answerLine = lines.find((line) => /Correct Answer:|Answer:/i.test(line));
      const correctLetter = answerLine?.match(/[a-d]/i)?.[0]?.toLowerCase();
      return {
        question: questionLine.replace(/^\d+\.\s*/, ''),
        options,
        answer: options['abcd'.indexOf(correctLetter!)],
      };
    }).filter(q => q.question && q.options.length === 4 && q.answer);
  };

  // Fallback questions for when API fails
  const getFallbackQuestions = (courseName: string): Question[] => {
    const fallbackQuestions = {
      'Python': [
        {
          question: 'What is Python?',
          options: ['A programming language', 'A snake', 'A game', 'A website'],
          answer: 'A programming language'
        },
        {
          question: 'How do you print "Hello World" in Python?',
          options: ['print("Hello World")', 'echo "Hello World"', 'console.log("Hello World")', 'printf("Hello World")'],
          answer: 'print("Hello World")'
        },
        {
          question: 'What symbol is used for comments in Python?',
          options: ['//', '/*', '#', '--'],
          answer: '#'
        },
        {
          question: 'Which data type is used to store text in Python?',
          options: ['int', 'float', 'str', 'bool'],
          answer: 'str'
        },
        {
          question: 'How do you create a variable in Python?',
          options: ['var x = 5', 'let x = 5', 'x = 5', 'const x = 5'],
          answer: 'x = 5'
        }
      ],
      'JavaScript': [
        {
          question: 'What is JavaScript?',
          options: ['A programming language', 'A database', 'An operating system', 'A web browser'],
          answer: 'A programming language'
        },
        {
          question: 'How do you declare a variable in JavaScript?',
          options: ['var x = 5', 'x = 5', 'variable x = 5', 'let x = 5'],
          answer: 'var x = 5'
        },
        {
          question: 'What does console.log() do?',
          options: ['Creates a file', 'Prints to console', 'Deletes data', 'Connects to database'],
          answer: 'Prints to console'
        },
        {
          question: 'Which symbol is used for strict equality in JavaScript?',
          options: ['==', '===', '=', '!='],
          answer: '==='
        },
        {
          question: 'What is an array in JavaScript?',
          options: ['A function', 'A collection of data', 'A variable', 'A loop'],
          answer: 'A collection of data'
        }
      ],
      'HTML': [
        {
          question: 'What does HTML stand for?',
          options: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyperlink and Text Markup Language'],
          answer: 'Hyper Text Markup Language'
        },
        {
          question: 'Which tag is used for the main heading?',
          options: ['<h1>', '<head>', '<header>', '<title>'],
          answer: '<h1>'
        },
        {
          question: 'How do you create a link in HTML?',
          options: ['<link>', '<a>', '<href>', '<url>'],
          answer: '<a>'
        },
        {
          question: 'What tag is used for images?',
          options: ['<img>', '<image>', '<picture>', '<photo>'],
          answer: '<img>'
        },
        {
          question: 'Which attribute is used to specify the source of an image?',
          options: ['src', 'href', 'link', 'source'],
          answer: 'src'
        }
      ],
      'CSS': [
        {
          question: 'What does CSS stand for?',
          options: ['Cascading Style Sheets', 'Computer Style Sheets', 'Creative Style Sheets', 'Colorful Style Sheets'],
          answer: 'Cascading Style Sheets'
        },
        {
          question: 'How do you change the text color in CSS?',
          options: ['text-color', 'color', 'font-color', 'text-style'],
          answer: 'color'
        },
        {
          question: 'Which property is used to change the background color?',
          options: ['bg-color', 'background-color', 'color', 'bg'],
          answer: 'background-color'
        },
        {
          question: 'How do you add a border in CSS?',
          options: ['border-style', 'border', 'border-width', 'border-color'],
          answer: 'border'
        },
        {
          question: 'Which selector targets all elements?',
          options: ['*', 'all', 'every', 'global'],
          answer: '*'
        }
      ],
      'Java': [
        {
          question: 'What is Java?',
          options: ['A programming language', 'A coffee brand', 'An operating system', 'A web browser'],
          answer: 'A programming language'
        },
        {
          question: 'How do you declare a variable in Java?',
          options: ['var x = 5', 'int x = 5', 'x = 5', 'variable x = 5'],
          answer: 'int x = 5'
        },
        {
          question: 'What is the main method in Java?',
          options: ['public static void main()', 'main()', 'public main()', 'static main()'],
          answer: 'public static void main()'
        },
        {
          question: 'Which keyword is used for inheritance in Java?',
          options: ['extends', 'inherits', 'implements', 'super'],
          answer: 'extends'
        },
        {
          question: 'What is an object in Java?',
          options: ['A class', 'An instance of a class', 'A method', 'A variable'],
          answer: 'An instance of a class'
        }
      ]
    };

    return fallbackQuestions[courseName as keyof typeof fallbackQuestions] || fallbackQuestions['Python'];
  };

  const fetchQuestions = async (retryCount = 0) => {
    setLoadingQuestions(true);
    try {
      const res = await axios.post('http://localhost:3000/api/generate-question', {
        type: 'pretest',
        context: `Generate 10 beginner questions for ${courseName}. Format: 1. Question a) Option b) Option c) Option d) Option Answer: a`,
      });
      const parsed = parseQuestionsFromText(res.data.generatedQuestion || '');
      if (parsed.length > 0) {
        setQuestions(parsed);
      } else {
        throw new Error('No questions parsed from API response');
      }
    } catch (error: any) {
      console.error(`❌ Failed to fetch AI questions (attempt ${retryCount + 1}):`, error);
      
      // Retry once if it's a quota error
      if (retryCount === 0 && (error.response?.status === 429 || error.response?.data?.error?.includes('quota'))) {
        console.log('🔄 Retrying after quota error...');
        setTimeout(() => fetchQuestions(retryCount + 1), 2000); // Wait 2 seconds before retry
        return;
      }
      
      console.log('🔄 Using fallback questions instead...');
      // Use fallback questions when API fails
      const fallbackQuestions = getFallbackQuestions(courseName);
      setQuestions(fallbackQuestions);
    }
    setLoadingQuestions(false);
  };

  useEffect(() => {
    fetchQuestions();
  }, [courseName]);

  useEffect(() => {
    if (!selected && timer > 0 && started) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    }
    if (timer === 0 && !selected && started) {
      handleSelect('');
    }
  }, [timer, selected, started]);

  useEffect(() => setTimer(60), [current]);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const handleBeginTest = async () => {
    try {
      if (quizRef.current && !document.fullscreenElement) {
        await quizRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (error) {
      console.error('Fullscreen failed:', error);
    }
    setStarted(true);
  };

  const handleSkipTest = () => {
    // Skip the PreTest and go directly to the course
    const level = 'low'; // Default level when skipping
    const defaultScore = 0; // Default score when skipping
    onComplete(level, defaultScore);
  };

  const handleSelect = async (option: string) => {
    if (selected) return;
    setSelected(option);
    const currentQ = questions[current];
    const isCorrect = option === currentQ.answer;
    const newScore = isCorrect ? score + 1 : score;

    if (isCorrect) {
      setScore(newScore);
      setFeedback(correctMessages[Math.floor(Math.random() * correctMessages.length)]);
    } else {
      setFeedback(incorrectMessages[Math.floor(Math.random() * incorrectMessages.length)]);
      await getGeminiFeedback(currentQ.question, currentQ.answer, option);
    }

    setTimeout(() => {
      if (current < questions.length - 1) {
        setCurrent(current + 1);
        setSelected('');
        setFeedback('');
      } else {
        const level = newScore >= 13 ? 'hard' : newScore >= 8 ? 'medium' : 'low';
        axios.post('http://localhost:3000/api/pretest', { score: newScore, level });
        if (document.fullscreenElement) document.exitFullscreen().then(() => setIsFullscreen(false));
        onComplete(level, newScore);
      }
    }, isCorrect ? 1000 : 3500);
  };

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(current + 1);
      setSelected('');
      setFeedback('');
      setTimer(60);
    } else {
      const level = score >= 13 ? 'hard' : score >= 8 ? 'medium' : 'low';
      axios.post('http://localhost:3000/api/pretest', { score, level });
      if (document.fullscreenElement) document.exitFullscreen().then(() => setIsFullscreen(false));
      onComplete(level, score);
    }
  };

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${seconds % 60 < 10 ? '0' : ''}${seconds % 60}`;

  if (loadingQuestions) return <div className="text-white text-center mt-10 text-lg">🤖 Generating questions for <strong>{courseName}</strong>...</div>;
  if (!questions.length) return (
    <div className="text-center mt-10 p-6 bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl max-w-md mx-auto">
      <div className="text-red-400 text-lg mb-4">⚠️ Failed to load questions</div>
      <p className="text-white/70 text-sm mb-4">This might be due to API quota limits or server issues.</p>
      <div className="space-y-3">
        <button 
          onClick={() => fetchQuestions()} 
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors mr-2"
        >
          🔄 Retry API
        </button>
        <button 
          onClick={() => window.location.reload()} 
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh Page
        </button>
      </div>
    </div>
  );

  if (!started) {
    return (
      <div ref={quizRef} className="min-h-screen flex items-center justify-center bg-white px-4 py-10">
        <div className="max-w-md bg-white rounded-xl p-10 text-center space-y-4">
          <h1 className="text-2xl font-semibold mb-2">Welcome to the Pre-Test 🧠</h1>
          <button
            onClick={handleBeginTest}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700"
          >
            Start Quiz
          </button>
          <button
            onClick={handleSkipTest}
            className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 mt-3"
          >
            Skip Pre-Test
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[current];
  return (
    <div ref={quizRef} className="min-h-screen flex items-center justify-center bg-[#F0F4FD] px-4 py-10">
      <div className="w-full max-w-xl bg-white px-6 py-8 rounded-3xl shadow-2xl border-4 border-[#A0C4FF]">
        <div className="text-right text-sm font-bold text-[#FF595E]">⏰ {formatTime(timer)}</div>
        <h2 className="text-center text-2xl font-bold text-[#4361EE] mb-4">🚀 Quiz Time!</h2>
        <div className="text-sm text-gray-600 mb-2">Question {current + 1} of {questions.length}</div>
        <div className="text-lg font-semibold mb-6 text-[#3A0CA3]">{currentQ.question}</div>
        <div className="space-y-4">
          {currentQ.options.map((opt, idx) => {
            const isCorrect = selected && opt === currentQ.answer;
            const isSelected = selected && opt === selected;
            const baseStyle = 'w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all';
            let btnStyle = 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800';
            if (selected) {
              if (isCorrect) btnStyle = 'bg-[#06D6A0] text-white border-[#05C292]';
              else if (isSelected) btnStyle = 'bg-[#EF476F] text-white border-[#E63946]';
              else btnStyle = 'bg-gray-100 text-gray-400 border-gray-200';
            }
            return (
              <button key={idx} onClick={() => handleSelect(opt)} disabled={!!selected} className={`${baseStyle} ${btnStyle}`}>
                {String.fromCharCode(97 + idx)}) {opt}
              </button>
            );
          })}
        </div>
        {feedback && <div className="mt-5 bg-[#FFD166] text-[#4B4B4B] text-sm p-4 rounded-md border-l-4 border-yellow-500"><strong>✨ AI Feedback:</strong> {feedback}</div>}
        {selected && <div className="mt-6 text-center"><button onClick={handleNext} className="bg-[#4361EE] hover:bg-[#3A0CA3] text-white px-6 py-2 rounded-xl text-sm">Next Question →</button></div>}
      </div>
    </div>
  );
};

export default PreTest;

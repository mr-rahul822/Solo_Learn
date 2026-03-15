import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Confetti from 'react-confetti';
import './studentRTQ.css';

type Question = {
	question: string;
	options: string[];
	correctAnswer: string;
	explanation: string;
};

const BACKEND_URL = import.meta.env.VITE_RTQ_BACKEND_URL || 'http://localhost:3010';

export default function StudentRTQ() {
	const socketRef = useRef<Socket | null>(null);
	const [studentName, setStudentName] = useState('');
	const [started, setStarted] = useState(false);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [answers, setAnswers] = useState<(string | null)[]>([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [timer, setTimer] = useState(60);
	const [resultsHtml, setResultsHtml] = useState('');
	const [recordingMsg, setRecordingMsg] = useState('');
	const [finalScore, setFinalScore] = useState<number | null>(null);
	const [showConfetti, setShowConfetti] = useState(false);

	const quizContainerRef = useRef<HTMLDivElement | null>(null);
	const webcamOverlayRef = useRef<HTMLDivElement | null>(null);
	const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

	const recordingRef = useRef(false);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);
	const faceMissingSecondsRef = useRef(0);
	const faceCheckIntervalRef = useRef<number | undefined>(undefined);

	// Connect socket once
	useEffect(() => {
		const socket = io(BACKEND_URL, { transports: ['websocket'] });
		socketRef.current = socket;

		socket.on('questions', (qs: Question[]) => {
			setQuestions(qs);
			setAnswers(new Array(qs.length).fill(null));
			setCurrentIndex(0);
			setTimer(60);
		});

		socket.on('quizResults', (data: any) => {
			if (typeof data?.score === 'number') {
				setFinalScore(data.score);
				if (data.score >= 40) setShowConfetti(true);
			}
		});

		// Fallback fetch if socket questions don't arrive within 2s
		const fallbackId = window.setTimeout(async () => {
			try {
				const res = await fetch(`${BACKEND_URL}/api/questions`);
				if (res.ok) {
					const qs: Question[] = await res.json();
					if (qs?.length) {
						setQuestions(qs);
						setAnswers(new Array(qs.length).fill(null));
						setCurrentIndex(0);
						setTimer(60);
					}
				}
			} catch {}
		}, 2000);

		return () => {
			clearTimeout(fallbackId);
			socket.disconnect();
		};
	}, []);

	// countdown timer
	useEffect(() => {
		if (!started || questions.length === 0) return;
		if (timer <= 0) {
			submitAllAnswers();
			stopRecording();
			return;
		}
		const id = window.setTimeout(() => setTimer((t) => t - 1), 1000);
		return () => clearTimeout(id);
	}, [started, timer, questions.length]);

	async function handleStart(e: React.FormEvent) {
		e.preventDefault();
		if (!studentName.trim()) return;
		setStarted(true);
		socketRef.current?.emit('joinQuiz', { name: studentName.trim(), role: 'Student' });
		await startRecording();
	}

	function selectOption(option: string) {
		setAnswers((prev) => {
			const next = [...prev];
			next[currentIndex] = option;
			return next;
		});
	}

	function nextQuestion() {
		if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
	}

	function progressPercent() {
		if (questions.length === 0) return 0;
		return ((currentIndex + 1) / questions.length) * 100;
	}

	async function startRecording() {
		try {
			if (quizContainerRef.current && (quizContainerRef.current as any).requestFullscreen) {
				await (quizContainerRef.current as any).requestFullscreen();
			}

			if (webcamOverlayRef.current) webcamOverlayRef.current.style.display = 'block';

			const webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
			if (webcamVideoRef.current) webcamVideoRef.current.srcObject = webcamStream as any;

			const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });

			const container = quizContainerRef.current!;
			const canvas = document.createElement('canvas');
			canvas.width = container.offsetWidth;
			canvas.height = container.offsetHeight;
			const ctx = canvas.getContext('2d')!;

			const screenVideo = document.createElement('video');
			screenVideo.srcObject = screenStream as any;
			screenVideo.play();

			const webcamFeed = document.createElement('video');
			webcamFeed.srcObject = webcamStream as any;
			webcamFeed.play();

			function drawFrame() {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
				ctx.save();
				ctx.beginPath();
				ctx.rect(canvas.width - 220, canvas.height - 170, 200, 150);
				ctx.clip();
				ctx.drawImage(webcamFeed, canvas.width - 220, canvas.height - 170, 200, 150);
				ctx.restore();
				if (recordingRef.current) requestAnimationFrame(drawFrame);
			}

			recordingRef.current = true;
			drawFrame();

			const mergedStream = (canvas as any).captureStream(25);
			const mediaRecorder = new MediaRecorder(mergedStream, { mimeType: 'video/webm' });
			mediaRecorderRef.current = mediaRecorder;
			recordedChunksRef.current = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) recordedChunksRef.current.push(e.data);
			};
			mediaRecorder.onstop = handleRecordingStop;
			mediaRecorder.start();
			setRecordingMsg('Recording in progress...');

			const modelsLoaded = await loadFaceModels();
			if (modelsLoaded) startFaceDetection();
		} catch (err: any) {
			setRecordingMsg('Recording failed: ' + (err?.message || String(err)));
		}
	}

	function stopRecording() {
		if (!recordingRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
		recordingRef.current = false;
		mediaRecorderRef.current.stop();
		setRecordingMsg('Processing recording...');
		stopFaceDetection();
	}

	async function handleRecordingStop() {
		setRecordingMsg('Uploading recording...');
		const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
		const formData = new FormData();
		formData.append('video', blob, 'quiz-recording.webm');
		formData.append('student', studentName);
		try {
			const res = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });
			setRecordingMsg(res.ok ? 'Recording uploaded successfully ✔️' : 'Upload failed.');
		} catch (e: any) {
			setRecordingMsg('Upload error: ' + (e?.message || String(e)));
		}
	}

	async function loadFaceModels(): Promise<boolean> {
		const w = window as any;
		if (!w.faceapi) return false; // face-api loaded via index.html CDN
		try {
			await w.faceapi.nets.tinyFaceDetector.loadFromUri(`${BACKEND_URL}/models`);
			return true;
		} catch (e) {
			setRecordingMsg('Face models not found on server; skipping face detection');
			return false;
		}
	}

	function startFaceDetection() {
		const w = window as any;
		if (!w.faceapi || !webcamVideoRef.current) return;
		faceCheckIntervalRef.current = window.setInterval(async () => {
			const detections = await w.faceapi.detectAllFaces(webcamVideoRef.current, new w.faceapi.TinyFaceDetectorOptions());
			if (!detections.length) {
				faceMissingSecondsRef.current += 1;
				if (faceMissingSecondsRef.current >= 5) {
					alert('Face not detected for 5 seconds! Quiz will be auto-submitted.');
					submitAllAnswers();
					stopRecording();
				}
			} else {
				faceMissingSecondsRef.current = 0;
			}
		}, 1000);
	}

	function stopFaceDetection() {
		if (faceCheckIntervalRef.current) {
			clearInterval(faceCheckIntervalRef.current);
			faceCheckIntervalRef.current = undefined;
		}
	}

	function submitAllAnswers() {
		const submissionTime = new Date().toISOString();
		socketRef.current?.emit('submitAllAnswers', {
			answers,
			name: studentName,
			submittedAt: submissionTime
		});
		// Render results locally with explanations
		const html: string[] = [];
		html.push('<h3>Your Answers:</h3>');
		html.push(`<p><strong>Submitted at:</strong> ${new Date(submissionTime).toLocaleString()}</p>`);
		let correctCount = 0;
		questions.forEach((q, i) => {
			const user = answers[i];
			if (user === q.correctAnswer) correctCount += 1;
			html.push(
				`<div style="margin-bottom:15px;border:1px solid #ccc;padding:10px;border-radius:8px;">` +
				`<p><strong>Q${i + 1}:</strong> ${q.question}</p>` +
				`<p><strong>Your Answer:</strong> ${user ?? '<em>No Answer</em>'}</p>` +
				`<p><strong>Correct Answer:</strong> ${q.correctAnswer}</p>` +
				`<p><strong>Explanation:</strong> ${q.explanation}</p>` +
				`</div>`
			);
		});
		const percentage = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
		setFinalScore(percentage);
		if (percentage >= 40) setShowConfetti(true);
		setResultsHtml(html.join(''));
		stopFaceDetection();
	}

	useEffect(() => {
		function onFullChange() {
			if (!document.fullscreenElement) {
				alert('You have exited fullscreen mode. Please return to fullscreen to continue the quiz.');
			}
		}
		document.addEventListener('fullscreenchange', onFullChange);
		return () => document.removeEventListener('fullscreenchange', onFullChange);
	}, []);

	const currentQuestion = useMemo(() => questions[currentIndex], [questions, currentIndex]);

	return (
		<div className="rtq-root">
			<div className="floating-particles">
				<div className="particle" />
				<div className="particle" />
				<div className="particle" />
				<div className="particle" />
			</div>
			{!started ? (
				<div className="container slide-in">
					<div className="quiz-icon">🎯</div>
					<h1>Welcome to the Quiz</h1>
					<div className="instructions">
						<p><strong>📋 Instructions:</strong></p>
						<ul>
							<li>Each question has a time limit</li>
							<li>Once you submit an answer, you can't change it</li>
							<li>Your score will be updated in real-time</li>
							<li>Wait for the host to start the quiz</li>
						</ul>
					</div>
					<form onSubmit={handleStart} className="name-form">
						<h2>✨ Enter Your Name to Start</h2>
						<input
							type="text"
							value={studentName}
							onChange={(e) => setStudentName(e.target.value)}
							placeholder="Enter your name here..."
							required
						/>
						<button type="submit">🚀 Start Quiz</button>
					</form>
				</div>
			) : (
				<>
					<div ref={quizContainerRef} className="quiz-container">
						<div ref={webcamOverlayRef} id="webcam-overlay">
							<video ref={webcamVideoRef} autoPlay muted playsInline />
						</div>
						<div className="progress-container">
							<div className="progress-bar" style={{ width: `${progressPercent()}%` }} />
						</div>
						<div className="question-counter">Question {Math.min(currentIndex + 1, questions.length)} of {questions.length || 0}</div>
						<div className="timer-wrapper"><div className="timer-bar" style={{ width: `${Math.max(0, (timer/60)*100)}%` }} /></div>
						<p className="timer-text">⏱ Time Left: {timer}s</p>
						<div className="auto-submit-note"><strong>Test will be auto-submitted for grading at 00:00</strong></div>
						{currentQuestion && (
							<>
								<h2 className="question-text">{currentQuestion.question}</h2>
								<div className="options">
									{currentQuestion.options.map((opt) => {
										const selected = answers[currentIndex] === opt;
										return (
											<button
												key={opt}
												className={`option-button ${selected ? 'selected pulse' : ''}`}
												onClick={() => selectOption(opt)}
											>
												{opt}
											</button>
										);
									})}
								</div>
							</>
						)}
						<div className="nav-buttons">
							<button className="nav-button" onClick={nextQuestion} disabled={currentIndex >= questions.length - 1}>Next ➡</button>
							<button className="summary-button" onClick={submitAllAnswers}>✅ Summary</button>
							<button className="submit-button" onClick={() => { submitAllAnswers(); stopRecording(); }}>🎯 Submit Test</button>
						</div>
						{resultsHtml && (
							<div className="results" dangerouslySetInnerHTML={{ __html: resultsHtml }} />
						)}
					</div>
					<div id="recording-status" style={{ textAlign: 'center', marginTop: 20, color: 'green' }}>{recordingMsg}</div>
					{showConfetti && <Confetti recycle={false} numberOfPieces={400} />}
					{finalScore !== null && (
						<div style={{ textAlign: 'center', marginTop: 16, fontWeight: 700 }}>
							{finalScore >= 40 ? '🎉 Congratulations! You passed!' : 'Thanks for taking the quiz.'}
							<span style={{ marginLeft: 8 }}>Score: {finalScore}%</span>
						</div>
					)}
				</>
			)}
		</div>
	);
}



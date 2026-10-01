import { speak } from "./utils/speech";
import { useEffect, useState, useRef} from "react";
import './Home.css';
import { toast } from 'react-toastify';
import axios from "axios";
import {auth,db} from './firebase';
import {signOut} from "firebase/auth";
import {useNavigate } from "react-router-dom";
import {collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs} from "firebase/firestore";
import ReadingSpeedSelector from './components/ReadingSpeedSelector';
import QuizSection from './components/QuizSection';
import QuizResult from './components/QuizResult';
import SourcePreviewGrid from './components/SourcePreviewGrid';
import VisualLearningModule from './components/VisualLearningModule';
import ThemeToggle from './components/ThemeToggle';
import { randomCorrectPhrase, incorrectPhrase, scoreMessage } from './utils/quiz';
import { applyFemaleVoice } from './utils/voice';
import { matchHistoryTopic } from './utils/historyMatch';

function Home(){
    const cleanTextForSpeech = (text) => {
        if (!text) return "";

        return text
            .replace(/^\s*([*\-•]|\d+[.)]|[#>])\s*/gm, "")
            .replace(/[`*_#~>/]/g, "")
            .replace(/[^\p{L}\p{N}\s.,!?;:'()\n-]/gu, " ")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    };

    const [title, setTitle] = useState("");
    const [learningLevel, setLearningLevel] = useState("student");
    const [voiceStep, setVoiceStep] = useState("menu");
    const[explanation, setExplanation] = useState("");
    const [user, setUser] = useState(null);
    const[userName, setUserName] = useState("");
    const[history,setHistory]=useState([]);
    const [activeView, setActiveView] = useState("home");
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedHistoryId, setSelectedHistoryId] = useState(null);
    const [readCompletionMessage, setReadCompletionMessage] = useState("");
    const [showQuestionBox, setShowQuestionBox] = useState(false);
    const [questionInput, setQuestionInput] = useState("");
    const navigate=useNavigate();
    const API_BASE_URL = "http://127.0.0.1:5000";
    const utteranceRef = useRef(null); //create the variable that will hold the utterance object,
    const speakIdRef = useRef(0); //identifies the current speech queue, so old queues can be dropped
    const keepAliveRef = useRef(null);
    const isPausedRef = useRef(false);
    const [speechStatus, setSpeechStatus] = useState("Stopped");
    // Reading speed (SpeechSynthesis rate) chosen by the learner before playback starts.
    const readingRateRef = useRef(1.0);
    const [quizQuestions, setQuizQuestions] = useState([]);
    const quizQuestionsRef = useRef([]);
    const [quizIndex, setQuizIndex] = useState(0);
    const quizIndexRef = useRef(0);
    const [quizCorrectCount, setQuizCorrectCount] = useState(0);
    const quizCorrectCountRef = useRef(0);
    const [quizFeedback, setQuizFeedback] = useState("");
    const [quizScoreMessage, setQuizScoreMessage] = useState("");
    const [historyTopicInput, setHistoryTopicInput] = useState("");
    const [sources, setSources] = useState([]);
    const sourcesRef = useRef([]);
    const sourcesFetchedRef = useRef(false);
    const [selectedSources, setSelectedSources] = useState([]);
    const selectedSourcesRef = useRef([]);
    const searchIdRef = useRef(null);

    const clearKeepAlive = () => {
        if (keepAliveRef.current) {
            clearInterval(keepAliveRef.current);
            keepAliveRef.current = null;
        }
    };

    // Chrome stalls (and fires onend late) on long utterances, so the text is spoken
    // in small sentence sized chunks instead of one big block.
    const chunkText = (text) => {
        const clean = (text || "").trim();
        if (!clean) return [];

        const parts = clean.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [clean];
        const chunks = [];
        let current = "";

        parts.forEach((part) => {
            if (current.trim() && (current + part).length > 180) {
                chunks.push(current.trim());
                current = part;
            } else {
                current += part;
            }
        });

        if (current.trim()) chunks.push(current.trim());
        return chunks;
    };

    const speakWithCallback = (text, onEndCallback, rate = 1) => {
        const finish = () => {
            if (typeof onEndCallback === "function") {
                onEndCallback();
            }
        };

        if (typeof window === "undefined" || !window.speechSynthesis) {
            finish();
            return;
        }

        const chunks = chunkText(text);
        if (!chunks.length) {
            finish();
            return;
        }

        // Guards against a stray non-numeric value (e.g. a click event
        // forwarded by accident) reaching SpeechSynthesisUtterance.rate.
        const safeRate = (typeof rate === "number" && rate > 0) ? rate : 1;

        const speakId = speakIdRef.current + 1;
        speakIdRef.current = speakId;
        isPausedRef.current = false;
        clearKeepAlive();
        window.speechSynthesis.cancel();

        let index = 0;
        const speakNext = () => {
            if (speakId !== speakIdRef.current) return; //a newer speech request took over
            if (index >= chunks.length) {
                clearKeepAlive();
                finish(); //callback runs the moment the last chunk ends
                return;
            }

            const currentChunk = chunks[index];
            const utterance = new SpeechSynthesisUtterance(currentChunk);
            index += 1;
            applyFemaleVoice(utterance); // also sets utterance.pitch
            utterance.rate = safeRate;
            utterance.volume = 1;
            let advanced = false;
            const proceed = () => {
                if (advanced || speakId !== speakIdRef.current) return;
                advanced = true;
                clearTimeout(watchdogId);
                speakNext();
            };
            const wordCount = currentChunk.split(/\s+/).filter(Boolean).length;
            const estimatedMs = (wordCount / (1.9 * safeRate)) * 1000 + 2000;
            const watchdogId = setTimeout(proceed, estimatedMs);

            utterance.onend = proceed;
            utterance.onerror = proceed;
            utteranceRef.current = utterance;
            window.speechSynthesis.speak(utterance);
        };

        // keeps the engine awake without touching a manual pause
        keepAliveRef.current = setInterval(() => {
            if (isPausedRef.current) return;
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.resume();
            }
        }, 8000);

        // cancel() needs a tick to settle, otherwise Chrome silently drops the next speak()
        setTimeout(speakNext, 60);
    };
    const handleStart = (rate = readingRateRef.current, textOverride) => {
        const textToSpeak = cleanTextForSpeech(textOverride ?? explanation) || cleanTextForSpeech(title) || "Welcome to EDUCARE.";
      setReadCompletionMessage("");
      setSpeechStatus("Started");
      speakWithCallback(textToSpeak, () => {
        setSpeechStatus("Stopped");
        if (!textToSpeak.trim()) return;
        setReadCompletionMessage("The entire content has been read.");
        setVoiceStep("followup");
      }, rate);
    };
    //pause button
    const handlePause = () => {
        setSpeechStatus("Paused");
        isPausedRef.current = true;
        window.speechSynthesis.pause();
    };

    //Resume button
    const handleResume = () => {
        setSpeechStatus("Resumed");
        isPausedRef.current = false;
        window.speechSynthesis.resume();
    };
    //stop button
    const handleStop = () => {
        setSpeechStatus("Stopped");
        speakIdRef.current += 1; //drops any pending chunks of the current queue
        isPausedRef.current = false;
        clearKeepAlive();
        window.speechSynthesis.cancel();
    };

    const speechStatusRef = useRef("Stopped");
    useEffect(() => {
        speechStatusRef.current = speechStatus;
    }, [speechStatus]);
    useEffect(() => {
        const handleAnyKeyDown = (event) => {
            if (event.ctrlKey || event.altKey || event.metaKey) return;

            const target = event.target;
            const isTypingTarget = target && (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            );
            if (isTypingTarget) return;

            const status = speechStatusRef.current;
            if (status === "Started" || status === "Resumed") {
                handlePause();
            } else if (status === "Paused") {
                handleResume();
            }
        };

        window.addEventListener("keydown", handleAnyKeyDown);
        return () => window.removeEventListener("keydown", handleAnyKeyDown);
    }, []);

    //Sidemenu-Logout
    const handleLogout = async () => {
        try{
            speak("You have been logged out successfully.");
            setTimeout(async () => {
                await signOut(auth);
                navigate("/login");
            }, 5000);
        }
        catch(error){
            console.error("Error logging out:", error);
            // toast.error("Unable to log out. Please try again.");
        }
    };
    //side menu - profile details
    useEffect(() => {
    const fetchUser = async () => {
        const currentUser = auth.currentUser;
        setUser(currentUser);

        if (currentUser) {
            const docRef = doc(db, "Users", currentUser.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setUserName(docSnap.data().name || "Guest");
            } else {
                setUserName("Guest");
            }
            await loadHistory(currentUser.uid);
        } else {
            setUserName("");
            setHistory([]);
        }
    };
    fetchUser();
    }, []);

    useEffect(() => {
        return () => {
            clearKeepAlive();
        };
    }, []);
    //side menu - history
    const saveHistory = async (topic, explanation) => {
    if (!auth.currentUser) 
        return;
    try {
        await addDoc(collection(db, "history"), {
            userId: auth.currentUser.uid,
            title: topic,
            explanation: explanation,
            createdAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Unable to save history:", error);
    }
};
    const loadHistory = async (uid) => {
    if (!uid) {
        setHistory([]);
        return;
    }
    setLoadingHistory(true);
    try {
        const q = query(
            collection(db, "history"),
            where("userId", "==", uid)
        );
        const querySnapshot = await getDocs(q);
        const historyList = querySnapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
        }));

        historyList.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
        });

        setHistory(historyList);
    } catch (error) {
        console.error("Unable to load history:", error);
        setHistory([]);
    } finally {
        setLoadingHistory(false);
    }
};
    const handleHistoryClick = async (event) => {
        event.preventDefault();
        setActiveView("history");
        if (auth.currentUser) {
            await loadHistory(auth.currentUser.uid);
        }
    };
    const handleHomeClick = (event) => {
        event.preventDefault();
        setActiveView("home");
    };
    const handleHistorySelect = (id) => {
        setSelectedHistoryId(id);
        setActiveView("history");
    };
    const handleProfileClick = (event) => {
        event.preventDefault();
        setActiveView("profile");
    };

    const chooseMenuOption = async (option) => {
        if (option === 1) {
            setActiveView("home");
            setVoiceStep("title");
        } else if (option === 2) {
            setActiveView("history");
            if (auth.currentUser) {
                await loadHistory(auth.currentUser.uid);
            }
            setHistoryTopicInput("");
            setVoiceStep("historyTopic");
        } else if (option === 3) {
            setActiveView("profile");
            setVoiceStep("profile");
        }
    };

    const handleHistoryTopicInput = (topicText) => {
        const spoken = (topicText || "").trim();
        if (!spoken) return;

        const result = matchHistoryTopic(history, spoken);

        if (result.status === "match") {
            const match = result.item;
            setTitle(match.title);
            setExplanation(match.explanation || "");
            setSelectedHistoryId(match.id);
            setHistoryTopicInput("");
            setActiveView("home");
            // History never stored sources, so this path never announces
            // or displays them - not an error, just not applicable.
            setSources([]);
            sourcesRef.current = [];
            sourcesFetchedRef.current = false;
            setSelectedSources([]);
            selectedSourcesRef.current = [];
            searchIdRef.current = null;
            toast.success(`Loaded "${match.title}" from your history.`);
            setVoiceStep("speedSelect");
        } else if (result.status === "ambiguous") {
            toast.info(`Found ${result.items.length} lessons related to ${result.queryLabel}. Enter a more specific topic.`);
        } else {
            toast.error("No matching topic found in your learning history.");
        }
    };

    const handleProfileBack = () => {
        setActiveView("home");
        setVoiceStep("menu");
    };

    //topic search
    // Phase 1: search sources, then let the learner choose which to use.
    const fetchSources = async (topicText = title) => {
        const topic = (topicText || "").trim();
        if (!topic) {
            toast.error("Please enter a title first.");
            return;
        }

        setIsSearching(true);
        setExplanation("");
        try {
            const response = await axios.post(`${API_BASE_URL}/api/sources`, { topic });
            if (!response.data.success) {
                throw new Error(response.data.message || "Unable to search for sources.");
            }
            const fetchedSources = response.data.sources || [];
            searchIdRef.current = response.data.searchId || null;

            setSources(fetchedSources);
            sourcesRef.current = fetchedSources;
            sourcesFetchedRef.current = true;
            // Nothing is pre-selected - the learner picks which sources to
            // use before continuing, rather than starting from "everything".
            setSelectedSources([]);
            selectedSourcesRef.current = [];

            if (fetchedSources.length) {
                setVoiceStep("sourceSelect");
            } else {
                setVoiceStep("speedSelect");
            }
        } catch (error) {
            console.error(error);
            const message = error?.response?.data?.message || error.message || (error?.code === "ERR_NETWORK"
                ? "Cannot reach the EDUCARE backend. Start it from the backend folder with npm run dev."
                : "Unable to fetch sources right now.");
            toast.error(message);
        } finally {
            setIsSearching(false);
        }
    };

    // Phase 2: generates the explanation from just the sources the learner
    // selected (searchIdRef ties this back to the same Tavily search fetchSources
    // already ran, so this never re-searches). Called once the learner has
    // picked sources, a reading speed, and confirmed "yes" at the "confirm" step.
    const generateExplanation = async (topicText = title, level = learningLevel) => {
        const topic = (topicText || "").trim();
        if (!topic) {
            toast.error("Please enter a title first.");
            throw new Error("Missing topic");
        }

        const selectedUrls = selectedSourcesRef.current
            .map((index) => sourcesRef.current[index]?.url)
            .filter(Boolean);

        setIsGenerating(true);
        try {
            const response = await axios.post(`${API_BASE_URL}/api/explain`, {
                topic,
                level,
                searchId: searchIdRef.current,
                selectedUrls,
            });
            if (!response.data.success) {
                throw new Error(response.data.message || "The AI provider could not generate an explanation.");
            }
            const result = response.data.explanation || response.data.message || "";
            if (!result.trim()) {
                throw new Error("The AI provider returned an empty explanation. Check backend logs and try again.");
            }
            setExplanation(result);
            await saveHistory(topic, result);
            if (auth.currentUser) {
                await loadHistory(auth.currentUser.uid);
            }
            toast.success("Explanation generated successfully!");
            return result;
        } catch (error) {
            console.error(error);
            const message = error?.response?.data?.message || error.message || (error?.code === "ERR_NETWORK"
                ? "Cannot reach the EDUCARE backend. Start it from the backend folder with npm run dev."
                : "Unable to generate the explanation right now.");
            toast.error(message);
            throw error;
        } finally {
            setIsGenerating(false);
        }
    };

    const searchTitle = async () => {
        await fetchSources(title);
    };

    const updateReadingRate = (rate) => {
        readingRateRef.current = rate;
    };

    const selectLearningPreferences = (level, rate) => {
        setLearningLevel(level);
        updateReadingRate(rate);
        setVoiceStep("confirm");
    };

    const toggleSourceSelection = (index) => {
        const current = selectedSourcesRef.current;
        const next = current.includes(index)
            ? current.filter((i) => i !== index)
            : [...current, index].sort((a, b) => a - b);
        selectedSourcesRef.current = next;
        setSelectedSources(next);
    };

    const proceedFromSourceSelection = () => {
        setVoiceStep("speedSelect");
    };

    const respondToStart = (wantsStart) => {
        if (wantsStart) {
            generateExplanation(title)
                .then((result) => handleStart(readingRateRef.current, result))
                .catch((error) => console.error(error));
        } else {
            setVoiceStep("speedSelect");
        }
    };

    const askQuizQuestion = (index, questions) => {
        const q = questions[index];
        if (!q) return;
        setQuizFeedback("");
        const text = `Question ${index + 1}. ${q.question} Option A: ${q.options.A}. Option B: ${q.options.B}. Option C: ${q.options.C}. Option D: ${q.options.D}.`;
        speak(text);
    };

    const startQuiz = async () => {
        try {
            toast.info("Preparing your quiz...");
            const response = await axios.post(`${API_BASE_URL}/api/quiz/generate`, {
                topic: title,
                content: explanation,
            });

            if (!response.data.success || !Array.isArray(response.data.questions)) {
                throw new Error(response.data.message || "Quiz generation failed");
            }

            const questions = response.data.questions;
            quizQuestionsRef.current = questions;
            setQuizQuestions(questions);
            quizIndexRef.current = 0;
            setQuizIndex(0);
            quizCorrectCountRef.current = 0;
            setQuizCorrectCount(0);
            setQuizFeedback("");
            setVoiceStep("quiz");
            askQuizQuestion(0, questions);
        } catch (error) {
            console.error(error);
            toast.error("I couldn't create the quiz right now. Please try again.");
        }
    };

    const respondToQuiz = (wantsQuiz) => {
        if (wantsQuiz) {
            startQuiz();
        } else {
            resetSession();
        }
    };

    const finishQuiz = () => {
        const correct = quizCorrectCountRef.current;
        const total = quizQuestionsRef.current.length;
        const message = scoreMessage(correct, total);
        setQuizScoreMessage(message);
        setVoiceStep("quizResult");
        speakWithCallback(message, () => {
            setTimeout(() => resetSession(), 1500);
        });
    };

    // Shared by the voice branch (normalized transcript) and the on-screen option buttons.
    const handleQuizAnswer = (letter) => {
        if (quizFeedback) return; // already answered, waiting to advance

        const questions = quizQuestionsRef.current;
        const index = quizIndexRef.current;
        const q = questions[index];
        if (!q) return;

        const isCorrect = letter === q.correctAnswer;
        const feedbackText = isCorrect
            ? randomCorrectPhrase()
            : incorrectPhrase(q.correctAnswer, q.options[q.correctAnswer], q.explanation);

        setQuizFeedback(feedbackText);
        if (isCorrect) {
            quizCorrectCountRef.current += 1;
            setQuizCorrectCount(quizCorrectCountRef.current);
        }

        speakWithCallback(feedbackText, () => {
            const nextIndex = index + 1;
            if (nextIndex >= questions.length) {
                finishQuiz();
            } else {
                quizIndexRef.current = nextIndex;
                setQuizIndex(nextIndex);
                askQuizQuestion(nextIndex, questions);
            }
        });
    };

    // Clears the completed session so the app is ready for the next topic.
    const resetSession = () => {
        setTitle("");
        setExplanation("");
        setReadCompletionMessage("");
        setShowQuestionBox(false);
        updateQuestionInput("");
        setQuizQuestions([]);
        quizQuestionsRef.current = [];
        setQuizIndex(0);
        quizIndexRef.current = 0;
        setQuizCorrectCount(0);
        quizCorrectCountRef.current = 0;
        setQuizFeedback("");
        setQuizScoreMessage("");
        setSources([]);
        sourcesRef.current = [];
        sourcesFetchedRef.current = false;
        setSelectedSources([]);
        selectedSourcesRef.current = [];
        searchIdRef.current = null;
        setSelectedHistoryId(null);
        setHistoryTopicInput("");
        setActiveView("home");
        setVoiceStep("menu");
    };

    const updateQuestionInput = (value) => {
        setQuestionInput(value);
    };

    const startQuestionPrompt = () => {
        setShowQuestionBox(true);
        updateQuestionInput("");
        setVoiceStep("questions");
    };

    const handleQuestionSubmit = async () => {
        const question = questionInput.trim();

        if (!question) {
            toast.error("Please enter a question first.");
            return;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/api/qa`, {
                topic: title,
                question,
                content: explanation,
            });

            const answer = response.data.answer || "I could not answer that right now.";
            updateQuestionInput("");
            setVoiceStep("qaFollowup");
            toast.success("Question received.");
            speak(answer);
        } catch (error) {
            console.error(error);
            const message = error?.response?.data?.message || "Unable to answer your question right now. Please make sure the backend server is running.";
            toast.error(message);
            speak("Sorry, I could not answer that question right now.");
        }
    };

    const voiceStatus = speechStatus === "Started" || speechStatus === "Resumed"
        ? { variant: "speaking", label: "Speaking…" }
        : speechStatus === "Paused"
        ? { variant: "paused", label: "Paused" }
        : null;
    const greetingHour = new Date().getHours();
    const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";
    const firstName = userName.trim().split(/\s+/)[0] || "there";
    return (
        <div className="homecontainer">
            <div className="layout-shell">
                <aside className="sidebar">
                    <a className="brand-lockup" href="#home" onClick={handleHomeClick} aria-label="EDUCARE dashboard">
                        <span className="brand-monogram" aria-hidden="true">E</span>
                        <span><strong>EDUCARE</strong><small>AI learning space</small></span>
                    </a>

                    <div className="sidebar-user">
                        <div className="user-avatar" aria-hidden="true">{firstName.charAt(0).toUpperCase()}</div>
                        <div className="user-name">{userName || "Guest"}</div>
                        <div className="user-email">{user?.email || ""}</div>
                    </div>

                    <div className="sidebar-theme-row">
                        <span>Dark mode</span>
                        <ThemeToggle />
                    </div>

                    <nav className="sidebar-nav" aria-label="Main navigation">
                        <a className={`nav-item ${activeView === "home" && voiceStep === "menu" ? "active" : ""}`} href="#home" onClick={handleHomeClick}>
                            <span className="nav-icon" aria-hidden="true">01</span>
                            <span>Dashboard</span>
                        </a>
                        <a className={`nav-item ${activeView === "home" && voiceStep !== "menu" ? "active" : ""}`} href="#tutor" onClick={(event) => { event.preventDefault(); setActiveView("home"); setVoiceStep("title"); }}>
                            <span className="nav-icon" aria-hidden="true">02</span>
                            <span>AI Tutor</span>
                        </a>
                        <a className={`nav-item ${activeView === "history" ? "active" : ""}`} href="#history" onClick={handleHistoryClick}>
                            <span className="nav-icon" aria-hidden="true">03</span>
                            <span>My Learning</span>
                        </a>
                        {activeView === "history" && history.length > 0 && (
                            <div className="history-sidebar-list">
                                {history.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`history-sidebar-item ${selectedHistoryId === item.id ? "active" : ""}`}
                                        onClick={() => handleHistorySelect(item.id)}
                                    >
                                        {item.title}
                                    </button>
                                ))}
                            </div>
                        )}
                        <a className={`nav-item ${activeView === "profile" ? "active" : ""}`} href="#profile" onClick={handleProfileClick}>
                            <span className="nav-icon" aria-hidden="true">04</span>
                            <span>Profile</span>
                        </a>
                        <a className="nav-item nav-item-logout" href="#logout" onClick={handleLogout}>
                            <span className="nav-icon" aria-hidden="true">↗</span>
                            <span>Logout</span>
                        </a>
                    </nav>
                </aside>

                {/* ---------- Main Content (80%) ---------- */}
                <main className="main-content">
                    <header className="page-head">
                        <div>
                            <span className="eyebrow">Your personal learning workspace</span>
                            <h1 className="page-title">{greeting}, {firstName}</h1>
                            <p className="page-sub">What would you like to learn today?</p>
                        </div>
                        <div className="header-user-chip" aria-label={`Signed in as ${userName || "Guest"}`}>
                            <span className="header-user-avatar" aria-hidden="true">{firstName.charAt(0).toUpperCase()}</span>
                            <span>{userName || "Guest"}</span>
                        </div>
                    </header>

                    {activeView === "home" ? (
                        <>
                            <section className="workspace-overview" aria-label="Learning overview">
                                <article className="overview-stat">
                                    <span className="overview-label">Saved lessons</span>
                                    <strong>{history.length}</strong>
                                    <span className="overview-note">in your learning library</span>
                                </article>
                                <article className="overview-stat overview-stat-focus">
                                    <span className="overview-label">Current focus</span>
                                    <strong>{title || "Choose a topic"}</strong>
                                    <span className="overview-note">{title ? "Your lesson workspace is ready" : "Your next idea can start here"}</span>
                                </article>
                                <article className="overview-stat">
                                    <span className="overview-label">Audio learning</span>
                                    <strong>{voiceStatus?.label || "Ready when you are"}</strong>
                                    <span className="overview-note">Adjust playback to suit you</span>
                                </article>
                            </section>
                            <section className="recent-learning" aria-labelledby="recent-learning-title">
                                <div className="section-heading">
                                    <div>
                                        <span className="eyebrow">Pick up where you left off</span>
                                        <h2 id="recent-learning-title">Continue learning</h2>
                                    </div>
                                    {history.length > 0 ? (
                                        <button type="button" className="text-action" onClick={() => chooseMenuOption(2)}>View all lessons</button>
                                    ) : null}
                                </div>
                                {history.length > 0 ? (
                                    <div className="recent-lesson-list">
                                        {history.slice(0, 3).map((item, index) => (
                                            <button key={item.id} type="button" className="recent-lesson" onClick={() => handleHistorySelect(item.id)}>
                                                <span className={`recent-lesson-index tone-${index + 1}`}>0{index + 1}</span>
                                                <span className="recent-lesson-copy"><strong>{item.title}</strong><small>Open saved lesson</small></span>
                                                <span className="recent-lesson-arrow" aria-hidden="true">&rarr;</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button type="button" className="recent-empty" onClick={() => chooseMenuOption(1)}>
                                        <span className="empty-spark" aria-hidden="true">+</span>
                                        <span><strong>Your learning library starts here</strong><small>Ask EDUCARE to explain a topic and your lesson will appear here.</small></span>
                                        <span className="recent-lesson-arrow" aria-hidden="true">&rarr;</span>
                                    </button>
                                )}
                            </section>
                        </>
                    ) : null}

                    {activeView === "history" ? (
                        <div className="card history-card">
                            <span className="card-tab card-tab-alt">History</span>
                            <div className="card-icon" aria-hidden="true">MY LIBRARY</div>
                            <h2>Your Saved History</h2>

                            <div style={{ marginBottom: "1rem", width: "100%" }}>
                                    <p className="muted" style={{ marginBottom: "0.4rem" }}>
                                        Enter a title or topic from your learning history.
                                    </p>
                                    <input
                                        type="text"
                                        value={historyTopicInput}
                                        onChange={(e) => setHistoryTopicInput(e.target.value)}
                                        placeholder="Type a topic from your history"
                                        aria-label="Topic to reopen from your learning history"
                                        style={{ width: "100%", padding: "0.55rem", borderRadius: "8px", border: "1px solid #d0d7de" }}
                                    />
                                    <button
                                        type="button"
                                        className="search-button"
                                        onClick={() => handleHistoryTopicInput(historyTopicInput)}
                                        style={{ marginTop: "0.5rem" }}
                                    >
                                        Go
                                    </button>
                                    <p className="muted" style={{ marginTop: "0.5rem", fontSize: "13px" }}>
                                        Select a saved lesson from the list or search by topic.
                                    </p>
                            </div>

                            {loadingHistory ? (
                                <p className="muted">Loading history...</p>
                            ) : history.length > 0 ? (
                                <div className="history-detail-card">
                                    {selectedHistoryId ? (
                                        (() => {
                                            const selectedItem = history.find((item) => item.id === selectedHistoryId);
                                            return (
                                                <>
                                                    <h3>{selectedItem?.title || "Selected title"}</h3>
                                                    <p>{selectedItem?.explanation || "No explanation available."}</p>
                                                </>
                                            );
                                        })()
                                    ) : (
                                        <p className="muted">Select a title from the sidebar to view its content.</p>
                                    )}
                                </div>
                            ) : (
                                <p className="muted">No saved history yet.</p>
                            )}
                        </div>
                    ) : activeView === "profile" ? (
                        <div className="card history-card">
                            <span className="card-tab card-tab-alt">Profile</span>
                            <div className="card-icon" aria-hidden="true">ACCOUNT</div>
                            <h2>Your Profile</h2>
                            <div className="history-detail-card">
                                <p><strong>Name:</strong> {userName || "Guest"}</p>
                                <p><strong>Email:</strong> {user?.email || "Not available"}</p>
                            </div>
                            <button type="button" className="search-button" aria-label="Back to main menu" onClick={handleProfileBack} style={{ marginTop: "1rem" }}>
                                Back to Menu
                            </button>
                        </div>
                    ) : (
                        <div className="cards">
                            <div className="card title-card">
                                <span className="card-tab">AI TUTOR</span>
                                <h2>Ask your tutor</h2>

                                {voiceStatus ? (
                                    <div className={`voice-status-pill ${voiceStatus.variant}`} role="status" aria-live="polite">
                                        <span className="voice-status-dot" aria-hidden="true"></span>
                                        {voiceStatus.label}
                                    </div>
                                ) : null}

                                {voiceStep === "menu" ? (
                                    <div className="confirm-buttons" role="group" aria-label="Main menu">
                                        <p className="muted">
                                            What would you like to do?
                                        </p>
                                        <button type="button" className="search-button" aria-label="Learn a new topic" onClick={() => chooseMenuOption(1)}>
                                            Learn New Topic
                                        </button>
                                        <button type="button" className="search-button" aria-label="Access your history" onClick={() => chooseMenuOption(2)}>
                                            History
                                        </button>
                                        <button type="button" className="search-button" aria-label="Open your profile" onClick={() => chooseMenuOption(3)}>
                                            Profile
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <p className="muted">Enter a topic to get a short explanation.</p>
                                        <input
                                            type="text"
                                            className="title-input"
                                            placeholder="Enter a topic"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                        />
                                        <button className="search-button" onClick={searchTitle} disabled={isSearching || isGenerating}>
                                            {isSearching ? "Searching..." : isGenerating ? "Generating..." : "Explain"}
                                        </button>
                                        <div className="btn-container" role="group" aria-label="Audio playback controls">
                                            <button className="mic-button" onClick={() => handleStart()} aria-label="Play lesson">Play</button>
                                            <button className="mic-button" onClick={handlePause} aria-label="Pause lesson">Pause</button>
                                            <button className="mic-button" onClick={handleResume} aria-label="Resume lesson">Resume</button>
                                            <button className="mic-button" onClick={handleStop} aria-label="Stop lesson">Stop</button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="card output-card">
                                <span className="card-tab card-tab-alt">AI-GENERATED LESSON</span>
                                <h2>Your explanation</h2>
                                {title ? (<p className="muted"><strong>Topic:</strong> {title}</p>) : (
                                    <p className="muted">Enter a topic to begin.</p>
                                )}
                                <div className="output-scroll">
                                <SourcePreviewGrid
                                    sources={voiceStep === "sourceSelect" ? sources : sources.filter((_, i) => selectedSources.includes(i))}
                                    selectable={voiceStep === "sourceSelect"}
                                    selectedIndices={selectedSources}
                                    onToggle={toggleSourceSelection}
                                    onContinue={proceedFromSourceSelection}
                                />
                                <div className="output-grid">
                                    {voiceStep === "speedSelect" ? (
                                        <div className="step-panel">
                                            <ReadingSpeedSelector onSelect={selectLearningPreferences} />
                                        </div>
                                    ) : null}

                                    {voiceStep === "confirm" ? (
                                        <div className="confirm-buttons" role="group" aria-label="Start explanation confirmation">
                                            <p className="muted">
                                                Shall I start explaining the content?
                                            </p>
                                            <button type="button" className="search-button" aria-label="Yes, start explaining" onClick={() => respondToStart(true)}>
                                                Yes
                                            </button>
                                            <button type="button" className="search-button" aria-label="No, wait" onClick={() => respondToStart(false)}>
                                                No
                                            </button>
                                        </div>
                                    ) : null}

                                    {explanation ? (<p className="output-text">{explanation}</p>) : (
                                        <p className="muted" role="status" aria-live="polite">
                                            {isGenerating ? "Generating your explanation..." : "Your explanation will appear here after you choose a reading speed and confirm."}
                                        </p>)}
                                    {explanation ? <VisualLearningModule key={explanation} topic={title} content={explanation} apiBaseUrl={API_BASE_URL} /> : null}
                                    {readCompletionMessage ? (
                                        <p className="muted" style={{ marginTop: "0.5rem", color: "#2f855a" }}>
                                            {readCompletionMessage}
                                        </p>
                                    ) : null}
                                    {voiceStep === "followup" ? (
                                        <div className="confirm-buttons" role="group" aria-label="What would you like to do next">
                                            <button
                                                type="button"
                                                className="search-button"
                                                aria-label="Ask a question about this topic"
                                                onClick={startQuestionPrompt}
                                            >
                                                Ask a Question
                                            </button>
                                            <button
                                                type="button"
                                                className="search-button"
                                                aria-label="Take a quiz about this topic"
                                                onClick={() => startQuiz()}
                                            >
                                                Take Quiz
                                            </button>
                                        </div>
                                    ) : null}
                                    {showQuestionBox ? (
                                        <div className="step-panel">
                                            <p className="muted" style={{ marginBottom: "0.4rem" }}>
                                                Ask a question about this topic
                                            </p>
                                            <input
                                                type="text"
                                                value={questionInput}
                                                onChange={(e) => updateQuestionInput(e.target.value)}
                                                placeholder="Type your question here"
                                                style={{ width: "100%", padding: "0.55rem", borderRadius: "8px", border: "1px solid #d0d7de" }}
                                            />
                                            <button className="search-button" onClick={handleQuestionSubmit} style={{ marginTop: "0.5rem" }}>
                                                Go
                                            </button>
                                        </div>
                                    ) : null}

                                    {voiceStep === "qaFollowup" ? (
                                        <div className="confirm-buttons" role="group" aria-label="Question follow-up">
                                            <button type="button" className="search-button" onClick={startQuestionPrompt}>
                                                Ask Another Question
                                            </button>
                                            <button
                                                type="button"
                                                className="search-button"
                                                onClick={() => {
                                                    setShowQuestionBox(false);
                                                    setVoiceStep("quizConfirm");
                                                }}
                                            >
                                                Take Quiz
                                            </button>
                                        </div>
                                    ) : null}

                                    {voiceStep === "quizConfirm" ? (
                                        <div className="confirm-buttons" role="group" aria-label="Quiz confirmation">
                                            <p className="muted">
                                                Would you like to play an interactive quiz about this topic?
                                            </p>
                                            <button type="button" className="search-button" aria-label="Yes, start quiz" onClick={() => respondToQuiz(true)}>
                                                Yes
                                            </button>
                                            <button type="button" className="search-button" aria-label="No, finish" onClick={() => respondToQuiz(false)}>
                                                No
                                            </button>
                                        </div>
                                    ) : null}

                                    {voiceStep === "quiz" && quizQuestions[quizIndex] ? (
                                        <div className="step-panel">
                                            <QuizSection
                                                question={quizQuestions[quizIndex]}
                                                questionNumber={quizIndex + 1}
                                                totalQuestions={quizQuestions.length}
                                                feedback={quizFeedback}
                                                disabled={Boolean(quizFeedback)}
                                                onAnswer={handleQuizAnswer}
                                            />
                                        </div>
                                    ) : null}

                                    {voiceStep === "quizResult" ? (
                                        <div className="step-panel">
                                            <QuizResult
                                                correct={quizCorrectCount}
                                                total={quizQuestions.length || 3}
                                                message={quizScoreMessage}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default Home;

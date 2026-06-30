import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp, arrayUnion, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyDXF6bdnnDdRdq3D3BqPW17ZTORaJQ2JFk",
  authDomain: "couple-play-d5636.firebaseapp.com",
  projectId: "couple-play-d5636",
  storageBucket: "couple-play-d5636.firebasestorage.app",
  messagingSenderId: "220959170432",
  appId: "1:220959170432:web:e9e4537b4e294cb524eb65",
  measurementId: "G-JVENKWY99S"
};  

let appFirebase, auth, db;
try {
    appFirebase = initializeApp(firebaseConfig);
    auth = getAuth(appFirebase);
    db = getFirestore(appFirebase);
} catch(e) {
    console.error("Firebase config is missing or invalid.", e);
}

// DRAW TOGETHER WORDS DICTIONARY
const DRAW_WORDS = {
    'Hewan': ['Kucing', 'Anjing', 'Gajah', 'Singa', 'Jerapah', 'Kupu-kupu', 'Ikan', 'Burung'],
    'Buah': ['Apel', 'Pisang', 'Jeruk', 'Semangka', 'Anggur', 'Mangga', 'Stroberi', 'Nanas'],
    'Makanan': ['Pizza', 'Burger', 'Sushi', 'Donat', 'Es Krim', 'Telor Mata Sapi', 'Kopi', 'Kue'],
    'Kendaraan': ['Mobil', 'Motor', 'Pesawat', 'Kapal', 'Kereta Api', 'Sepeda', 'Helikopter'],
    'Random': ['Rumah', 'Pohon', 'Matahari', 'Bintang', 'Gitar', 'Buku', 'Kacamata', 'Jam Tangan']
};

class CouplePlayApp {
    constructor() {
        this.user = null;
        this.roomId = null;
        this.isHost = false;
        this.roomUnsubscribe = null;
        this.chatUnsubscribe = null;
        this.gameState = {};
        this.currentDrawPhase = null; // Track draw phase to avoid re-rendering canvas
        
        // Audio
        this.sfxClick = new Audio(''); 
        
        // Canvas variables
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.drawHistory = [];
        this.redoHistory = [];
        this.currentBrushSize = 3;
        this.currentColor = '#000000';
        this.isEraser = false;

        this.initAuth();
    }

    // --- UTILS & UI ---
    showToast(msg) {
        const toast = document.getElementById('toast');
        toast.innerText = msg;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }

    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    playClick() { if(this.sfxClick.src) this.sfxClick.play().catch(e=>{}); }

    // --- AUTH & PROFILE ---
    async initAuth() {
        if(!auth) return;
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.user = user;
                await this.initUserProfile(); 
                setTimeout(() => this.switchScreen('screen-home'), 1500);
            } else {
                signInAnonymously(auth).catch(err => this.showToast("Gagal Login: " + err.message));
            }
        });
    }

    async initUserProfile() {
        const userRef = doc(db, "users", this.user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            await setDoc(userRef, {
                name: "Player " + Math.floor(Math.random() * 1000),
                avatar: "👤",
                level: 1, xp: 0, matches: 0, wins: 0, loses: 0, draws: 0,
                history: [], createdAt: serverTimestamp()
            });
        }
    }

    async showProfile() {
        this.playClick();
        this.switchScreen('screen-profile');
        const snap = await getDoc(doc(db, "users", this.user.uid));
        if(snap.exists()) {
            const data = snap.data();
            document.getElementById('profile-avatar').innerText = data.avatar || "👤";
            document.getElementById('profile-name').innerText = data.name || "Player";
            document.getElementById('profile-uid').innerText = "UID: " + this.user.uid;
            document.getElementById('stat-level').innerText = data.level || 1;
            document.getElementById('stat-xp').innerText = data.xp || 0;
            
            const matches = data.matches || 0, wins = data.wins || 0, loses = data.loses || 0;
            document.getElementById('stat-match').innerText = matches;
            document.getElementById('stat-win').innerText = wins;
            document.getElementById('stat-lose').innerText = loses;
            document.getElementById('stat-wr').innerText = (matches > 0 ? Math.round((wins/matches)*100) : 0) + "%";

            const historyContainer = document.getElementById('profile-history');
            historyContainer.innerHTML = '';
            if(data.history && data.history.length > 0) {
                data.history.reverse().forEach(h => {
                    let color = h.result === 'Win' ? 'var(--success)' : (h.result === 'Lose' ? 'var(--danger)' : 'white');
                    historyContainer.innerHTML += `<div class="history-item"><div><strong style="display:block; font-size:14px;">${h.game}</strong><span style="font-size:11px; color:var(--text-muted);">${h.date}</span></div><span style="font-weight:bold; color:${color};">${h.result}</span></div>`;
                });
            } else {
                historyContainer.innerHTML = `<p style="text-align:center; color:var(--text-muted); font-size:12px; margin-top:20px;">Belum ada pertandingan.</p>`;
            }
        }
    }

    async editName() {
        const newName = prompt("Masukkan nama baru:");
        if(newName && newName.trim() !== "") {
            await updateDoc(doc(db, "users", this.user.uid), { name: newName.trim() });
            this.showProfile();
        }
    }

    async editAvatar() {
        const newAvatar = prompt("Masukkan emoji untuk Avatar kamu:\n(Contoh: 🦊, 🐯, 🐼, 👽)");
        if(newAvatar && newAvatar.trim() !== "") {
            await updateDoc(doc(db, "users", this.user.uid), { avatar: newAvatar.trim() });
            this.showProfile();
        }
    }

    async showAwards() {
        this.playClick();
        this.switchScreen('screen-awards');
        const snap = await getDoc(doc(db, "users", this.user.uid));
        let data = snap.exists() ? snap.data() : { matches: 0, wins: 0, history: [] };
        
        const achievementsList = [
            { id: 'first_match', icon: '❤️', title: 'First Match', desc: 'Mainkan pertandingan pertamamu', target: 1, current: data.matches || 0 },
            { id: 'first_win', icon: '🏆', title: 'First Win', desc: 'Menangkan 1 pertandingan', target: 1, current: data.wins || 0 },
            { id: 'win_10', icon: '🔥', title: 'Win 10 Games', desc: 'Menangkan 10 pertandingan', target: 10, current: data.wins || 0 },
            { id: 'win_50', icon: '⭐', title: 'Win 50 Games', desc: 'Menangkan 50 pertandingan', target: 50, current: data.wins || 0 },
            { id: 'artist', icon: '🎨', title: 'Artist', desc: 'Main Draw Together 5 kali', target: 5, current: (data.history || []).filter(h => h.game === 'Draw Together').length },
            { id: 'funny_couple', icon: '😂', title: 'Funny Couple', desc: 'Main Tebak Emoji 5 kali', target: 5, current: (data.history || []).filter(h => h.game === 'Tebak Emoji').length },
            { id: 'soulmate', icon: '💌', title: 'Soulmate', desc: 'Main Who Knows Me Better 5 kali', target: 5, current: (data.history || []).filter(h => h.game === 'Who Knows Me Better').length },
            { id: 'legend', icon: '👑', title: 'Couple Legend', desc: 'Main total 100 pertandingan', target: 100, current: data.matches || 0 }
        ];

        const listContainer = document.getElementById('awards-list');
        listContainer.innerHTML = '';
        achievementsList.forEach(ach => {
            let isUnlocked = ach.current >= ach.target;
            let progressPercent = Math.min((ach.current / ach.target) * 100, 100);
            listContainer.innerHTML += `
                <div class="award-card ${isUnlocked ? 'unlocked' : ''}">
                    <div class="award-icon">${ach.icon}</div>
                    <div class="award-info">
                        <h4>${ach.title}</h4><p>${ach.desc}</p>
                        <div class="progress-bg"><div class="progress-fill" style="width: ${progressPercent}%;"></div></div>
                        <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 4px; text-align: right;">${ach.current} / ${ach.target}</span>
                    </div>
                </div>
            `;
        });
    }

    // --- ROOM MANAGEMENT ---
    generateRoomCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

    async createRoom() {
        this.playClick();
        const code = this.generateRoomCode();
        try {
            const userSnap = await getDoc(doc(db, "users", this.user.uid));
            const uData = userSnap.exists() ? userSnap.data() : { avatar: '👑', name: 'Host' };
            await setDoc(doc(db, "rooms", code), {
                host: this.user.uid, hostAvatar: uData.avatar, hostName: uData.name,
                guest: null, guestAvatar: null, guestName: null,
                hostReady: false, guestReady: false, status: 'lobby', gameType: null, gameState: {},
                createdAt: serverTimestamp()
            });
            this.isHost = true; this.roomId = code; this.enterLobby();
        } catch(e) { this.showToast("Gagal membuat room!"); }
    }

    async joinRoom() {
        this.playClick();
        const codeInput = document.getElementById('join-code').value.toUpperCase();
        if(codeInput.length !== 6) return this.showToast("Kode tidak valid");
        const roomRef = doc(db, "rooms", codeInput);
        const snap = await getDoc(roomRef);
        if(!snap.exists()) return this.showToast("Room tidak ditemukan!");
        const data = snap.data();
        if(data.guest && data.guest !== this.user.uid) return this.showToast("Room penuh!");

        const userSnap = await getDoc(doc(db, "users", this.user.uid));
        const uData = userSnap.exists() ? userSnap.data() : { avatar: '💖', name: 'Partner' };
        await updateDoc(roomRef, { guest: this.user.uid, guestAvatar: uData.avatar, guestName: uData.name });
        this.isHost = false; this.roomId = codeInput; this.enterLobby();
    }

    enterLobby() {
        document.getElementById('room-code-display').innerText = this.roomId;
        this.switchScreen('screen-lobby');
        this.listenToRoom();
        this.listenToChat();
    }

    listenToRoom() {
        if(this.roomUnsubscribe) this.roomUnsubscribe();
        this.roomUnsubscribe = onSnapshot(doc(db, "rooms", this.roomId), (docSnap) => {
            if(!docSnap.exists()) { this.leaveRoom(false); this.showToast("Room telah ditutup Host."); return; }
            const data = docSnap.data();
            this.gameState = data.gameState; 
            this.roomData = data; // store global room data for names

            document.getElementById('host-avatar').innerText = data.hostAvatar || "👑";
            document.getElementById('host-name').innerText = data.hostName || "Host";
            document.getElementById('guest-avatar').innerText = data.guest ? (data.guestAvatar || "💖") : "⏳";
            document.getElementById('guest-name').innerText = data.guest ? (data.guestName || "Partner") : "Waiting...";
            
            const hostStatus = document.getElementById('host-status');
            hostStatus.innerText = data.hostReady ? "Ready" : "Not Ready";
            hostStatus.className = "status " + (data.hostReady ? "ready" : "wait");
            
            const guestStatus = document.getElementById('guest-status');
            guestStatus.innerText = data.guestReady ? "Ready" : "Not Ready";
            guestStatus.className = "status " + (data.guestReady ? "ready" : "wait");

            const btnReady = document.getElementById('btn-ready');
            const btnStart = document.getElementById('btn-start-game');
            
            let isMeReady = this.isHost ? data.hostReady : data.guestReady;
            btnReady.innerText = isMeReady ? "Batalkan Ready" : "I'm Ready!";
            btnReady.className = isMeReady ? "btn btn-outline" : "btn";

            if (this.isHost) {
                if (data.hostReady && data.guestReady) { btnStart.style.display = "block"; btnReady.style.display = "none"; }
                else { btnStart.style.display = "none"; btnReady.style.display = "block"; }
            } else { btnStart.style.display = "none"; }

            if(data.status === 'playing' && data.gameType) {
                if(document.getElementById('screen-active-game').className !== "screen active") {
                    this.renderGameUI(data.gameType);
                }
                this.updateGameStateUI(data.gameType, data.gameState);
            } else if(data.status === 'lobby') {
                this.currentDrawPhase = null; // reset
                if(document.getElementById('screen-lobby').className !== "screen active") {
                    this.switchScreen('screen-lobby');
                }
            }
        });
    }

    async toggleReady() {
        this.playClick();
        const roomRef = doc(db, "rooms", this.roomId);
        const snap = await getDoc(roomRef);
        if(this.isHost) await updateDoc(roomRef, { hostReady: !snap.data().hostReady });
        else await updateDoc(roomRef, { guestReady: !snap.data().guestReady });
    }

    async leaveRoom(deleteForHost = true) {
        if(this.roomUnsubscribe) this.roomUnsubscribe();
        if(this.chatUnsubscribe) this.chatUnsubscribe();
        this.roomId = null; this.isHost = false; this.currentDrawPhase = null;
        this.switchScreen('screen-home');
    }

    // --- CHAT SYSTEM ---
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if(!text || !this.roomId) return;
        input.value = '';
        await addDoc(collection(db, `rooms/${this.roomId}/chat`), { uid: this.user.uid, text: text, createdAt: serverTimestamp() });
    }

    listenToChat() {
        if(this.chatUnsubscribe) this.chatUnsubscribe();
        const q = query(collection(db, `rooms/${this.roomId}/chat`), orderBy("createdAt", "asc"));
        this.chatUnsubscribe = onSnapshot(q, (snapshot) => {
            const box = document.getElementById('chat-box');
            box.innerHTML = '';
            snapshot.forEach(docSnap => {
                const msg = docSnap.data();
                const isMe = msg.uid === this.user.uid;
                const div = document.createElement('div');
                div.className = `bubble ${isMe ? 'me' : 'partner'}`;
                div.innerText = msg.text;
                box.appendChild(div);
            });
            box.scrollTop = box.scrollHeight;
        });
        document.getElementById('chat-input').onkeypress = (e) => { if(e.key === 'Enter') this.sendMessage(); };
    }

    // --- GAME ENGINE ---
    showGameSelector() { this.switchScreen('screen-game-selector'); }

    async initGame(type) {
        this.playClick();
        this.currentDrawPhase = null;
        const initialState = this.getInitialGameState(type);
        await updateDoc(doc(db, "rooms", this.roomId), { status: 'playing', gameType: type, gameState: initialState });
    }

    async endGame() {
        this.playClick();
        if(this.tapInterval) clearInterval(this.tapInterval);
        if(this.drawTimerInterval) clearInterval(this.drawTimerInterval);
        await updateDoc(doc(db, "rooms", this.roomId), { status: 'lobby', gameType: null, gameState: {}, hostReady: false, guestReady: false });
    }

    getInitialGameState(type) {
        switch(type) {
            case 'fasttap': return { hostScore: 0, guestScore: 0, timeLeft: 10, playing: true };
            case 'whoknows': return { question: "Apa makanan favoritku?", hostAnswer: "", guestAnswer: "", revealed: false };
            case 'draw': return { 
                phase: 'category_select', // category_select, countdown, drawing, reveal, voting, result
                category: '', word: '', timeLeft: 60,
                hostImage: null, guestImage: null,
                hostVote: null, guestVote: null,
                hostPlayAgain: false, guestPlayAgain: false
            };
            default: return {};
        }
    }

    renderGameUI(type) {
        const area = document.getElementById('game-area');
        const title = document.getElementById('game-title');
        this.switchScreen('screen-active-game');

        if (type === 'draw') {
            title.innerText = "🎨 Draw Together";
            area.innerHTML = `
                <div id="draw-state-category" class="glass" style="padding:20px; text-align:center;">
                    <h4 style="margin-bottom:16px;">Pilih Kategori</h4>
                    ${this.isHost ? `
                        <div class="grid-2">
                            <button class="btn btn-outline" onclick="app.selectDrawCategory('Hewan')">🐶 Hewan</button>
                            <button class="btn btn-outline" onclick="app.selectDrawCategory('Buah')">🍎 Buah</button>
                            <button class="btn btn-outline" onclick="app.selectDrawCategory('Makanan')">🍔 Makanan</button>
                            <button class="btn btn-outline" onclick="app.selectDrawCategory('Kendaraan')">🚗 Kendaraan</button>
                        </div>
                        <button class="btn" onclick="app.selectDrawCategory('Random')">🌎 Random</button>
                    ` : `<p style="color:var(--text-muted);">Menunggu Host memilih kategori...</p>`}
                </div>

                <div id="draw-state-countdown" class="countdown-big" style="display:none;">
                    <div id="countdown-number" class="countdown-text">3</div>
                </div>

                <div id="draw-state-canvas" style="display:none; flex-direction:column; height:100%;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; background:rgba(0,0,0,0.3); padding:8px 16px; border-radius:12px;">
                        <span style="color:var(--success); font-weight:bold;" id="draw-word-display">Word</span>
                        <span style="color:var(--primary); font-weight:bold;" id="draw-timer-display">60s</span>
                    </div>
                    <div class="game-canvas-wrapper" style="margin-bottom:0; flex-grow:1;">
                        <canvas id="drawing-canvas" style="width:100%; height:100%; touch-action:none;"></canvas>
                    </div>
                    <div class="draw-tools">
                        <input type="color" id="draw-color" class="color-picker" value="#000000" onchange="app.setDrawColor(this.value)">
                        <button class="tool-btn active" id="btn-brush" onclick="app.setEraser(false)">🖌️</button>
                        <button class="tool-btn" id="btn-eraser" onclick="app.setEraser(true)">🧹</button>
                        <input type="range" id="draw-size" min="1" max="20" value="3" style="width:80px; margin:0;" onchange="app.setBrushSize(this.value)">
                        <button class="tool-btn" onclick="app.undoDraw()">↩️</button>
                        <button class="tool-btn" onclick="app.clearCanvas()">🗑️</button>
                    </div>
                </div>

                <div id="draw-state-reveal" style="display:none; flex-direction:column;">
                    <h3 style="text-align:center; color:var(--success); margin-bottom:5px;" id="reveal-word-title">Word</h3>
                    <p style="text-align:center; font-size:12px; color:var(--text-muted); margin-bottom:15px;">Voting Time!</p>
                    <div class="reveal-grid">
                        <div class="reveal-card">
                            <h5>${this.roomData.hostName}</h5>
                            <img id="reveal-host-img" class="reveal-img" src="">
                            <button id="btn-vote-host" class="btn btn-outline vote-btn" onclick="app.voteDraw('host')">Vote Host</button>
                        </div>
                        <div class="reveal-card">
                            <h5>${this.roomData.guestName}</h5>
                            <img id="reveal-guest-img" class="reveal-img" src="">
                            <button id="btn-vote-guest" class="btn btn-outline vote-btn" onclick="app.voteDraw('guest')">Vote Partner</button>
                        </div>
                    </div>
                    <div id="draw-result-banner" style="text-align:center; margin-top:20px; font-size:24px; font-weight:bold; color:var(--primary); display:none;"></div>
                    <button id="btn-draw-playagain" class="btn" style="margin-top:20px; display:none;" onclick="app.playAgainDraw()">Play Again</button>
                </div>
            `;
        }
        else if (type === 'fasttap') {
            title.innerText = "⚡ Fast Tap";
            area.innerHTML = `
                <div class="score-board"><span style="color:var(--primary)">Me: <span id="ft-my-score">0</span></span> - <span style="color:var(--secondary)">Partner: <span id="ft-partner-score">0</span></span></div>
                <h2 id="ft-timer" style="font-size:40px; text-align:center;">10s</h2>
                <div class="glass tap-area tap-me" id="btn-tap">TAP!</div>
            `;
            if(this.isHost) {
                this.tapInterval = setInterval(async () => {
                    if(this.gameState.timeLeft > 0) await updateDoc(doc(db, "rooms", this.roomId), { "gameState.timeLeft": this.gameState.timeLeft - 1 });
                    else { clearInterval(this.tapInterval); await updateDoc(doc(db, "rooms", this.roomId), { "gameState.playing": false }); }
                }, 1000);
            }
            document.getElementById('btn-tap').onclick = () => {
                if(!this.gameState.playing) return;
                this.spawnHeart();
                const key = this.isHost ? "gameState.hostScore" : "gameState.guestScore";
                const score = this.isHost ? this.gameState.hostScore : this.gameState.guestScore;
                updateDoc(doc(db, "rooms", this.roomId), { [key]: score + 1 });
            };
        }
        else if (type === 'whoknows') {
            title.innerText = "🤔 Who Knows Me Better";
            area.innerHTML = `
                <div class="glass" style="padding:20px; text-align:center; margin-bottom: 20px;"><h3 id="wk-question" class="text-gradient">...</h3></div>
                <div id="wk-input-area"><input type="text" id="wk-answer" placeholder="Tulis jawabanmu..."><button class="btn" id="btn-wk-submit">Submit Jawaban</button></div>
                <div id="wk-result-area" style="display:none; text-align:center;">
                    <div class="grid-2"><div class="glass player-card"><h4>Host</h4><h3 id="wk-host-ans" style="color:var(--success)">?</h3></div><div class="glass player-card"><h4>Partner</h4><h3 id="wk-guest-ans" style="color:var(--success)">?</h3></div></div>
                    ${this.isHost ? `<button class="btn btn-outline" id="btn-wk-next" style="margin-top:20px;">Next Question</button>` : `<p>Menunggu Host...</p>`}
                </div>
            `;
            document.getElementById('btn-wk-submit').onclick = async () => {
                const ans = document.getElementById('wk-answer').value;
                if(!ans) return;
                await updateDoc(doc(db, "rooms", this.roomId), { [this.isHost ? "gameState.hostAnswer" : "gameState.guestAnswer"]: ans });
                document.getElementById('wk-input-area').innerHTML = "<h3 style='text-align:center;'>Menunggu partner...</h3>";
            };
            if(this.isHost) {
                const nextBtn = document.getElementById('btn-wk-next');
                if(nextBtn) nextBtn.onclick = async () => {
                    const qs = ["Apa ukuran sepatuku?", "Apa kebiasaan burukku?", "Tempat kencan favoritku?"];
                    await updateDoc(doc(db, "rooms", this.roomId), { gameState: { question: qs[Math.floor(Math.random()*qs.length)], hostAnswer: "", guestAnswer: "", revealed: false } });
                };
            }
        }
    }

    updateGameStateUI(type, state) {
        if (type === 'draw') {
            const elCat = document.getElementById('draw-state-category');
            const elCount = document.getElementById('draw-state-countdown');
            const elCanvas = document.getElementById('draw-state-canvas');
            const elReveal = document.getElementById('draw-state-reveal');
            if(!elCat || !elCount || !elCanvas || !elReveal) return; // safeguard

            // Detect Phase Change
            if (this.currentDrawPhase !== state.phase) {
                this.currentDrawPhase = state.phase;
                
                // Hide all first
                elCat.style.display = 'none';
                elCount.style.display = 'none';
                elCanvas.style.display = 'none';
                elReveal.style.display = 'none';

                if (state.phase === 'category_select') {
                    elCat.style.display = 'block';
                } 
                else if (state.phase === 'countdown') {
                    elCount.style.display = 'flex';
                    this.runCountdownAnimation();
                } 
                else if (state.phase === 'drawing') {
                    elCanvas.style.display = 'flex';
                    document.getElementById('draw-word-display').innerText = state.word;
                    this.initCanvasEngine();
                    if(this.isHost) {
                        this.drawTimerInterval = setInterval(async () => {
                            if(this.gameState.timeLeft > 0) {
                                await updateDoc(doc(db, "rooms", this.roomId), { "gameState.timeLeft": this.gameState.timeLeft - 1 });
                            } else {
                                clearInterval(this.drawTimerInterval);
                                await updateDoc(doc(db, "rooms", this.roomId), { "gameState.phase": 'reveal' });
                            }
                        }, 1000);
                    }
                }
                else if (state.phase === 'reveal') {
                    // Everyone saves their canvas when entering reveal
                    this.uploadDrawing();
                    elReveal.style.display = 'flex';
                    document.getElementById('reveal-word-title').innerText = state.word;
                }
            }

            // Continuous updates
            if (state.phase === 'drawing') {
                const timerEl = document.getElementById('draw-timer-display');
                if(timerEl) {
                    timerEl.innerText = state.timeLeft + "s";
                    if(state.timeLeft <= 10) timerEl.style.color = "var(--danger)";
                }
            }
            else if (state.phase === 'reveal' || state.phase === 'result') {
                const hostImgEl = document.getElementById('reveal-host-img');
                const guestImgEl = document.getElementById('reveal-guest-img');
                if (state.hostImage && hostImgEl.src !== state.hostImage) hostImgEl.src = state.hostImage;
                if (state.guestImage && guestImgEl.src !== state.guestImage) guestImgEl.src = state.guestImage;

                // Voting logic disable self vote
                const btnHost = document.getElementById('btn-vote-host');
                const btnGuest = document.getElementById('btn-vote-guest');
                if(this.isHost && btnHost) btnHost.disabled = true;
                if(!this.isHost && btnGuest) btnGuest.disabled = true;

                // Check if both voted
                if (state.hostVote && state.guestVote) {
                    btnHost.style.display = 'none';
                    btnGuest.style.display = 'none';
                    
                    let resultText = "It's a Tie! 🤝";
                    if(state.hostVote === 'host' && state.guestVote === 'host') resultText = "Host Wins! 👑";
                    if(state.hostVote === 'guest' && state.guestVote === 'guest') resultText = "Partner Wins! 💖";
                    if(state.hostVote === 'guest' && state.guestVote === 'host') resultText = "Both voted each other! 💌";

                    const banner = document.getElementById('draw-result-banner');
                    banner.innerText = resultText;
                    banner.style.display = 'block';

                    document.getElementById('btn-draw-playagain').style.display = 'block';

                    // Update profile win state (only once per match logic can be expanded)
                    if(state.phase !== 'result' && this.isHost) {
                         updateDoc(doc(db, "rooms", this.roomId), { "gameState.phase": 'result' });
                    }
                }
            }
        }
        else if (type === 'fasttap') {
            const elMyScore = document.getElementById('ft-my-score'), elPartScore = document.getElementById('ft-partner-score'), elTimer = document.getElementById('ft-timer'), btnTap = document.getElementById('btn-tap');
            if(elMyScore) elMyScore.innerText = this.isHost ? state.hostScore : state.guestScore;
            if(elPartScore) elPartScore.innerText = this.isHost ? state.guestScore : state.hostScore;
            if(elTimer) elTimer.innerText = state.timeLeft + "s";
            if(!state.playing && btnTap) {
                btnTap.innerHTML = "TIME'S UP!"; btnTap.className = "glass tap-area tap-partner";
                let w = "Tie!"; 
                const m = this.isHost ? state.hostScore : state.guestScore, p = this.isHost ? state.guestScore : state.hostScore;
                if(m>p) w = "You Win! 🎉"; if(m<p) w = "Partner Wins! 😜";
                elTimer.innerText = w; if(this.isHost) clearInterval(this.tapInterval);
            }
        }
        else if (type === 'whoknows') {
            const qEl = document.getElementById('wk-question'); if(qEl) qEl.innerText = state.question;
            if(state.hostAnswer && state.guestAnswer && !state.revealed && this.isHost) updateDoc(doc(db, "rooms", this.roomId), { "gameState.revealed": true });
            if(state.revealed) {
                const ia = document.getElementById('wk-input-area'), ra = document.getElementById('wk-result-area');
                if(ia) ia.style.display = 'none';
                if(ra) { ra.style.display = 'block'; document.getElementById('wk-host-ans').innerText = state.hostAnswer; document.getElementById('wk-guest-ans').innerText = state.guestAnswer; }
            }
        }
    }

    // --- DRAW TOGETHER SPECIFIC METHODS ---
    async selectDrawCategory(category) {
        this.playClick();
        let words = DRAW_WORDS[category];
        if(category === 'Random') {
            words = [].concat(DRAW_WORDS['Hewan'], DRAW_WORDS['Buah'], DRAW_WORDS['Makanan'], DRAW_WORDS['Kendaraan']);
        }
        const word = words[Math.floor(Math.random() * words.length)];
        await updateDoc(doc(db, "rooms", this.roomId), {
            "gameState.category": category,
            "gameState.word": word,
            "gameState.phase": 'countdown'
        });
    }

    runCountdownAnimation() {
        const numEl = document.getElementById('countdown-number');
        let count = 3;
        numEl.innerText = count;
        const iv = setInterval(() => {
            count--;
            if(count > 0) { numEl.innerText = count; } 
            else if (count === 0) { numEl.innerText = "GO!"; }
            else {
                clearInterval(iv);
                if(this.isHost) {
                    updateDoc(doc(db, "rooms", this.roomId), { "gameState.phase": 'drawing' });
                }
            }
        }, 1000);
    }

    initCanvasEngine() {
        const canvasEl = document.getElementById('drawing-canvas');
        if(!canvasEl) return;
        const wrapper = canvasEl.parentElement;
        
        // Setup High DPI Canvas
        canvasEl.width = wrapper.clientWidth;
        canvasEl.height = wrapper.clientHeight;
        
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d', { willReadFrequently: true });
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // White background default
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveCanvasState(); // save initial blank state

        // Event Listeners
        this.isDrawing = false;

        const startPosition = (e) => {
            if(this.gameState.phase !== 'drawing') return;
            this.isDrawing = true;
            this.draw(e);
        };

        const endPosition = () => {
            if(!this.isDrawing) return;
            this.isDrawing = false;
            this.ctx.beginPath();
            this.saveCanvasState();
        };

        const draw = (e) => {
            if(!this.isDrawing || this.gameState.phase !== 'drawing') return;
            e.preventDefault();
            
            let rect = this.canvas.getBoundingClientRect();
            let x = (e.clientX || e.touches[0].clientX) - rect.left;
            let y = (e.clientY || e.touches[0].clientY) - rect.top;

            this.ctx.lineWidth = this.currentBrushSize;
            if (this.isEraser) {
                this.ctx.strokeStyle = "#ffffff"; // Eraser uses white
            } else {
                this.ctx.strokeStyle = this.currentColor;
            }

            this.ctx.lineTo(x, y);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
        };

        this.draw = draw; // Bind for internal use

        this.canvas.addEventListener('mousedown', startPosition);
        this.canvas.addEventListener('mouseup', endPosition);
        this.canvas.addEventListener('mousemove', draw);
        this.canvas.addEventListener('mouseout', endPosition);

        this.canvas.addEventListener('touchstart', startPosition, {passive: false});
        this.canvas.addEventListener('touchend', endPosition);
        this.canvas.addEventListener('touchmove', draw, {passive: false});
    }

    saveCanvasState() {
        if(!this.canvas) return;
        this.drawHistory.push(this.canvas.toDataURL());
        this.redoHistory = []; // clear redo on new draw
    }

    setDrawColor(color) {
        this.currentColor = color;
        this.setEraser(false);
    }

    setBrushSize(size) {
        this.currentBrushSize = size;
    }

    setEraser(isEraser) {
        this.isEraser = isEraser;
        const btnB = document.getElementById('btn-brush');
        const btnE = document.getElementById('btn-eraser');
        if(isEraser) {
            btnB.classList.remove('active');
            btnE.classList.add('active');
        } else {
            btnB.classList.add('active');
            btnE.classList.remove('active');
        }
    }

    undoDraw() {
        if (this.drawHistory.length > 1) {
            this.redoHistory.push(this.drawHistory.pop());
            this.restoreCanvasState(this.drawHistory[this.drawHistory.length - 1]);
        }
    }

    clearCanvas() {
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveCanvasState();
    }

    restoreCanvasState(dataUrl) {
        let img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        }
    }

    async uploadDrawing() {
        if(!this.canvas) return;
        const dataUrl = this.canvas.toDataURL("image/jpeg", 0.7); // compress slightly
        const key = this.isHost ? "gameState.hostImage" : "gameState.guestImage";
        try {
            await updateDoc(doc(db, "rooms", this.roomId), { [key]: dataUrl });
        } catch (e) {
            console.error("Failed to upload image", e);
        }
    }

    async voteDraw(targetPlayer) {
        this.playClick();
        const key = this.isHost ? "gameState.hostVote" : "gameState.guestVote";
        await updateDoc(doc(db, "rooms", this.roomId), { [key]: targetPlayer });
    }

    async playAgainDraw() {
        this.playClick();
        const key = this.isHost ? "gameState.hostPlayAgain" : "gameState.guestPlayAgain";
        await updateDoc(doc(db, "rooms", this.roomId), { [key]: true });
        
        // if host, check if guest also true, then restart
        if(this.isHost && this.gameState.guestPlayAgain) {
            const initialState = this.getInitialGameState('draw');
            await updateDoc(doc(db, "rooms", this.roomId), { gameState: initialState });
        } else if (!this.isHost && this.gameState.hostPlayAgain) {
            const initialState = this.getInitialGameState('draw');
            await updateDoc(doc(db, "rooms", this.roomId), { gameState: initialState });
        }
    }
}

// Init App Globally
window.app = new CouplePlayApp();
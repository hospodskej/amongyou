import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, set, update } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBi8AdBSoQn9SEUApYCOKyXZkn24G5yDVo",
    authDomain: "among-you-v1.firebaseapp.com",
    databaseURL: "https://among-you-v1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "among-you-v1",
    storageBucket: "among-you-v1.firebasestorage.app",
    messagingSenderId: "87936480180",
    appId: "1:87936480180:web:f68d670028260cf37738e1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myId = null;
let currentPlayersList = [];
let cooldownActive = false;
let countdownInterval = null;

// Audio with versioning to prevent browser caching issues
const siren = new Audio('sirena.mp3?v=5'); 
siren.loop = true;
const silentUnlock = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');

const joinBtn = document.getElementById('join-btn');
const startBtn = document.getElementById('start-game-btn');
const resetBtn = document.getElementById('reset-game-btn');
const restartBtn = document.getElementById('restart-game-btn');
const emergencyBtn = document.getElementById('emergency-btn');
const silenceBtn = document.getElementById('silence-alarm-btn');
const endMeetingBtn = document.getElementById('end-meeting-btn');
const meetingBtn = document.getElementById('meeting-in-progress-btn');
const statusUI = document.getElementById('meeting-status');
const nameInput = document.getElementById('player-name');
const timerUI = document.getElementById('timer-display');
const timerContainer = document.getElementById('timer-container');
const roleDisplay = document.getElementById('role-display');
const intelDisplay = document.getElementById('intel-display');

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    silentUnlock.play().catch(() => {});
    if (name.toLowerCase() === 'pavel') {
        if (startBtn) startBtn.style.display = 'block';
        if (resetBtn) resetBtn.style.display = 'block';
        if (restartBtn) restartBtn.style.display = 'block';
    }
    const newRef = push(ref(db, 'players'));
    myId = newRef.key;
    set(newRef, { name: name, role: 'WAITING' });
});

if (emergencyBtn) emergencyBtn.addEventListener('click', () => !cooldownActive && set(ref(db, 'gameState'), 'ALARM'));
if (silenceBtn) silenceBtn.addEventListener('click', () => set(ref(db, 'gameState'), 'MEETING'));
if (endMeetingBtn) endMeetingBtn.addEventListener('click', () => set(ref(db, 'gameState'), 'STARTED'));

if (startBtn) {
    startBtn.addEventListener('click', () => {
        if (currentPlayersList.length < 3) return alert("Need 3+ players!");
        
        // true = 3 Impostors (Inc. Blackmailer), false = 2 Impostors (Inc. Blackmailer) + 1 Spy
        const threeImpostorsMode = Math.random() < 0.5; 
        
        const shuffled = [...currentPlayersList].sort(() => 0.5 - Math.random());
        const updates = {};
        
        shuffled.forEach((p, i) => {
            let role = 'CREWMATE';
            
            if (i === 0) {
                role = 'IMPOSTOR';
            } 
            else if (i === 1) {
                role = 'BLACKMAILER';
            }
            else if (i === 2) {
                // If Spy is in game, there are only 2 Impostors (the ones at index 0 and 1)
                role = threeImpostorsMode ? 'IMPOSTOR' : 'SPY'; 
            }
            else if (i === 3) role = 'DETECTIVE';
            else if (i === 4) role = 'JESTER';
            else if (i === 5) role = 'POLITICIAN';
            else if (i === 6) role = 'COMEDIAN';
            
            updates[`players/${p.id}/role`] = role;
        });
        
        updates['gameState'] = 'STARTED';
        update(ref(db), updates);
    });
}

let lastState = 'LOBBY';

onValue(ref(db), (snapshot) => {
    const data = snapshot.val();
    if (!data || !myId) { showScreen('join-screen'); return; }

    const players = data.players || {};
    const state = data.gameState || 'LOBBY';
    const isPavel = nameInput.value.toLowerCase() === 'pavel';
    currentPlayersList = Object.entries(players).map(([id, p]) => ({ id, ...p }));

    if (state === 'ALARM' && lastState !== 'ALARM') {
        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
        siren.currentTime = 0;
        siren.play().catch(() => {});
    }
    if (state === 'MEETING') siren.pause();
    if (state === 'STARTED' && (lastState === 'ALARM' || lastState === 'MEETING')) {
        siren.pause();
        startCooldown(40);
    }

    if (state === 'LOBBY') {
        siren.pause();
        cooldownActive = false;
        stopTimer();
        showScreen('lobby-screen');
        document.getElementById('player-list').innerHTML = currentPlayersList.map(p => `<li>${p.name}</li>`).join('');
        document.getElementById('player-count').textContent = currentPlayersList.length;
    } else {
        showScreen('game-screen');
        const me = players[myId];
        
        if (roleDisplay) {
            roleDisplay.textContent = me?.role || '...';
            // Keep the text color white for everyone
            roleDisplay.style.color = '#ffffff';
        }
        
        [emergencyBtn, silenceBtn, endMeetingBtn, meetingBtn, statusUI].forEach(el => { if (el) el.style.display = 'none'; });

        if (state === 'ALARM') {
            statusUI.style.display = 'block';
            statusUI.textContent = 'EMERGENCY MEETING CALLED';
            isPavel ? (silenceBtn.style.display = 'block') : (meetingBtn.style.display = 'block');
        } else if (state === 'MEETING') {
            statusUI.style.display = 'block';
            statusUI.textContent = 'EMERGENCY MEETING';
            isPavel ? (endMeetingBtn.style.display = 'block') : (meetingBtn.style.display = 'block');
        } else {
            cooldownActive ? (meetingBtn.style.display = 'block', meetingBtn.textContent = "Cooldown active...") : (emergencyBtn.style.display = 'block');
        }

        intelDisplay.innerHTML = '';
        if (me?.role === 'IMPOSTOR' || me?.role === 'BLACKMAILER') {
            const filtered = currentPlayersList.filter(p => 
                (p.role === 'IMPOSTOR' || p.role === 'BLACKMAILER' || p.role === 'SPY') && 
                p.id !== myId
            );
            
            let names = filtered.map(p => p.name).sort(() => 0.5 - Math.random());
            
            if (names.length > 0) {
                intelDisplay.innerHTML = `
                    <p style="color:#888; margin-top:20px;">Team / Intel:</p>
                    ${names.map(name => `<strong>${name}</strong>`).join('')}
                `;
            }
        }
    }
    lastState = state;
});

function startCooldown(seconds) {
    cooldownActive = true;
    if (timerContainer) timerContainer.style.display = 'block';
    let timeLeft = seconds;
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        if (timerUI) timerUI.textContent = --timeLeft;
        if (timeLeft <= 0) {
            cooldownActive = false;
            if (timerContainer) timerContainer.style.display = 'none';
            clearInterval(countdownInterval);
            if (lastState === 'STARTED') emergencyBtn.style.display = 'block';
            meetingBtn.style.display = 'none';
        }
    }, 1000);
}

function stopTimer() {
    if (timerContainer) timerContainer.style.display = 'none';
    clearInterval(countdownInterval);
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex';
}

const nuke = () => { if (confirm("Reset?")) { remove(ref(db)); location.reload(); }};
if (resetBtn) resetBtn.addEventListener('click', nuke);
if (restartBtn) restartBtn.addEventListener('click', nuke);

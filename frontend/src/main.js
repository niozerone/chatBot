const App = window.go.main.App;

const chatContainer = document.getElementById('chatContainer');
const promptInput = document.getElementById('promptInput');
const typingIndicator = document.getElementById('typingIndicator');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileUpload = document.getElementById('fileUpload');
const fileBadge = document.getElementById('fileBadge');
const chatList = document.getElementById('chatList');

// Database Sederhana berbasis Local Storage
let chatSessions = JSON.parse(localStorage.getItem('valorantChats')) || [];
let currentSessionId = null;

let currentBase64 = "";
let currentMimeType = "";
let currentFileName = "";

function initApp() {
    if (chatSessions.length === 0) startNewChat();
    else switchChat(chatSessions[chatSessions.length - 1].id);
    renderSidebar();
}

function startNewChat() {
    const newId = Date.now().toString();
    chatSessions.push({ id: newId, title: "New Mission", messages: [] });
    saveData();
    switchChat(newId);
}

function renderSidebar() {
    chatList.innerHTML = '';
    const reversedSessions = [...chatSessions].reverse(); 
    
    reversedSessions.forEach(session => {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-item-wrapper';
        if (session.id === currentSessionId) wrapper.classList.add('active');

        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerText = session.title;
        item.onclick = () => switchChat(session.id);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = "Delete Chat";
        delBtn.onclick = (e) => { e.stopPropagation(); deleteChat(session.id); };

        wrapper.appendChild(item);
        wrapper.appendChild(delBtn);
        chatList.appendChild(wrapper);
    });
}

function deleteChat(id) {
    chatSessions = chatSessions.filter(s => s.id !== id);
    saveData();
    if (chatSessions.length === 0) startNewChat();
    else if (currentSessionId === id) switchChat(chatSessions[chatSessions.length - 1].id);
    else renderSidebar();
}

function switchChat(id) {
    currentSessionId = id;
    renderSidebar();
    chatContainer.innerHTML = '';
    
    const session = chatSessions.find(s => s.id === id);
    if (session.messages.length === 0) {
        renderBubbleUI("**System Online.** Ready for tactical input desu~ (≧▽≦)", "ai");
    } else {
        session.messages.forEach(msg => renderBubbleUI(msg.text, msg.sender));
        chatContainer.scrollTop = chatContainer.scrollHeight; 
    }
}

function saveData() {
    localStorage.setItem('valorantChats', JSON.stringify(chatSessions));
    renderSidebar();
}

function renderBubbleUI(text, sender) {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    
    if (sender === 'user') {
        bubble.classList.add('user-bubble');
        bubble.innerText = text; 
    } else {
        bubble.classList.add('ai-bubble');
        bubble.innerHTML = marked.parse(text); 
    }
    chatContainer.appendChild(bubble);
    return bubble; 
}

function addMessage(text, sender) {
    const session = chatSessions.find(s => s.id === currentSessionId);
    session.messages.push({ text: text, sender: sender });
    
    // Set judul otomatis berdasar input pertama user
    if (sender === 'user' && session.messages.length <= 2) {
        session.title = text.substring(0, 20).replace(/\n/g, ' ') + '...';
    }
    saveData();

    const bubbleElemen = renderBubbleUI(text, sender);

    // Auto-Scroll Pintar
    if (sender === 'user') {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
        setTimeout(() => {
            chatContainer.scrollTo({ top: bubbleElemen.offsetTop - 20, behavior: 'smooth' });
        }, 50);
    }
}

// Logika Attachment File
fileUpload.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) { clearAttachment(); return; }

    currentFileName = file.name;
    currentMimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain');

    fileBadge.innerText = `📎 ${currentFileName}`;
    fileBadge.style.display = 'flex';
    promptInput.focus();

    const reader = new FileReader();
    reader.onload = function(e) { currentBase64 = e.target.result.split(',')[1]; };
    reader.readAsDataURL(file);
});

function clearAttachment() {
    currentBase64 = ""; currentMimeType = ""; currentFileName = "";
    fileUpload.value = ""; fileBadge.style.display = 'none';
}

// Fungsi Utama ke Backend Go
async function executeGemini() {
    let promptText = promptInput.value.trim();
    if (!promptText && !currentBase64) return; 

    // Auto-prompt jika hanya mengirim file
    if (!promptText && currentBase64) {
        if (currentMimeType.startsWith('image/')) promptText = "Tolong jelaskan gambar ini Senpai~";
        else if (currentMimeType.startsWith('audio/')) promptText = "Ini transkrip audionya desu:";
        else promptText = "Tolong buat ringkasan dokumen berikut:";
    }

    let displayPesan = promptText;
    if (currentFileName) displayPesan = `[ATTACHED: ${currentFileName}]\n` + promptText;
    
    addMessage(displayPesan, 'user');
    
    // Persiapan Memory / History
    const session = chatSessions.find(s => s.id === currentSessionId);
    let rawHistory = session.messages.slice(0, -1);
    let historyContext = rawHistory.slice(-10); // Ambil maksimal 10 histori terakhir
    const historyJSON = JSON.stringify(historyContext); 

    promptInput.value = '';
    promptInput.disabled = true; sendBtn.disabled = true; attachBtn.disabled = true;
    typingIndicator.style.display = 'block';
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        const result = await App.ProcessData(promptText, currentBase64, currentMimeType, historyJSON); 
        typingIndicator.style.display = 'none';

        // --- ERROR HANDLING WIBU STYLE ---
        if (result.includes("Error 429") || result.includes("Quota exceeded")) {
            addMessage("Gomen nasai Senpai~ (T_T) Radiant-chan lagi ngos-ngosan nih (Kena Limit API). Tunggu sekitar 30 detik lagi baru chat Radiant-chan ya desu~", 'ai');
        } else if (result.includes("SYSTEM_ERR") || result.includes("AI_RESPONSE_ERR")) {
            addMessage("**[SYSTEM CRASH]** Baka! Ada yang salah dengan koneksi sistem desu: \n" + result, 'ai');
        } else {
            addMessage(result, 'ai'); 
        }

    } catch (err) {
        typingIndicator.style.display = 'none';
        addMessage("**[CRITICAL ERROR]** Radiant-chan pingsan! (x_x) " + err, 'ai');
    } finally {
        promptInput.disabled = false; sendBtn.disabled = false; attachBtn.disabled = false;
        clearAttachment(); 
        promptInput.focus();
    }
}

// Fitur Enter untuk kirim
promptInput.addEventListener("keypress", function(event) {
    if (event.key === "Enter") { event.preventDefault(); executeGemini(); }
});

// Binding fungsi-fungsi penting ke Window agar bisa diakses HTML
window.executeGemini = executeGemini;
window.startNewChat = startNewChat;
window.closeApplication = function() { App.CloseApp(); };

// Inisialisasi awal aplikasi
initApp();
(() => {
  if (!token() || window.__jimmyChatLoaded) return;
  window.__jimmyChatLoaded = true;

  let chatOpen = false;
  let chatMessages = [];
  let lastMessageId = Number(localStorage.getItem('jimmyChatLastMessageId') || 0);
  let lastSeenId = Number(localStorage.getItem('jimmyChatLastSeenId') || 0);
  let replyTo = null;
  let mediaRecorder = null;
  let audioChunks = [];

  function currentId() { return Number(currentUser()?.id || 0); }
  function verifiedBadge() { return '<span class="chat-verified" title="Verified user">✓</span>'; }
  function escapeAttr(v) { return escapeHtml(v).replace(/`/g, '&#96;'); }

  function ensureChatDom() {
    if (document.getElementById('jimmyChatButton')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button id="jimmyChatButton" class="chat-float-button" type="button" aria-label="Open Jimmy Community chat">
        <span class="chat-float-icon">💬</span><span id="jimmyChatUnread" class="chat-unread" style="display:none">0</span>
      </button>
      <div id="jimmyChatPanel" class="chat-panel" aria-hidden="true">
        <div class="chat-header">
          <div class="chat-group-title"><img src="/assets/jimmy-logo.svg" alt="Jimmy"><div><b>Jimmy Community</b><span>Admin, Manager and Merchandisers</span></div></div>
          <button class="chat-close" type="button" id="jimmyChatClose">×</button>
        </div>
        <div id="jimmyChatMessages" class="chat-messages"></div>
        <div id="jimmyChatReply" class="chat-reply-preview" style="display:none"><div><b id="jimmyChatReplyName"></b><span id="jimmyChatReplyBody"></span></div><button type="button" id="jimmyChatReplyClear">×</button></div>
        <div id="jimmyChatAttachPreview" class="chat-attach-preview" style="display:none"></div>
        <div class="chat-compose">
          <button id="jimmyChatAttach" class="chat-icon-btn" type="button" aria-label="Attach file">📎</button>
          <input id="jimmyChatFile" type="file" hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip">
          <textarea id="jimmyChatInput" rows="1" placeholder="Message"></textarea>
          <button id="jimmyChatVoice" class="chat-icon-btn" type="button" aria-label="Record voice message">🎙️</button>
          <button id="jimmyChatSend" class="chat-send" type="button">➤</button>
        </div>
      </div>
      <div id="jimmyChatProfileModal" class="chat-profile-modal" style="display:none"></div>
    `;
    document.body.appendChild(wrap);
    document.getElementById('jimmyChatButton').addEventListener('click', openChat);
    document.getElementById('jimmyChatClose').addEventListener('click', closeChat);
    document.getElementById('jimmyChatSend').addEventListener('click', sendChatMessage);
    document.getElementById('jimmyChatAttach').addEventListener('click', () => document.getElementById('jimmyChatFile').click());
    document.getElementById('jimmyChatFile').addEventListener('change', renderAttachPreview);
    document.getElementById('jimmyChatReplyClear').addEventListener('click', clearReply);
    document.getElementById('jimmyChatVoice').addEventListener('click', toggleVoiceRecording);
    document.getElementById('jimmyChatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
  }

  async function askNotificationsOnce() {
    if (!('Notification' in window)) return;
    if (localStorage.getItem('jimmyNotificationAsked') === 'yes') return;
    localStorage.setItem('jimmyNotificationAsked', 'yes');
    try { if (Notification.permission === 'default') await Notification.requestPermission(); } catch {}
  }

  function playChatSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }

  function showNotification(msg) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (document.visibilityState === 'visible' && chatOpen) return;
      new Notification(`Jimmy Community - ${msg.sender_name}`, { body: msg.deleted_at ? 'This message was deleted' : (msg.body || msg.file_name || 'New attachment'), icon: '/assets/icons/icon-192.png' });
    } catch {}
  }

  async function pollMessages() {
    try {
      ensureChatDom();
      const data = await api(`/api/chat/messages?after_id=${lastMessageId}`);
      const incoming = data.messages || [];
      if (incoming.length) {
        for (const m of incoming) {
          chatMessages.push(m);
          lastMessageId = Math.max(lastMessageId, Number(m.id));
          if (Number(m.sender_id) !== currentId() && Number(m.id) > lastSeenId) {
            playChatSound();
            showNotification(m);
          }
        }
        localStorage.setItem('jimmyChatLastMessageId', String(lastMessageId));
        renderMessages();
        updateUnread();
      }
    } catch (err) { console.warn('Chat poll failed', err); }
  }

  function updateUnread() {
    const count = chatMessages.filter(m => Number(m.id) > lastSeenId && Number(m.sender_id) !== currentId()).length;
    const badge = document.getElementById('jimmyChatUnread');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count ? 'inline-flex' : 'none';
  }

  function openChat() {
    chatOpen = true;
    document.getElementById('jimmyChatPanel').classList.add('open');
    document.getElementById('jimmyChatPanel').setAttribute('aria-hidden','false');
    lastSeenId = lastMessageId;
    localStorage.setItem('jimmyChatLastSeenId', String(lastSeenId));
    updateUnread();
    renderMessages();
    setTimeout(() => document.getElementById('jimmyChatInput')?.focus(), 100);
  }
  function closeChat() {
    chatOpen = false;
    document.getElementById('jimmyChatPanel').classList.remove('open');
    document.getElementById('jimmyChatPanel').setAttribute('aria-hidden','true');
  }

  function senderAvatar(m) {
    if (m.sender_profile_image) return `<img src="${escapeAttr(m.sender_profile_image)}" alt="${escapeAttr(m.sender_name)}">`;
    return `<span>${escapeHtml((m.sender_name || 'U')[0] || 'U')}</span>`;
  }
  function messageAttachment(m) {
    if (!m.file_url) return '';
    if (m.message_type === 'image') return `<a href="${escapeAttr(m.file_url)}" target="_blank"><img class="chat-img" src="${escapeAttr(m.file_url)}" alt="${escapeAttr(m.file_name || 'Image')}"></a>`;
    if (m.message_type === 'video') return `<video class="chat-video" src="${escapeAttr(m.file_url)}" controls></video>`;
    if (m.message_type === 'audio') return `<audio class="chat-audio" src="${escapeAttr(m.file_url)}" controls></audio>`;
    return `<a class="chat-doc" href="${escapeAttr(m.file_url)}" target="_blank">📄 ${escapeHtml(m.file_name || 'Document')}</a>`;
  }
  function renderMessages() {
    const box = document.getElementById('jimmyChatMessages');
    if (!box) return;
    box.innerHTML = chatMessages.map(m => {
      const mine = Number(m.sender_id) === currentId();
      const deleted = Boolean(m.deleted_at);
      const reply = m.reply_to_message_id ? `<div class="chat-quoted"><b>${escapeHtml(m.reply_sender_name || 'Message')}</b><span>${escapeHtml(m.reply_body || 'Attachment')}</span></div>` : '';
      const unsend = m.can_unsend ? `<button class="chat-msg-action" onclick="jimmyChatUnsend(${m.id})">Unsend</button>` : '';
      const content = deleted ? '<i>This message was deleted</i>' : `${reply}${messageAttachment(m)}${m.body ? `<div class="chat-text">${escapeHtml(m.body)}</div>` : ''}`;
      return `<div class="chat-row ${mine ? 'mine' : 'theirs'}" data-id="${m.id}">
        ${mine ? '' : `<button class="chat-avatar" onclick="jimmyChatOpenProfile(${m.sender_id})">${senderAvatar(m)}</button>`}
        <div class="chat-bubble-wrap">
          <button class="chat-sender" onclick="jimmyChatOpenProfile(${m.sender_id})">${escapeHtml(m.sender_name)} ${verifiedBadge()}</button>
          <div class="chat-bubble" ontouchstart="jimmyChatTouchStart(event, ${m.id})" ontouchend="jimmyChatTouchEnd(event, ${m.id})">
            ${content}
            <div class="chat-meta"><button onclick="jimmyChatReply(${m.id})">Reply</button>${unsend}<span>${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="chat-empty">No messages yet. Start the Jimmy Community conversation.</div>';
    box.scrollTop = box.scrollHeight;
  }

  window.jimmyChatReply = (id) => {
    const m = chatMessages.find(x => Number(x.id) === Number(id));
    if (!m || m.deleted_at) return;
    replyTo = m;
    document.getElementById('jimmyChatReplyName').textContent = m.sender_name;
    document.getElementById('jimmyChatReplyBody').textContent = m.body || m.file_name || 'Attachment';
    document.getElementById('jimmyChatReply').style.display = 'flex';
  };
  function clearReply() { replyTo = null; document.getElementById('jimmyChatReply').style.display = 'none'; }

  let touchStartX = 0;
  window.jimmyChatTouchStart = (e) => { touchStartX = e.changedTouches?.[0]?.clientX || 0; };
  window.jimmyChatTouchEnd = (e, id) => {
    const end = e.changedTouches?.[0]?.clientX || 0;
    if (end - touchStartX > 55) window.jimmyChatReply(id);
  };

  window.jimmyChatUnsend = async (id) => {
    try {
      await api(`/api/chat/messages/${id}/unsend`, { method:'DELETE' });
      chatMessages = [];
      lastMessageId = 0;
      localStorage.setItem('jimmyChatLastMessageId', '0');
      await pollMessages();
    } catch (err) { alert(err.message); }
  };

  async function renderAttachPreview() {
    const file = document.getElementById('jimmyChatFile').files[0];
    const preview = document.getElementById('jimmyChatAttachPreview');
    if (!file) { preview.style.display = 'none'; return; }
    if (file.size > 25 * 1024 * 1024) { alert('Maximum file size is 25 MB.'); document.getElementById('jimmyChatFile').value = ''; return; }
    preview.textContent = `Attached: ${file.name}`;
    preview.style.display = 'block';
  }

  async function sendChatMessage(extraFileData = null, extraFileName = null, extraType = null) {
    try {
      const input = document.getElementById('jimmyChatInput');
      const fileInput = document.getElementById('jimmyChatFile');
      let fileDataUrl = extraFileData;
      let fileName = extraFileName;
      let messageType = extraType || 'text';
      if (!fileDataUrl && fileInput.files[0]) {
        fileName = fileInput.files[0].name;
        fileDataUrl = await fileToDataUrl(fileInput.files[0]);
      }
      const body = input.value.trim();
      if (!body && !fileDataUrl) return;
      const data = await api('/api/chat/messages', { method:'POST', body: JSON.stringify({ body, file_data_url: fileDataUrl, file_name: fileName, message_type: messageType, reply_to_message_id: replyTo?.id || null }) });
      input.value = ''; fileInput.value = ''; document.getElementById('jimmyChatAttachPreview').style.display = 'none'; clearReply();
      chatMessages.push(data.message); lastMessageId = Math.max(lastMessageId, Number(data.message.id));
      localStorage.setItem('jimmyChatLastMessageId', String(lastMessageId));
      renderMessages();
    } catch (err) { alert(err.message); }
  }

  async function toggleVoiceRecording() {
    const btn = document.getElementById('jimmyChatVoice');
    if (mediaRecorder && mediaRecorder.state === 'recording') { mediaRecorder.stop(); btn.classList.remove('recording'); btn.textContent = '🎙️'; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => { if (e.data.size) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const dataUrl = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
        await sendChatMessage(dataUrl, `voice-${Date.now()}.webm`, 'audio');
      };
      mediaRecorder.start(); btn.classList.add('recording'); btn.textContent = '⏹️';
    } catch (err) { alert('Microphone permission failed: ' + err.message); }
  }

  window.jimmyChatOpenProfile = async (userId) => {
    if (!userId) return;
    try {
      const data = await api(`/api/chat/users/${userId}/monthly-report`);
      const modal = document.getElementById('jimmyChatProfileModal');
      const u = data.user;
      const avatar = u.profile_image_path ? `<img src="${escapeAttr(u.profile_image_path)}" alt="${escapeAttr(u.name)}">` : `<span>${escapeHtml((u.name || 'U')[0])}</span>`;
      const direction = data.direction === 'higher' ? 'higher than' : data.direction === 'lower' ? 'lower than' : 'equal to';
      modal.innerHTML = `<div class="chat-profile-card">
        <button class="chat-profile-close" onclick="document.getElementById('jimmyChatProfileModal').style.display='none'">×</button>
        <div class="chat-profile-head"><div class="chat-profile-avatar">${avatar}</div><div><h2>${escapeHtml(u.name)} ${verifiedBadge()}</h2><p>${escapeHtml(u.employee_code || '')} · ${escapeHtml(u.role)}</p></div></div>
        <div class="chat-profile-stats">
          <div><span>This Month Products</span><b>${Number(data.current.qty || 0)}</b></div>
          <div><span>This Month Sales</span><b>${Number(data.current.value || 0).toFixed(2)}</b></div>
          <div><span>Reporting Days</span><b>${Number(data.current.days || 0)}</b></div>
        </div>
        <p class="hint">${escapeHtml(data.month_label)} sales are ${direction} ${escapeHtml(data.previous_month_label)}.</p>
        ${data.report ? `<button class="chat-report-btn" onclick="downloadReport('${escapeAttr(data.report.report_id)}')">View Monthly Sales Report</button>` : '<div class="chat-empty small">No monthly PDF report generated for this user yet.</div>'}
      </div>`;
      modal.style.display = 'flex';
    } catch (err) { alert(err.message); }
  };

  document.addEventListener('DOMContentLoaded', () => { ensureChatDom(); askNotificationsOnce(); pollMessages(); setInterval(pollMessages, 5000); });
  if (document.readyState !== 'loading') { ensureChatDom(); askNotificationsOnce(); pollMessages(); setInterval(pollMessages, 5000); }
})();

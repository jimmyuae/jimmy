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
  let recordingStartedAt = 0;
  let recordingTimer = null;
  let pressTimer = null;
  let pressStartedRecording = false;
  let suppressNextVoiceClick = false;
  let cancelCurrentRecording = false;
  const chatEmojis = ['👍','❤️','😂','😮','😢','🙏','🔥','✅','👏','🎉'];
  const animatedEmojiSvgs = {
    '👍': `<svg class="chat-emoji-svg emoji-like" viewBox="0 0 64 64" aria-hidden="true"><rect x="7" y="27" width="14" height="26" rx="6" fill="#dfe7f5"/><path d="M23 28c0-3.3 2.7-6 6-6h6c1.7 0 3-1.3 3-3v-5c0-4.7 3-8 7-8h2v20h7c3.9 0 7 3.1 7 7 0 1.3-.4 2.6-1 3.7l-4.7 8.2c-1.6 2.8-4.6 4.6-7.9 4.6H23V28z" fill="#ffc83d"/><path class="ae-like-thumb" d="M40 25V11c0-3.2 1.9-5.3 5-5.9h2v20z" fill="#ffb22e"/><path d="M31 28v18M38 28v18M45 28v18" stroke="#de9810" stroke-width="2" stroke-linecap="round" opacity=".45"/></svg>`,
    '❤️': `<svg class="chat-emoji-svg emoji-heart" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="heartGrad" x1="0" x2="1"><stop offset="0" stop-color="#ff6a85"/><stop offset="1" stop-color="#ff2157"/></linearGradient></defs><path class="ae-heart-main" d="M32 56 12.5 36.5C4.7 28.7 4.7 16 12.5 8.8c6.6-6.2 17-5.8 23.3.8l.2.2.2-.2C42.5 3 52.9 2.6 59.5 8.8c7.8 7.2 7.8 19.9 0 27.7Z" fill="url(#heartGrad)"/><path d="M47 14c3 2 5 5.4 5.3 9.2" fill="none" stroke="#ffd1dc" stroke-width="3" stroke-linecap="round" opacity=".8"/></svg>`,
    '😂': `<svg class="chat-emoji-svg emoji-laugh" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="#ffd54f"/><path d="M22 24c2.6-4 5.7-6 10-6s7.4 2 10 6" fill="none" stroke="#4b2a12" stroke-width="3" stroke-linecap="round" opacity=".22"/><path d="M21 28c2.6-2.2 4.9-3.3 7.1-3.3 2 0 3.7 1 4.9 3" fill="none" stroke="#432818" stroke-width="3" stroke-linecap="round"/><path d="M36 28c2.6-2.2 4.9-3.3 7.1-3.3 2 0 3.7 1 4.9 3" fill="none" stroke="#432818" stroke-width="3" stroke-linecap="round"/><path d="M20 36c3.8 6.8 8.7 10.2 12 10.2S40.2 42.8 44 36" fill="#5b1e10"/><path d="M20 36c3.8 6.8 8.7 10.2 12 10.2S40.2 42.8 44 36" fill="none" stroke="#5b1e10" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="31" r="2.2" fill="#69b9ff" class="ae-tear ae-tear-left"/><circle cx="40" cy="31" r="2.2" fill="#69b9ff" class="ae-tear ae-tear-right"/></svg>`,
    '😮': `<svg class="chat-emoji-svg emoji-wow" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="#ffd54f"/><circle cx="24" cy="24" r="3.1" fill="#45220a"/><circle cx="40" cy="24" r="3.1" fill="#45220a"/><path d="M19 18c1.4-2.4 3.5-3.6 6.3-3.6M38.7 14.4c2.8 0 4.9 1.2 6.3 3.6" fill="none" stroke="#6f4520" stroke-width="2.4" stroke-linecap="round" opacity=".55"/><ellipse class="ae-wow-mouth" cx="32" cy="39" rx="7" ry="8.2" fill="#643a15"/><ellipse cx="32" cy="39" rx="3.6" ry="4.5" fill="#2d1606" opacity=".32"/></svg>`,
    '😢': `<svg class="chat-emoji-svg emoji-cry" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="#ffd54f"/><circle cx="24" cy="25" r="2.8" fill="#45220a"/><circle cx="40" cy="25" r="2.8" fill="#45220a"/><path d="M22 43c2.5-2.8 5.8-4.2 10-4.2S39.5 40.2 42 43" fill="none" stroke="#5d3410" stroke-width="3.2" stroke-linecap="round"/><path d="M17.5 18.8c1.6-1.7 3.8-2.6 6.5-2.6M40 16.2c2.7 0 4.9.9 6.5 2.6" fill="none" stroke="#8a5a23" stroke-width="2.4" stroke-linecap="round" opacity=".55"/><path class="ae-cry-drop drop-1" d="M20 31c2.4 3.5 3.6 6.4 3.6 8.4 0 2.6-1.8 4.2-4.2 4.2S15.2 42 15.2 39.4c0-2 1.4-4.9 4.8-8.4Z" fill="#4da9ff"/><path class="ae-cry-drop drop-2" d="M44 31c2.4 3.5 3.6 6.4 3.6 8.4 0 2.6-1.8 4.2-4.2 4.2s-4.2-1.6-4.2-4.2c0-2 1.4-4.9 4.8-8.4Z" fill="#4da9ff"/></svg>`,
    '🙏': `<svg class="chat-emoji-svg emoji-pray" viewBox="0 0 64 64" aria-hidden="true"><path class="ae-pray-left" d="M28 17c-2.8 0-5 2.2-5 5v11l-6.6 10.8c-1.3 2.2-.6 5 1.6 6.3 2.2 1.3 5 .6 6.3-1.6L32 35l7.7 13.5c1.3 2.2 4.1 2.9 6.3 1.6 2.2-1.3 2.9-4.1 1.6-6.3L41 33V22c0-2.8-2.2-5-5-5h-8Z" fill="#ffd36d"/><path class="ae-pray-right" d="M31 10c-2.2 0-4 1.8-4 4v22h10V14c0-2.2-1.8-4-4-4h-2Z" fill="#ffb95a"/><path class="ae-pray-glow" d="M32 4v6M20 9l3.8 4M44 9l-3.8 4" fill="none" stroke="#86b7ff" stroke-width="3" stroke-linecap="round" opacity=".8"/></svg>`,
    '🔥': `<svg class="chat-emoji-svg emoji-fire" viewBox="0 0 64 64" aria-hidden="true"><path d="M35 6c3.8 6.1 4.2 11.8 1.2 17.2 4.4-1.2 7.4-4.1 9-8.8 6.9 7 10.4 14.1 10.4 21.4C55.6 47.4 46.2 56 32 56S8.4 47.4 8.4 35.8c0-8.7 4.7-16.5 14.2-23.4-.7 7 1 12.4 5 16.2 1.7-7.7 4.2-15.3 7.4-22.6Z" fill="#ff8c22"/><path class="ae-fire-core" d="M33 18c2.7 4.4 3 8.6.8 12.6 3.2-.9 5.4-3 6.5-6.4 5 5.1 7.6 10.3 7.6 15.7 0 8.5-6.9 13.9-15.9 13.9S16 48.3 16 39.8c0-6.4 3.4-12.1 10.3-17.1-.5 5.1.7 9.1 3.6 11.9 1.2-5.7 3-11.2 5.1-16.6Z" fill="#ffd34d"/></svg>`,
    '✅': `<svg class="chat-emoji-svg emoji-check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="#39c46a"/><circle class="ae-check-ring" cx="32" cy="32" r="28" fill="none" stroke="#39c46a" stroke-width="4" opacity=".35"/><path d="M21 32.5 28.8 40 43 25.8" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    '👏': `<svg class="chat-emoji-svg emoji-clap" viewBox="0 0 64 64" aria-hidden="true"><path class="ae-clap-left" d="M21 22c-2.8 0-5 2.2-5 5v10c0 4.5 3.6 8.1 8.1 8.1H30V27c0-2.8-2.2-5-5-5Z" fill="#ffd36d"/><path class="ae-clap-right" d="M43 19c2.8 0 5 2.2 5 5v13.5c0 4.7-3.8 8.5-8.5 8.5H32V24c0-2.8 2.2-5 5-5Z" fill="#ffbf52"/><path d="M16 17v-6M12 20H7M49 15l4-5M52 21h6" fill="none" stroke="#4da9ff" stroke-width="3" stroke-linecap="round" class="ae-clap-lines"/></svg>`,
    '🎉': `<svg class="chat-emoji-svg emoji-party" viewBox="0 0 64 64" aria-hidden="true"><path d="M17 19 46 32 24 54 17 19Z" fill="#6c63ff"/><path d="M17 19 35 42" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/><path d="M17 19 42 11" fill="none" stroke="#a78bfa" stroke-width="4" stroke-linecap="round"/><circle class="ae-confetti c1" cx="46" cy="15" r="3" fill="#ff5b99"/><circle class="ae-confetti c2" cx="54" cy="24" r="2.6" fill="#4da9ff"/><circle class="ae-confetti c3" cx="48" cy="28" r="2.6" fill="#ffcc3d"/><path class="ae-confetti-line l1" d="M38 8c2 3.5 5.1 5.6 9.3 6.2" fill="none" stroke="#ff9f43" stroke-width="2.8" stroke-linecap="round"/><path class="ae-confetti-line l2" d="M44 6c-.4 3 0 5.8 1.3 8.2" fill="none" stroke="#34d399" stroke-width="2.8" stroke-linecap="round"/></svg>`
  };

  function emojiVisual(emoji, sizeClass = 'md') {
    const svg = animatedEmojiSvgs[String(emoji || '').trim()];
    if (!svg) return `<span class="chat-emoji-fallback">${escapeHtml(String(emoji || ''))}</span>`;
    return `<span class="chat-emoji-visual ${sizeClass}" data-emoji="${escapeAttr(emoji)}">${svg}</span>`;
  }

  function emojiOnlyHtml(text) {
    const trimmed = String(text || '').trim();
    return animatedEmojiSvgs[trimmed]
      ? `<div class="chat-text chat-emoji-message">${emojiVisual(trimmed, 'lg')}</div>`
      : `<div class="chat-text chat-emoji-message">${escapeHtml(trimmed)}</div>`;
  }

  function currentId() { return Number(currentUser()?.id || 0); }
  function verifiedBadge() { return '<span class="chat-verified" title="Verified user">✓</span>'; }
  function chatSvgIcon(name) {
    const icons = {
      chat: '<svg class="chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.75A4.75 4.75 0 0 1 9.25 1h5.5a4.75 4.75 0 0 1 4.75 4.75v4.5A4.75 4.75 0 0 1 14.75 15H10l-4.05 3.04A.9.9 0 0 1 4.5 17.32V15.1A4.75 4.75 0 0 1 1 10.5V5.75A4.75 4.75 0 0 1 5.75 1h.25" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(1.5 2.5)"/><path d="M8 9h8M8 12h5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      attach: '<svg class="chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 11.7 12.1 19.9a6 6 0 0 1-8.5-8.5l8.9-8.9a4.2 4.2 0 0 1 5.9 5.9l-8.9 8.9a2.4 2.4 0 0 1-3.4-3.4l8.1-8.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      mic: '<svg class="chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      send: '<svg class="chat-svg-icon send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 20 3.8c.7-.3 1.4.4 1.1 1.1l-7.3 16.5c-.3.7-1.3.7-1.6 0l-2.4-6.2-6.2-2.4c-.8-.3-.8-1.3-.1-1.6Z" fill="currentColor"/><path d="m10 14 5-5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
      stop: '<svg class="chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
      doc: '<svg class="chat-svg-icon doc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h6l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 3v5h5M8.5 13h7M8.5 16h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      close: '<svg class="chat-svg-icon close-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
      emoji: '<svg class="chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 10h.01M15.5 10h.01" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M8.5 14c1 1.6 2.1 2.4 3.5 2.4s2.5-.8 3.5-2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      react: '<svg class="chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.2-9.2C1.6 8.5 3.8 5 7.2 5c1.9 0 3.4 1 4.3 2.3C12.4 6 13.9 5 15.8 5c3.4 0 5.6 3.5 4.4 6.8C18.5 16.3 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M19 3v4M17 5h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    };
    return icons[name] || '';
  }

  function escapeAttr(v) { return escapeHtml(v).replace(/`/g, '&#96;'); }

  function ensureChatDom() {
    if (document.getElementById('jimmyChatButton')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button id="jimmyChatButton" class="chat-float-button" type="button" aria-label="Open Jimmy Community chat">
        <span class="chat-float-icon">${chatSvgIcon('chat')}</span><span id="jimmyChatUnread" class="chat-unread" style="display:none">0</span>
      </button>
      <div id="jimmyChatPanel" class="chat-panel" aria-hidden="true">
        <div class="chat-header">
          <div class="chat-group-title"><picture><source srcset="/assets/jimmy-logo-white.svg" media="(prefers-color-scheme: dark)"><img src="/assets/jimmy-logo-white.svg" alt="Jimmy"></picture><div><b>Jimmy Community</b><span>Admin, Manager and Merchandisers</span></div></div>
          <button class="chat-close" type="button" id="jimmyChatClose" aria-label="Close chat">${chatSvgIcon('close')}</button>
        </div>
        <div id="jimmyChatMessages" class="chat-messages"></div>
        <div id="jimmyChatReply" class="chat-reply-preview" style="display:none"><div><b id="jimmyChatReplyName"></b><span id="jimmyChatReplyBody"></span></div><button type="button" id="jimmyChatReplyClear" aria-label="Clear reply">${chatSvgIcon('close')}</button></div>
        <div id="jimmyChatEmojiPicker" class="chat-emoji-picker" style="display:none"></div>
        <div id="jimmyChatReactionPicker" class="chat-reaction-picker" style="display:none"></div>
        <div id="jimmyChatAttachPreview" class="chat-attach-preview" style="display:none"></div>
        <div id="jimmyChatRecordingBar" class="chat-recording-bar" style="display:none">
          <span class="record-dot"></span>
          <b id="jimmyChatRecordingTime">00:00</b>
          <span>Recording voice note</span>
          <button type="button" id="jimmyChatCancelVoice">Cancel</button>
        </div>
        <div class="chat-compose">
          <button id="jimmyChatEmoji" class="chat-icon-btn" type="button" aria-label="Send animated emoji">${chatSvgIcon('emoji')}</button>
          <button id="jimmyChatAttach" class="chat-icon-btn" type="button" aria-label="Attach photo, video or document">${chatSvgIcon('attach')}</button>
          <input id="jimmyChatFile" type="file" hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip">
          <textarea id="jimmyChatInput" rows="1" placeholder="Message"></textarea>
          <button id="jimmyChatVoice" class="chat-icon-btn" type="button" aria-label="Record voice message" title="Tap to start/stop, or hold and release to send">${chatSvgIcon('mic')}</button>
          <button id="jimmyChatSend" class="chat-send" type="button" aria-label="Send message">${chatSvgIcon('send')}</button>
        </div>
      </div>
      <div id="jimmyChatProfileModal" class="chat-profile-modal" style="display:none"></div>
    `;
    document.body.appendChild(wrap);
    document.getElementById('jimmyChatButton').addEventListener('click', openChat);
    document.getElementById('jimmyChatClose').addEventListener('click', closeChat);
    document.getElementById('jimmyChatSend').addEventListener('click', () => sendChatMessage());
    document.getElementById('jimmyChatEmoji').addEventListener('click', toggleSendEmojiPicker);
    document.getElementById('jimmyChatAttach').addEventListener('click', () => document.getElementById('jimmyChatFile').click());
    document.getElementById('jimmyChatFile').addEventListener('change', renderAttachPreview);
    document.getElementById('jimmyChatReplyClear').addEventListener('click', clearReply);
    document.getElementById('jimmyChatCancelVoice').addEventListener('click', cancelVoiceRecording);
    setupVoiceButtonEvents();
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


  function isEmojiOnly(text) {
    const cleaned = String(text || '').trim();
    return cleaned && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(cleaned) && cleaned.length <= 12;
  }

  function emojiButtons(onClickName, messageId = null) {
    return chatEmojis.map((emoji, index) => `<button type="button" class="chat-emoji-option" style="--i:${index}" onclick="${onClickName}('${emoji}'${messageId ? `, ${messageId}` : ''})">${emojiVisual(emoji, 'sm')}</button>`).join('');
  }

  function hideEmojiPickers() {
    const sendPicker = document.getElementById('jimmyChatEmojiPicker');
    const reactPicker = document.getElementById('jimmyChatReactionPicker');
    if (sendPicker) sendPicker.style.display = 'none';
    if (reactPicker) reactPicker.style.display = 'none';
  }

  function toggleSendEmojiPicker() {
    const picker = document.getElementById('jimmyChatEmojiPicker');
    if (!picker) return;
    const open = picker.style.display === 'flex';
    hideEmojiPickers();
    if (open) return;
    picker.innerHTML = `<div class="chat-emoji-title">Live emoji</div><div class="chat-emoji-grid">${emojiButtons('jimmyChatSendEmoji')}</div>`;
    picker.style.display = 'flex';
  }

  window.jimmyChatSendEmoji = async (emoji) => {
    hideEmojiPickers();
    await sendChatMessage(null, null, null, String(emoji || '').trim());
  };

  window.jimmyChatOpenReactionPicker = (id, ev) => {
    ev?.stopPropagation?.();
    const picker = document.getElementById('jimmyChatReactionPicker');
    if (!picker) return;
    const openFor = picker.dataset.messageId === String(id) && picker.style.display === 'flex';
    hideEmojiPickers();
    if (openFor) return;
    picker.dataset.messageId = String(id);
    picker.innerHTML = `<div class="chat-emoji-title">React to message</div><div class="chat-emoji-grid">${emojiButtons('jimmyChatReactToMessage', id)}</div><button type="button" class="chat-reaction-remove" onclick="jimmyChatReactToMessage('remove', ${id})">Remove reaction</button>`;
    picker.style.display = 'flex';
  };

  window.jimmyChatReactToMessage = async (emoji, id) => {
    try {
      const data = await api(`/api/chat/messages/${id}/reactions`, { method:'POST', body: JSON.stringify({ emoji }) });
      const msg = chatMessages.find(m => Number(m.id) === Number(id));
      if (msg) { msg.reactions = data.reactions || []; msg.my_reaction = data.my_reaction || null; }
      hideEmojiPickers();
      renderMessages();
    } catch (err) { alert(err.message); }
  };

  function reactionHtml(m) {
    const list = m.reactions || [];
    if (!list.length) return '';
    return `<div class="chat-reactions">${list.map(r => `<button type="button" class="chat-reaction-pill ${m.my_reaction === r.emoji ? 'mine' : ''}" onclick="jimmyChatReactToMessage('${r.emoji}', ${m.id})"><span>${emojiVisual(r.emoji, 'xs')}</span><b>${Number(r.count || 0)}</b></button>`).join('')}</div>`;
  }

  function senderAvatar(m) {
    if (m.sender_profile_image) return `<img src="${escapeAttr(m.sender_profile_image)}" alt="${escapeAttr(m.sender_name)}">`;
    return `<span>${escapeHtml((m.sender_name || 'U')[0] || 'U')}</span>`;
  }
  function attachmentDownload(url, fileName, label = 'Download') {
    return `<a class="chat-download-link" href="${escapeAttr(url)}" target="_blank" download="${escapeAttr(fileName || 'attachment')}">${escapeHtml(label)}</a>`;
  }

  function messageAttachment(m) {
    if (!m.file_url) return '';
    const url = escapeAttr(m.file_url);
    const name = m.file_name || 'Attachment';
    if (m.message_type === 'image') return `<div class="chat-image-card"><a class="chat-image-download-inside" href="${url}" target="_blank" download="${escapeAttr(name)}">Download image</a><a href="${url}" target="_blank"><img class="chat-img" src="${url}" alt="${escapeAttr(name)}"></a></div>`;
    if (m.message_type === 'video') return `<div class="chat-media-card"><video class="chat-video" src="${url}" controls playsinline></video><div class="chat-file-actions">${attachmentDownload(m.file_url, name, 'Download video')}</div></div>`;
    if (m.message_type === 'audio') return `<div class="chat-voice-card"><audio class="chat-audio" src="${url}" controls preload="metadata"></audio></div>`;
    return `<a class="chat-doc" href="${url}" target="_blank" download="${escapeAttr(name)}">${chatSvgIcon('doc')} <span>${escapeHtml(name)}</span></a>`;
  }
  function renderMessages() {
    const box = document.getElementById('jimmyChatMessages');
    if (!box) return;
    box.innerHTML = chatMessages.map(m => {
      const mine = Number(m.sender_id) === currentId();
      const deleted = Boolean(m.deleted_at);
      const reply = m.reply_to_message_id ? `<div class="chat-quoted"><b>${escapeHtml(m.reply_sender_name || 'Message')}</b><span>${escapeHtml(m.reply_body || 'Attachment')}</span></div>` : '';
      const unsend = m.can_unsend ? `<button class="chat-msg-action" onclick="jimmyChatUnsend(${m.id})">Unsend</button>` : '';
      const bodyHtml = m.body ? (isEmojiOnly(m.body) ? emojiOnlyHtml(m.body) : `<div class="chat-text">${escapeHtml(m.body)}</div>`) : '';
      const content = deleted ? '<i>This message was deleted</i>' : `${reply}${messageAttachment(m)}${bodyHtml}`;
      return `<div class="chat-row ${mine ? 'mine' : 'theirs'}" data-id="${m.id}">
        ${mine ? '' : `<button class="chat-avatar" onclick="jimmyChatOpenProfile(${m.sender_id})">${senderAvatar(m)}</button>`}
        <div class="chat-bubble-wrap">
          <button class="chat-sender" onclick="jimmyChatOpenProfile(${m.sender_id})">${escapeHtml(m.sender_name)} ${verifiedBadge()}</button>
          <div class="chat-bubble" ontouchstart="jimmyChatTouchStart(event, ${m.id})" ontouchend="jimmyChatTouchEnd(event, ${m.id})">
            ${content}
            <div class="chat-meta"><button onclick="jimmyChatOpenReactionPicker(${m.id}, event)">${chatSvgIcon('react')} React</button><button onclick="jimmyChatReply(${m.id})">Reply</button>${unsend}<span>${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
          </div>
          ${reactionHtml(m)}
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
    const fileInput = document.getElementById('jimmyChatFile');
    const file = fileInput.files[0];
    const preview = document.getElementById('jimmyChatAttachPreview');
    if (!file) { preview.style.display = 'none'; preview.innerHTML = ''; return; }
    if (file.size > 25 * 1024 * 1024) { alert('Maximum file size is 25 MB.'); fileInput.value = ''; preview.style.display = 'none'; preview.innerHTML = ''; return; }
    let thumb = '';
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      thumb = `<img class="chat-attach-thumb" src="${url}" alt="Preview" onload="URL.revokeObjectURL(this.src)">`;
    } else if (file.type.startsWith('video/')) {
      thumb = `<span class="chat-attach-kind">Video</span>`;
    } else if (file.type.startsWith('audio/')) {
      thumb = `<span class="chat-attach-kind">Audio</span>`;
    } else {
      thumb = `<span class="chat-attach-kind">File</span>`;
    }
    preview.innerHTML = `<div class="chat-attach-info">${thumb}<span>${escapeHtml(file.name)}</span></div><button type="button" class="chat-attach-remove" id="jimmyChatRemoveAttach">${chatSvgIcon('close')}</button>`;
    document.getElementById('jimmyChatRemoveAttach')?.addEventListener('click', () => { fileInput.value = ''; preview.innerHTML = ''; preview.style.display = 'none'; });
    preview.style.display = 'flex';
  }

  async function sendChatMessage(extraFileData = null, extraFileName = null, extraType = null, overrideBody = null) {
    try {
      // When used as a click handler, browsers pass a MouseEvent as the first argument.
      // That must never be treated as a file, otherwise the server receives an invalid
      // file payload and returns "A valid file is required.".
      if (extraFileData && typeof extraFileData !== 'string') {
        extraFileData = null;
        extraFileName = null;
        extraType = null;
      }
      const input = document.getElementById('jimmyChatInput');
      const fileInput = document.getElementById('jimmyChatFile');
      const selectedFile = fileInput?.files?.[0] || null;
      let fileDataUrl = typeof extraFileData === 'string' && extraFileData.startsWith('data:') ? extraFileData : null;
      let fileName = extraFileName || null;
      let messageType = extraType || 'text';

      if (!fileDataUrl && selectedFile) {
        if (selectedFile.size > 25 * 1024 * 1024) {
          alert('Maximum file size is 25 MB.');
          fileInput.value = '';
          { const p = document.getElementById('jimmyChatAttachPreview'); if (p) { p.style.display = 'none'; p.innerHTML = ''; } }
          return;
        }
        fileName = selectedFile.name;
        fileDataUrl = await fileToDataUrl(selectedFile);
        if (selectedFile.type.startsWith('image/')) messageType = 'image';
        else if (selectedFile.type.startsWith('video/')) messageType = 'video';
        else if (selectedFile.type.startsWith('audio/')) messageType = 'audio';
        else messageType = 'document';
      }

      const body = overrideBody !== null ? String(overrideBody || '').trim() : (input.value || '').trim();
      if (!body && !fileDataUrl) return;
      if (!fileDataUrl) { fileName = null; messageType = 'text'; }

      const data = await api('/api/chat/messages', { method:'POST', body: JSON.stringify({ body, file_data_url: fileDataUrl, file_name: fileName, message_type: messageType, reply_to_message_id: replyTo?.id || null }) });
      input.value = '';
      if (fileInput) fileInput.value = '';
      { const p = document.getElementById('jimmyChatAttachPreview'); if (p) { p.style.display = 'none'; p.innerHTML = ''; } }
      clearReply();
      chatMessages.push(data.message); lastMessageId = Math.max(lastMessageId, Number(data.message.id));
      localStorage.setItem('jimmyChatLastMessageId', String(lastMessageId));
      renderMessages();
    } catch (err) { alert(err.message); }
  }

  function updateRecordingTimer() {
    const elapsed = Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000));
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const label = document.getElementById('jimmyChatRecordingTime');
    if (label) label.textContent = `${mm}:${ss}`;
  }

  function showRecordingBar(show) {
    const bar = document.getElementById('jimmyChatRecordingBar');
    if (bar) bar.style.display = show ? 'flex' : 'none';
  }

  async function startVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    const btn = document.getElementById('jimmyChatVoice');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      cancelCurrentRecording = false;
      mediaRecorder = new MediaRecorder(stream);
      recordingStartedAt = Date.now();
      updateRecordingTimer();
      clearInterval(recordingTimer);
      recordingTimer = setInterval(updateRecordingTimer, 500);
      mediaRecorder.ondataavailable = e => { if (e.data.size) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        clearInterval(recordingTimer);
        recordingTimer = null;
        stream.getTracks().forEach(t => t.stop());
        btn.classList.remove('recording');
        btn.innerHTML = chatSvgIcon('mic');
        showRecordingBar(false);
        if (cancelCurrentRecording) { audioChunks = []; return; }
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        if (!blob.size) return;
        const dataUrl = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
        await sendChatMessage(dataUrl, `voice-${Date.now()}.webm`, 'audio');
      };
      mediaRecorder.start();
      btn.classList.add('recording');
      btn.innerHTML = chatSvgIcon('stop');
      showRecordingBar(true);
    } catch (err) { alert('Microphone permission failed: ' + err.message); }
  }

  function stopVoiceRecording(send = true) {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    cancelCurrentRecording = !send;
    mediaRecorder.stop();
  }

  async function toggleVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') return stopVoiceRecording(true);
    await startVoiceRecording();
  }

  function cancelVoiceRecording() { stopVoiceRecording(false); }

  function setupVoiceButtonEvents() {
    const btn = document.getElementById('jimmyChatVoice');
    if (!btn || btn.dataset.ready === 'yes') return;
    btn.dataset.ready = 'yes';
    const beginHold = (e) => {
      if (e.type === 'touchstart') e.preventDefault();
      pressStartedRecording = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(async () => {
        pressStartedRecording = true;
        suppressNextVoiceClick = true;
        await startVoiceRecording();
      }, 260);
    };
    const endHold = (e) => {
      if (e.type === 'touchend') e.preventDefault();
      clearTimeout(pressTimer);
      if (pressStartedRecording) {
        stopVoiceRecording(true);
        pressStartedRecording = false;
      }
    };
    btn.addEventListener('mousedown', beginHold);
    btn.addEventListener('touchstart', beginHold, { passive:false });
    btn.addEventListener('mouseup', endHold);
    btn.addEventListener('mouseleave', () => { if (pressStartedRecording) stopVoiceRecording(false); });
    btn.addEventListener('touchend', endHold, { passive:false });
    btn.addEventListener('click', async (e) => {
      if (suppressNextVoiceClick) { suppressNextVoiceClick = false; return; }
      await toggleVoiceRecording();
    });
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
        <button class="chat-profile-close" aria-label="Close profile" onclick="document.getElementById('jimmyChatProfileModal').style.display='none'">${chatSvgIcon('close')}</button>
        <div class="chat-profile-head"><div class="chat-profile-avatar">${avatar}</div><div><h2>${escapeHtml(u.name)} ${verifiedBadge()}</h2><p>${escapeHtml(u.employee_code || '')} · ${escapeHtml(u.role === 'worker' ? 'Merchandiser' : u.role)}</p></div></div>
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

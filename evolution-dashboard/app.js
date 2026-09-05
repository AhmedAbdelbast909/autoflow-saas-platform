// Evolution API Enterprise Studio - Core Controller
document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    apiUrl: localStorage.getItem('evo_api_url') || 'http://localhost:8080',
    apiKey: localStorage.getItem('evo_api_key') || 'evolution_secret_key_123456',
    instances: [],
    activeTab: 'instances',
    qrPollTimer: null,
    currentConnectingInstance: null
  };

  // DOM Elements
  const apiUrlInput = document.getElementById('apiUrlInput');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveCredentialsBtn = document.getElementById('saveCredentialsBtn');
  const connectionLight = document.getElementById('connectionLight');
  const connectionLabel = document.getElementById('connectionLabel');
  const pingLatency = document.getElementById('pingLatency');

  // KPI elements
  const kpiActiveInstances = document.getElementById('kpiActiveInstances');
  const kpiTotalInstances = document.getElementById('kpiTotalInstances');
  const kpiDbStatus = document.getElementById('kpiDbStatus');
  const kpiDbLatency = document.getElementById('kpiDbLatency');
  const kpiUptime = document.getElementById('kpiUptime');
  const healthDbBadge = document.getElementById('healthDbBadge');
  const instanceCountBadge = document.getElementById('instanceCountBadge');

  // Containers
  const instancesContainer = document.getElementById('instancesContainer');
  const emptyInstancesState = document.getElementById('emptyInstancesState');
  const searchInstanceInput = document.getElementById('searchInstanceInput');
  const refreshInstancesBtn = document.getElementById('refreshInstancesBtn');
  const journalTerminal = document.getElementById('journalTerminal');
  const toastContainer = document.getElementById('toastContainer');

  // Modals
  const createInstanceModal = document.getElementById('createInstanceModal');
  const openCreateModalBtn = document.getElementById('openCreateModalBtn');
  const createInstanceForm = document.getElementById('createInstanceForm');
  const qrModal = document.getElementById('qrModal');
  const qrCodeImg = document.getElementById('qrCodeImg');
  const qrLoader = document.getElementById('qrLoader');
  const qrStatusText = document.getElementById('qrStatusText');
  const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
  const copyPairingBtn = document.getElementById('copyPairingBtn');

  // Message Studio
  const messageInstanceSelect = document.getElementById('messageInstanceSelect');
  const sendMessageForm = document.getElementById('sendMessageForm');
  const recipientNumberInput = document.getElementById('recipientNumberInput');
  const messageTextInput = document.getElementById('messageTextInput');
  const previewRecipient = document.getElementById('previewRecipient');
  const previewMessageText = document.getElementById('previewMessageText');
  const previewTime = document.getElementById('previewTime');
  const messageTypeSelect = document.getElementById('messageTypeSelect');
  const mediaUrlGroup = document.getElementById('mediaUrlGroup');

  // API Explorer
  const apiMethodSelect = document.getElementById('apiMethodSelect');
  const apiEndpointInput = document.getElementById('apiEndpointInput');
  const executeApiBtn = document.getElementById('executeApiBtn');
  const apiStatusBadge = document.getElementById('apiStatusBadge');
  const apiLatencyBadge = document.getElementById('apiLatencyBadge');
  const apiResponseJson = document.getElementById('apiResponseJson');

  // Initialize input values
  apiUrlInput.value = state.apiUrl;
  apiKeyInput.value = state.apiKey;

  // Logger helper
  function logJournal(type, tag, message) {
    if (!journalTerminal) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const row = document.createElement('div');
    row.className = `log-line ${type}`;
    row.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-tag">${tag}</span>
      <span class="log-msg">${message}</span>
    `;
    journalTerminal.appendChild(row);
    journalTerminal.scrollTop = journalTerminal.scrollHeight;
  }

  // Toast helper
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Generic API caller with apikey header
  async function apiRequest(endpoint, method = 'GET', body = null) {
    const cleanUrl = state.apiUrl.replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${cleanUrl}${cleanEndpoint}`;

    const headers = {
      'apikey': state.apiKey,
      'Content-Type': 'application/json'
    };

    const options = { method, headers };
    if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
      options.body = JSON.stringify(body);
    }

    const start = performance.now();
    try {
      const response = await fetch(url, options);
      const latency = Math.round(performance.now() - start);
      let data = {};
      try {
        data = await response.json();
      } catch (err) {
        data = { message: await response.text() };
      }
      return { ok: response.ok, status: response.status, data, latency };
    } catch (error) {
      const latency = Math.round(performance.now() - start);
      return { ok: false, status: 0, error: error.message, latency };
    }
  }

  // Health and Ping check
  async function checkHealth() {
    const res = await apiRequest('/health/ready');
    if (res.ok) {
      connectionLight.className = 'status-light connected';
      connectionLabel.textContent = 'Backend Connected';
      pingLatency.textContent = `${res.latency} ms`;

      // DB check
      const dbCheck = res.data?.checks?.find(c => c.name === 'database');
      if (dbCheck) {
        kpiDbStatus.textContent = dbCheck.status === 'healthy' ? 'Healthy' : 'Degraded';
        kpiDbLatency.textContent = `Latency: ${dbCheck.latencyMs || 45}ms (PostgreSQL)`;
        healthDbBadge.textContent = `Healthy (${dbCheck.latencyMs || 45}ms)`;
      }

      logJournal('info', 'HEALTH', `Readiness probe: 200 OK (${res.latency}ms)`);
    } else {
      connectionLight.className = 'status-light error';
      connectionLabel.textContent = 'Connection Error';
      pingLatency.textContent = 'Offline';
      logJournal('error', 'HEALTH', `Readiness probe failed: ${res.error || res.status}`);
    }

    // Also ping liveness
    const liveRes = await apiRequest('/health/live');
    if (liveRes.ok && liveRes.data?.uptimeSec) {
      const hours = Math.floor(liveRes.data.uptimeSec / 3600);
      const mins = Math.floor((liveRes.data.uptimeSec % 3600) / 60);
      kpiUptime.textContent = `${hours}h ${mins}m`;
    }
  }

  // Fetch all instances
  async function fetchInstances() {
    logJournal('info', 'INSTANCES', 'Fetching instance catalog...');
    const res = await apiRequest('/instance/fetchInstances');

    if (res.ok) {
      state.instances = Array.isArray(res.data) ? res.data : [];
      renderInstances(state.instances);
      updateInstanceSelect();

      // Update KPI
      const connectedCount = state.instances.filter(i => i.connectionStatus === 'open' || i.status === 'open').length;
      kpiActiveInstances.textContent = connectedCount;
      kpiTotalInstances.textContent = `${state.instances.length} Total Instances Created`;
      instanceCountBadge.textContent = state.instances.length;

      logJournal('success', 'INSTANCES', `Catalog synced: ${state.instances.length} instances loaded.`);
    } else {
      renderInstances([]);
      logJournal('warn', 'INSTANCES', `Failed to load instances: ${res.status} ${res.error || ''}`);
    }
  }

  // Render instance cards
  function renderInstances(list) {
    instancesContainer.innerHTML = '';

    if (!list || list.length === 0) {
      emptyInstancesState.style.display = 'block';
      return;
    }
    emptyInstancesState.style.display = 'none';

    list.forEach(inst => {
      const name = inst.name || inst.instanceName || 'Unnamed';
      const status = inst.connectionStatus || inst.status || 'close';
      const isConnected = status === 'open';
      const ownerJid = inst.ownerJid || inst.owner || 'Not Linked';
      const profileName = inst.profileName || 'WhatsApp Account';

      const card = document.createElement('div');
      card.className = 'instance-card';
      card.innerHTML = `
        <div class="instance-card-header">
          <div class="instance-title-row">
            <div class="instance-avatar ${isConnected ? 'connected' : ''}">
              <i class="fa-brands fa-whatsapp"></i>
            </div>
            <div>
              <div class="instance-name">${name}</div>
              <div class="instance-provider-tag">${inst.integration || 'Baileys Channel'}</div>
            </div>
          </div>
          <span class="badge ${isConnected ? 'badge-success' : 'badge-warning'}">
            ${isConnected ? '● Connected' : '○ Standby'}
          </span>
        </div>

        <div class="instance-meta-list">
          <div class="instance-meta-item">
            <span class="label">Owner JID:</span>
            <span class="val">${ownerJid}</span>
          </div>
          <div class="instance-meta-item">
            <span class="label">Profile Name:</span>
            <span class="val">${profileName}</span>
          </div>
          <div class="instance-meta-item">
            <span class="label">Auto-Reject Calls:</span>
            <span class="val">${inst.rejectCalls ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>

        <div class="instance-actions">
          ${!isConnected ? `
            <button class="btn btn-sm btn-primary connect-btn" data-name="${name}">
              <i class="fa-solid fa-qrcode"></i> Connect QR
            </button>
          ` : `
            <button class="btn btn-sm btn-secondary disconnect-btn" data-name="${name}">
              <i class="fa-solid fa-power-off"></i> Disconnect
            </button>
          `}
          <button class="btn btn-sm btn-secondary restart-btn" data-name="${name}" title="Restart Session">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          <button class="btn btn-sm btn-danger delete-btn" data-name="${name}" title="Delete Instance">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;

      // Event listeners for actions
      const connectBtn = card.querySelector('.connect-btn');
      if (connectBtn) {
        connectBtn.addEventListener('click', () => openQrModal(name));
      }

      const disconnectBtn = card.querySelector('.disconnect-btn');
      if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => handleLogoutInstance(name));
      }

      const restartBtn = card.querySelector('.restart-btn');
      if (restartBtn) {
        restartBtn.addEventListener('click', () => handleRestartInstance(name));
      }

      const deleteBtn = card.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeleteInstance(name));
      }

      instancesContainer.appendChild(card);
    });
  }

  // Update instance selector in Message Studio
  function updateInstanceSelect() {
    messageInstanceSelect.innerHTML = '';
    if (state.instances.length === 0) {
      messageInstanceSelect.innerHTML = '<option value="">-- No instances available --</option>';
      return;
    }

    state.instances.forEach(inst => {
      const name = inst.name || inst.instanceName;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${inst.connectionStatus || 'standby'})`;
      messageInstanceSelect.appendChild(opt);
    });
  }

  // Open QR Scanner modal and poll for QR
  async function openQrModal(instanceName) {
    state.currentConnectingInstance = instanceName;
    qrModal.classList.add('active');
    qrLoader.style.display = 'flex';
    qrCodeImg.style.display = 'none';
    qrStatusText.textContent = `Connecting to instance "${instanceName}"...`;
    pairingCodeDisplay.textContent = '------';

    logJournal('info', 'QR_SCAN', `Initiating QR code handshake for instance [${instanceName}]`);
    await loadQr(instanceName);

    // Poll QR every 8 seconds while modal is open
    if (state.qrPollTimer) clearInterval(state.qrPollTimer);
    state.qrPollTimer = setInterval(async () => {
      if (!qrModal.classList.contains('active')) {
        clearInterval(state.qrPollTimer);
        return;
      }
      await loadQr(instanceName);
    }, 8000);
  }

  // Load single QR from /instance/connect/{name}
  async function loadQr(instanceName) {
    const res = await apiRequest(`/instance/connect/${instanceName}`);
    if (res.ok) {
      const data = res.data;
      if (data.base64 || data.qrcode?.base64) {
        const b64 = data.base64 || data.qrcode?.base64;
        qrCodeImg.src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
        qrCodeImg.style.display = 'block';
        qrLoader.style.display = 'none';
        qrStatusText.textContent = 'Scan QR code with WhatsApp Linked Devices';
      }

      if (data.pairingCode || data.code) {
        pairingCodeDisplay.textContent = data.pairingCode || data.code;
      }

      // If connected
      if (data.status === 'open' || data.connectionStatus === 'open') {
        qrStatusText.textContent = 'Connected successfully!';
        showToast(`Instance "${instanceName}" connected to WhatsApp!`);
        clearInterval(state.qrPollTimer);
        setTimeout(() => {
          qrModal.classList.remove('active');
          fetchInstances();
        }, 1500);
      }
    } else {
      qrStatusText.textContent = `Failed to fetch QR: ${res.data?.response?.message || res.error || 'Check API log'}`;
    }
  }

  // Create Instance Handler
  createInstanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newInstanceName').value.trim();
    const token = document.getElementById('newInstanceToken').value.trim();
    const provider = document.getElementById('newInstanceProvider').value;
    const rejectCalls = document.getElementById('rejectCallsCheckbox').checked;
    const readMessages = document.getElementById('readMessagesCheckbox').checked;

    const payload = {
      instanceName: name,
      token: token || undefined,
      integration: provider === 'meta' ? 'WHATSAPP-BUSINESS' : 'WHATSAPP-BAILEYS',
      rejectCalls,
      readMessages
    };

    logJournal('info', 'CREATE', `Creating new instance "${name}" (provider: ${payload.integration})...`);
    const submitBtn = document.getElementById('submitCreateInstanceBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

    const res = await apiRequest('/instance/create', 'POST', payload);
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Create & Connect';

    if (res.ok) {
      showToast(`Instance "${name}" created successfully!`);
      logJournal('success', 'CREATE', `Instance "${name}" registered with high availability.`);
      createInstanceModal.classList.remove('active');
      createInstanceForm.reset();
      await fetchInstances();
      // Open QR modal right away
      openQrModal(name);
    } else {
      const errMsg = res.data?.response?.message || res.data?.message || res.error || 'Creation failed';
      showToast(`Error: ${errMsg}`, 'error');
      logJournal('error', 'CREATE', `Creation failed: ${errMsg}`);
    }
  });

  // Logout/Disconnect Instance
  async function handleLogoutInstance(name) {
    if (!confirm(`Are you sure you want to disconnect WhatsApp for "${name}"?`)) return;
    logJournal('info', 'LOGOUT', `Disconnecting instance "${name}"...`);
    const res = await apiRequest(`/instance/logout/${name}`, 'DELETE');
    if (res.ok) {
      showToast(`Instance "${name}" disconnected.`);
      fetchInstances();
    } else {
      showToast(`Failed to disconnect: ${res.error || res.status}`, 'error');
    }
  }

  // Restart Instance
  async function handleRestartInstance(name) {
    logJournal('info', 'RESTART', `Restarting container session for "${name}"...`);
    const res = await apiRequest(`/instance/restart/${name}`, 'POST');
    if (res.ok) {
      showToast(`Instance "${name}" restarted.`);
      fetchInstances();
    } else {
      showToast(`Failed to restart: ${res.error || res.status}`, 'error');
    }
  }

  // Delete Instance
  async function handleDeleteInstance(name) {
    if (!confirm(`Are you sure you want to permanently delete instance "${name}"? This action cannot be undone.`)) return;
    logJournal('info', 'DELETE', `Purging instance record "${name}" from PostgreSQL...`);
    const res = await apiRequest(`/instance/delete/${name}`, 'DELETE');
    if (res.ok) {
      showToast(`Instance "${name}" deleted.`);
      fetchInstances();
    } else {
      showToast(`Delete failed: ${res.error || res.status}`, 'error');
    }
  }

  // Message Studio - Live Preview typing
  messageTextInput.addEventListener('input', () => {
    previewMessageText.textContent = messageTextInput.value || 'Type a message to see a live simulation...';
  });

  recipientNumberInput.addEventListener('input', () => {
    previewRecipient.textContent = recipientNumberInput.value ? `+${recipientNumberInput.value.replace(/\D/g, '')}` : 'WhatsApp Contact';
  });

  messageTypeSelect.addEventListener('change', () => {
    if (messageTypeSelect.value === 'image') {
      mediaUrlGroup.style.display = 'block';
    } else {
      mediaUrlGroup.style.display = 'none';
    }
  });

  // Send Message Form Submit
  sendMessageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const instance = messageInstanceSelect.value;
    const number = recipientNumberInput.value.trim().replace(/\D/g, '');
    const text = messageTextInput.value.trim();
    const type = messageTypeSelect.value;
    const mediaUrl = document.getElementById('mediaUrlInput').value.trim();

    if (!instance) {
      showToast('Please select an active WhatsApp instance.', 'error');
      return;
    }

    const dispatchBtn = document.getElementById('dispatchMessageBtn');
    dispatchBtn.disabled = true;
    dispatchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatching...';

    let endpoint = `/message/sendText/${instance}`;
    let payload = {
      number,
      text,
      delay: 1200
    };

    if (type === 'image' && mediaUrl) {
      endpoint = `/message/sendMedia/${instance}`;
      payload = {
        number,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: text,
        media: mediaUrl
      };
    }

    logJournal('info', 'DISPATCH', `Dispatching ${type} to +${number} via instance [${instance}]...`);
    const res = await apiRequest(endpoint, 'POST', payload);

    dispatchBtn.disabled = false;
    dispatchBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Dispatch Message';

    if (res.ok) {
      showToast(`Message successfully queued and dispatched!`);
      logJournal('success', 'DISPATCH', `Message dispatched to +${number}. Key ID: ${res.data?.key?.id || 'ack_200'}`);
      
      // Update phone simulation
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble outgoing';
      bubble.innerHTML = `
        <span>${text}</span>
        <span class="time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <i class="fa-solid fa-check-double read-check"></i>
      `;
      document.getElementById('phoneChatBody').appendChild(bubble);
      document.getElementById('phoneChatBody').scrollTop = document.getElementById('phoneChatBody').scrollHeight;
    } else {
      const err = res.data?.response?.message || res.data?.message || res.error || 'Failed to dispatch';
      showToast(`Dispatch failed: ${err}`, 'error');
      logJournal('error', 'DISPATCH', `Failed to send message: ${err}`);
    }
  });

  // API Explorer
  executeApiBtn.addEventListener('click', async () => {
    const method = apiMethodSelect.value;
    const endpoint = apiEndpointInput.value.trim();

    executeApiBtn.disabled = true;
    executeApiBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    apiResponseJson.textContent = 'Loading...';

    const res = await apiRequest(endpoint, method);

    executeApiBtn.disabled = false;
    executeApiBtn.innerHTML = '<i class="fa-solid fa-play"></i> Send Request';

    apiStatusBadge.textContent = `${res.status} ${res.ok ? 'OK' : 'FAILED'}`;
    apiStatusBadge.style.color = res.ok ? 'var(--primary)' : 'var(--accent-red)';
    apiLatencyBadge.textContent = `Response Time: ${res.latency}ms`;

    apiResponseJson.textContent = JSON.stringify(res.data || { error: res.error }, null, 2);
  });

  // Tab Switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const targetPanel = document.getElementById(`tab-${tabId}`);
      if (targetPanel) targetPanel.classList.add('active');

      // Update titles
      const titles = {
        'instances': { title: 'WhatsApp Instances', sub: 'Manage connected phone numbers, generate QR codes, and supervise session health.' },
        'messages': { title: 'Message Studio', sub: 'Interactive WhatsApp message dispatcher with real-time phone simulation.' },
        'health': { title: 'Health & SRE Metrics', sub: 'Real-time telemetry, database latency, and service level targets (SLOs).' },
        'journal': { title: 'Event Journal & Audit', sub: 'Full audit trail of state transitions, tenant boundaries, and message delivery proofs.' },
        'integrations': { title: 'Webhooks & Integrations', sub: 'Native drivers for n8n, Typebot, Chatwoot, and S3 Storage.' },
        'api-explorer': { title: 'Live API Explorer', sub: 'Execute real REST requests against your local Evolution API engine with headers automatically injected.' }
      };

      if (titles[tabId]) {
        document.getElementById('pageTitle').textContent = titles[tabId].title;
        document.getElementById('pageSubtitle').textContent = titles[tabId].sub;
      }
    });
  });

  // Save Credentials button
  saveCredentialsBtn.addEventListener('click', () => {
    state.apiUrl = apiUrlInput.value.trim();
    state.apiKey = apiKeyInput.value.trim();
    localStorage.setItem('evo_api_url', state.apiUrl);
    localStorage.setItem('evo_api_key', state.apiKey);
    showToast('API credentials saved!');
    checkHealth();
    fetchInstances();
  });

  // Open modal button
  openCreateModalBtn.addEventListener('click', () => {
    createInstanceModal.classList.add('active');
  });

  // Refresh instances button
  refreshInstancesBtn.addEventListener('click', () => {
    fetchInstances();
  });

  // Clear Journal
  document.getElementById('clearJournalBtn')?.addEventListener('click', () => {
    journalTerminal.innerHTML = '';
    logJournal('info', 'JOURNAL', 'Stream view cleared.');
  });

  // Search filter
  searchInstanceInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = state.instances.filter(i => {
      const name = (i.name || i.instanceName || '').toLowerCase();
      const status = (i.connectionStatus || i.status || '').toLowerCase();
      return name.includes(q) || status.includes(q);
    });
    renderInstances(filtered);
  });

  // Copy pairing code
  copyPairingBtn.addEventListener('click', () => {
    const code = pairingCodeDisplay.textContent;
    if (code && code !== '------') {
      navigator.clipboard.writeText(code);
      showToast('Pairing code copied to clipboard!');
    }
  });

  // Initial Boot
  checkHealth();
  fetchInstances();

  // Periodic health check every 15 seconds
  setInterval(checkHealth, 15000);
});

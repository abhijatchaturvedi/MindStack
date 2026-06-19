(() => {
  const STORE_KEY = "mindstack:data";
  const DEFAULT_DATA = {
    memories: [],
    settings: {
      resurfaceEnabled: true,
      dailyTarget: 8,
      defaultIntervalDays: 2
    },
    account: {
      connected: false,
      email: "",
      id: "",
      connectedAt: ""
    }
  };

  let state = structuredClone(DEFAULT_DATA);
  let activeFilter = "all";
  let activeReviewId = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const isExtension = () => typeof chrome !== "undefined" && Boolean(chrome.storage);
  const storageArea = () => chrome.storage?.sync || chrome.storage?.local;

  const uid = () => `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const today = () => new Date();
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char]));

  const readData = async () => {
    if (isExtension()) {
      const stored = await storageArea().get(STORE_KEY);
      return mergeData(stored[STORE_KEY]);
    }
    return mergeData(JSON.parse(localStorage.getItem(STORE_KEY) || "null"));
  };

  const writeData = async (data) => {
    state = mergeData(data);
    if (isExtension()) {
      await storageArea().set({ [STORE_KEY]: state });
      return;
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  };

  const mergeData = (data) => ({
    ...DEFAULT_DATA,
    ...(data || {}),
    memories: Array.isArray(data?.memories) ? data.memories : [],
    settings: {
      ...DEFAULT_DATA.settings,
      ...(data?.settings || {})
    },
    account: {
      ...DEFAULT_DATA.account,
      ...(data?.account || {})
    }
  });

  const normalizeTags = (value) =>
    String(value || "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

  const addDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 1));
    return date.toISOString();
  };

  const formatDate = (value) => {
    if (!value) return "No date";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
  };

  const truncate = (value, max = 72) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  };

  const savedMessage = (label, memory) => `${label} saved to MindStack: ${truncate(memory.title)}`;

  const getDueMemories = () =>
    state.memories
      .filter((memory) => !memory.archived && new Date(memory.nextReviewAt) <= today())
      .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));

  const getSearchTerm = () => ($("#globalSearch")?.value || "").trim().toLowerCase();

  const matchesSearch = (memory) => {
    const term = getSearchTerm();
    if (!term) return true;
    return [memory.title, memory.text, memory.prompt, memory.sourceTitle, memory.url, ...(memory.tags || [])]
      .join(" ")
      .toLowerCase()
      .includes(term);
  };

  const toast = (message) => {
    const node = $("#toast") || $("#popupStatus") || $("#optionsStatus");
    if (!node) return;
    node.textContent = message;
    if (node.id === "toast") {
      node.classList.add("show");
      setTimeout(() => node.classList.remove("show"), 2200);
    }
  };

  const systemToast = (message) => {
    if (!isExtension() || !chrome.notifications || !message) return;
    chrome.notifications.create({
      type: "basic",
      iconUrl: "assets/icon-128.png",
      title: "MindStack",
      message
    });
  };

  const pageToast = (tabId, message) => {
    if (!isExtension() || !tabId || !message) return;
    chrome.tabs.sendMessage(tabId, {
      type: "MINDSTACK_CAPTURED",
      title: message,
      message
    }, () => {
      if (!chrome.runtime.lastError) return;
      chrome.scripting.executeScript({
        target: { tabId },
        args: [message],
        func: (toastMessage) => {
          const existing = document.querySelector(".mindstack-capture-toast");
          if (existing) existing.remove();

          const toast = document.createElement("aside");
          toast.className = "mindstack-capture-toast";
          toast.setAttribute("role", "status");
          Object.assign(toast.style, {
            position: "fixed",
            right: "18px",
            bottom: "18px",
            zIndex: "2147483647",
            maxWidth: "360px",
            padding: "14px 16px",
            border: "1px solid rgba(232, 101, 10, 0.22)",
            borderRadius: "10px",
            background: "#ffffff",
            boxShadow: "0 20px 55px rgba(23, 32, 38, 0.22)",
            color: "#172026",
            font: "600 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            lineHeight: "1.45",
            opacity: "0",
            transform: "translateY(22px) scale(0.98)",
            transition: "opacity 220ms ease, transform 220ms ease"
          });

          const title = document.createElement("strong");
          title.textContent = "MindStack";
          title.style.display = "block";
          title.style.marginBottom = "5px";

          const body = document.createElement("span");
          body.textContent = toastMessage;

          toast.append(title, body);
          document.documentElement.appendChild(toast);
          requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0) scale(1)";
          });
          setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(18px) scale(0.98)";
            setTimeout(() => toast.remove(), 240);
          }, 3600);
        }
      }, () => {
        void chrome.runtime.lastError;
      });
    });
  };

  const seedIfEmpty = async () => {
    if (state.memories.length) return;
    const seed = [
      {
        title: "Project architecture",
        text: "MindStack combines a browser extension, a dashboard, and an on-page resurfacing layer so captured knowledge returns when review is due.",
        prompt: "What are the three core layers of MindStack?",
        tags: ["architecture", "memory"],
        priority: "high"
      },
      {
        title: "Spaced review principle",
        text: "Recall should be scored after an honest attempt. The next interval increases for easy recall and shrinks when a memory is forgotten.",
        prompt: "How should recall scores affect the next review?",
        tags: ["review", "learning"],
        priority: "medium"
      }
    ].map((memory, index) => ({
      ...memory,
      id: uid(),
      url: "",
      sourceTitle: "MindStack starter",
      pinned: index === 0,
      archived: false,
      createdAt: addDays(-index),
      updatedAt: new Date().toISOString(),
      nextReviewAt: index === 0 ? addDays(0) : addDays(2),
      reviewCount: 0,
      successCount: 0,
      ease: 2.5
    }));
    await writeData({ ...state, memories: seed });
  };

  const renderDashboard = () => {
    if (!$("#overviewView")) return;
    const due = getDueMemories();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = state.memories.filter((memory) => new Date(memory.createdAt) >= weekAgo).length;
    const reviews = state.memories.reduce((sum, memory) => sum + (memory.reviewCount || 0), 0);
    const successes = state.memories.reduce((sum, memory) => sum + (memory.successCount || 0), 0);

    $("#metricTotal").textContent = state.memories.length;
    $("#metricDue").textContent = due.length;
    $("#metricWeek").textContent = weekCount;
    $("#metricRetention").textContent = reviews ? `${Math.round((successes / reviews) * 100)}%` : "0%";

    renderQueue($("#todayQueue"), due.slice(0, state.settings.dailyTarget));
    renderMemoryList($("#recentMemories"), state.memories.slice(0, 5), true);
    renderReview();
    renderLibrary();
    renderInsights();
    bindSettingsValues();
    renderAccount();
  };

  const renderQueue = (container, memories) => {
    if (!container) return;
    if (!memories.length) {
      container.innerHTML = `<div class="empty-state">No reviews due right now.</div>`;
      return;
    }
    container.innerHTML = memories.map((memory) => `
      <article class="memory-item">
        <header>
          <div>
            <h3>${escapeHtml(memory.title)}</h3>
            ${memory.prompt || memory.text ? `<p>${escapeHtml(memory.prompt || memory.text)}</p>` : ""}
            ${safeUrl(memory.url) ? `<a class="memory-url" href="${escapeHtml(memory.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(memory.url)}</a>` : ""}
          </div>
          <span class="pill ${memory.priority}">${escapeHtml(memory.priority)}</span>
        </header>
        <div class="card-actions">
          <button class="button ghost" data-edit="${memory.id}">Edit</button>
          <button class="button danger" data-delete="${memory.id}">Delete</button>
          <button class="button primary" data-review="${memory.id}">Review</button>
        </div>
      </article>
    `).join("");
  };

  const renderMemoryList = (container, memories, compact = false) => {
    if (!container) return;
    const visible = memories.filter(matchesSearch);
    container.classList.toggle("compact", compact);
    if (!visible.length) {
      container.innerHTML = `<div class="empty-state">No memories match this view.</div>`;
      return;
    }
    container.innerHTML = visible.map((memory) => `
      <article class="memory-item">
        <header>
          <div>
            <h3>${memory.pinned ? "★ " : ""}${escapeHtml(memory.title)}</h3>
            ${memory.text ? `<p>${escapeHtml(memory.text)}</p>` : (!safeUrl(memory.url) ? `<p>Saved webpage</p>` : "")}
            ${safeUrl(memory.url) ? `<a class="memory-url" href="${escapeHtml(memory.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(memory.url)}</a>` : ""}
          </div>
          <span class="pill ${memory.priority}">${escapeHtml(memory.priority)}</span>
        </header>
        <div class="tag-row">
          ${(memory.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
          ${memory.type ? `<span class="tag">${escapeHtml(memory.type)}</span>` : ""}
          <span class="tag">Due ${formatDate(memory.nextReviewAt)}</span>
        </div>
        <div class="card-actions">
          <button class="button ghost" data-pin="${memory.id}">${memory.pinned ? "Unpin" : "Pin"}</button>
          <button class="button ghost" data-edit="${memory.id}">Edit</button>
          <button class="button ghost" data-archive="${memory.id}">${memory.archived ? "Restore" : "Archive"}</button>
          <button class="button danger" data-delete="${memory.id}">Delete</button>
          <button class="button primary" data-review="${memory.id}">Review</button>
        </div>
      </article>
    `).join("");
  };

  const renderLibrary = () => {
    const list = $("#libraryList");
    if (!list) return;
    let memories = [...state.memories];
    const sort = $("#sortBy")?.value || "newest";

    memories = memories.filter((memory) => {
      if (activeFilter === "due") return new Date(memory.nextReviewAt) <= today() && !memory.archived;
      if (activeFilter === "pinned") return memory.pinned && !memory.archived;
      if (activeFilter === "archived") return memory.archived;
      return !memory.archived;
    });

    const priorityRank = { high: 0, medium: 1, low: 2 };
    memories.sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority];
      if (sort === "due") return new Date(a.nextReviewAt) - new Date(b.nextReviewAt);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    renderMemoryList(list, memories);
  };

  const renderReview = () => {
    const card = $("#reviewCard");
    if (!card) return;
    const due = getDueMemories();
    const memory = state.memories.find((item) => item.id === activeReviewId) || due[0];
    activeReviewId = memory?.id || null;

    if (!memory) {
      card.innerHTML = `<div class="empty-state">Your review queue is clear.</div>`;
      return;
    }

    card.innerHTML = `
      <p class="eyebrow">Due ${formatDate(memory.nextReviewAt)}</p>
      <h2>${escapeHtml(memory.title)}</h2>
      <p class="prompt">${escapeHtml(memory.prompt || "Recall the key idea before revealing the answer.")}</p>
      <button class="button ghost" id="revealAnswer">Reveal answer</button>
      <div class="answer" id="answerBlock" hidden>
        ${escapeHtml(memory.text || memory.url || "No note was added for this webpage.")}
        ${(memory.tags || []).length ? `<div class="tag-row">${memory.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </div>
    `;
  };

  const renderInsights = () => {
    const chart = $("#captureChart");
    const tagCloud = $("#tagCloud");
    const sourceList = $("#sourceList");
    if (!chart || !tagCloud || !sourceList) return;

    const days = [...Array(7)].map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return date;
    });
    const counts = days.map((date) => state.memories.filter((memory) => {
      const created = new Date(memory.createdAt);
      return created.toDateString() === date.toDateString();
    }).length);
    const max = Math.max(1, ...counts);
    chart.innerHTML = days.map((date, index) => `
      <div class="bar">
        <span style="height:${Math.max(8, (counts[index] / max) * 170)}px"></span>
        <small>${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}</small>
      </div>
    `).join("");

    const tags = countBy(state.memories.flatMap((memory) => memory.tags || []));
    tagCloud.innerHTML = Object.entries(tags).length
      ? Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([tag, count]) => `<span class="tag">${escapeHtml(tag)} · ${count}</span>`).join("")
      : `<div class="empty-state">Tags will appear as you capture memories.</div>`;

    const sources = countBy(state.memories.map((memory) => hostName(memory.url)).filter(Boolean));
    sourceList.innerHTML = Object.entries(sources).length
      ? Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([source, count]) => `
        <article class="memory-item">
          <header><h3>${escapeHtml(source)}</h3><span class="tag">${count} memories</span></header>
        </article>
      `).join("")
      : `<div class="empty-state">Captured web sources will appear here.</div>`;
  };

  const safeUrl = (url) => {
    if (!url) return "";
    try {
      const u = new URL(url);
      return (u.protocol === "http:" || u.protocol === "https:") ? url : "";
    } catch {
      return "";
    }
  };

  const countBy = (values) => values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  const hostName = (url) => {
    try {
      return url ? new URL(url).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  };

  const setView = (view) => {
    $$(".view").forEach((node) => node.classList.remove("active"));
    $(`#${view}View`)?.classList.add("active");
    $$(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.view === view));
    const titles = {
      overview: ["Overview", "Track what you captured, what needs review, and what should resurface next."],
      review: ["Review", "Move through due memories with focused recall scoring."],
      library: ["Library", "Search, edit, pin, archive, and manage your knowledge base."],
      insights: ["Insights", "Understand capture rhythm, source concentration, and tag coverage."],
      settings: ["Settings", "Control resurfacing, review targets, and backup workflows."]
    };
    if ($("#viewTitle")) $("#viewTitle").textContent = titles[view]?.[0] || "MindStack";
    if ($("#viewSubtitle")) $("#viewSubtitle").textContent = titles[view]?.[1] || "";
  };

  const openMemoryDialog = (memory = null) => {
    const dialog = $("#memoryDialog");
    if (!dialog) return;
    $("#dialogTitle").textContent = memory ? "Edit memory" : "New memory";
    $("#memoryId").value = memory?.id || "";
    $("#memoryTitle").value = memory?.title || "";
    $("#memoryText").value = memory?.text || "";
    $("#memoryPrompt").value = memory?.prompt || "";
    $("#memoryTags").value = (memory?.tags || []).join(", ");
    $("#memoryPriority").value = memory?.priority || "medium";
    dialog.showModal();
  };

  const confirmAction = ({ eyebrow = "Confirm action", title, message, actionLabel = "Delete" }) => new Promise((resolve) => {
    const dialog = $("#confirmDialog");
    if (!dialog) {
      resolve(false);
      return;
    }

    $("#confirmEyebrow").textContent = eyebrow;
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    $("#confirmAccept").textContent = actionLabel;

    const cleanup = () => {
      $("#confirmAccept").removeEventListener("click", accept);
      $("#confirmCancel").removeEventListener("click", cancel);
      dialog.removeEventListener("cancel", cancel);
    };
    const accept = (event) => {
      event.preventDefault();
      cleanup();
      dialog.close();
      resolve(true);
    };
    const cancel = () => {
      cleanup();
      resolve(false);
    };

    $("#confirmAccept").addEventListener("click", accept);
    $("#confirmCancel").addEventListener("click", cancel);
    dialog.addEventListener("cancel", cancel);
    dialog.showModal();
  });

  const saveMemoryFromDialog = async (event) => {
    event.preventDefault();
    const id = $("#memoryId").value;
    const existing = state.memories.find((memory) => memory.id === id);
    const payload = {
      id: id || uid(),
      title: $("#memoryTitle").value.trim(),
      text: $("#memoryText").value.trim(),
      prompt: $("#memoryPrompt").value.trim(),
      tags: normalizeTags($("#memoryTags").value),
      priority: $("#memoryPriority").value,
      url: existing?.url || "",
      sourceTitle: existing?.sourceTitle || "",
      pinned: existing?.pinned || false,
      archived: existing?.archived || false,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextReviewAt: existing?.nextReviewAt || addDays(state.settings.defaultIntervalDays),
      reviewCount: existing?.reviewCount || 0,
      successCount: existing?.successCount || 0,
      ease: existing?.ease || 2.5
    };

    const memories = existing
      ? state.memories.map((memory) => memory.id === id ? payload : memory)
      : [payload, ...state.memories];
    await writeData({ ...state, memories });
    $("#memoryDialog").close();
    renderDashboard();
    toast("Memory saved");
  };

  const scoreReview = async (score) => {
    const memory = state.memories.find((item) => item.id === activeReviewId);
    if (!memory) return;
    const interval = {
      forgot: 1,
      hard: Math.max(1, Math.round((memory.reviewCount || 1) * 1.5)),
      good: Math.max(2, Math.round((memory.reviewCount || 1) * (memory.ease || 2.5))),
      easy: Math.max(4, Math.round((memory.reviewCount || 1) * ((memory.ease || 2.5) + 1)))
    }[score];
    const updated = {
      ...memory,
      reviewCount: (memory.reviewCount || 0) + 1,
      successCount: (memory.successCount || 0) + (score === "forgot" ? 0 : 1),
      ease: Math.min(3.4, Math.max(1.3, (memory.ease || 2.5) + ({ forgot: -0.35, hard: -0.12, good: 0.05, easy: 0.16 }[score]))),
      nextReviewAt: addDays(interval),
      updatedAt: new Date().toISOString()
    };
    await writeData({ ...state, memories: state.memories.map((item) => item.id === memory.id ? updated : item) });
    activeReviewId = null;
    renderDashboard();
    toast(`Review scored: ${score}`);
  };

  const bindSettingsValues = () => {
    if ($("#settingResurface")) $("#settingResurface").checked = state.settings.resurfaceEnabled;
    if ($("#settingDailyTarget")) $("#settingDailyTarget").value = state.settings.dailyTarget;
    if ($("#settingDefaultInterval")) $("#settingDefaultInterval").value = state.settings.defaultIntervalDays;
  };

  const renderAccount = () => {
    const connected = Boolean(state.account?.connected && state.account?.email);
    const name = connected ? state.account.email.split("@")[0] : "Not connected";
    const initial = connected ? state.account.email[0].toUpperCase() : "M";

    if ($("#accountName")) $("#accountName").textContent = connected ? name : "Not connected";
    if ($("#accountEmail")) {
      $("#accountEmail").textContent = connected
        ? `${state.account.email} · Chrome sync storage active`
        : "Connect your Chrome Google profile to verify cross-device sync.";
    }
    if ($("#accountAvatar")) $("#accountAvatar").textContent = initial;
    if ($("#syncStatus")) {
      $("#syncStatus").textContent = isExtension() && storageArea() === chrome.storage?.sync
        ? "Chrome sync active"
        : "Local storage fallback";
    }
    if ($("#disconnectGoogle")) $("#disconnectGoogle").disabled = !connected;
    if ($("#connectGoogle")) $("#connectGoogle").textContent = connected ? "Connected" : "Connect";
    if ($("#connectGoogle")) $("#connectGoogle").disabled = connected;
    if ($("#popupAuthGate")) $("#popupAuthGate").hidden = connected;
    if ($("#popupCaptureWorkspace")) $("#popupCaptureWorkspace").hidden = !connected;
  };

  const hasConnectedAccount = () => Boolean(state.account?.connected && state.account?.email);

  const requireConnectedAccount = () => {
    if (hasConnectedAccount()) return true;
    toast("Connect your Google account before saving.");
    return false;
  };

  const connectGoogle = async () => {
    if (!isExtension() || !chrome.identity?.getProfileUserInfo) {
      toast("Google identity is only available inside the extension");
      return;
    }

    chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, async (profile) => {
      if (!profile?.email) {
        toast("No Chrome Google profile found. Sign into Chrome, then try again.");
        return;
      }

      await writeData({
        ...state,
        account: {
          connected: true,
          email: profile.email,
          id: profile.id || "",
          connectedAt: new Date().toISOString()
        }
      });
      renderAccount();
      toast("Google account connected");
    });
  };

  const disconnectGoogle = async () => {
    await writeData({
      ...state,
      account: structuredClone(DEFAULT_DATA.account)
    });
    renderAccount();
    toast("Google account disconnected");
  };

  const saveSettings = async () => {
    await writeData({
      ...state,
      settings: {
        resurfaceEnabled: Boolean($("#settingResurface")?.checked),
        dailyTarget: Number($("#settingDailyTarget")?.value || 8),
        defaultIntervalDays: Number($("#settingDefaultInterval")?.value || 2)
      }
    });
    renderDashboard();
    toast("Settings saved");
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mindstack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file) => {
    if (!file) return;
    const data = JSON.parse(await file.text());
    await writeData(mergeData(data));
    renderDashboard();
    toast("Import complete");
  };

  const clearData = async () => {
    const accepted = await confirmAction({
      eyebrow: "Clear workspace",
      title: "Clear all MindStack data?",
      message: "This removes every saved memory, webpage, review score, and setting from this browser storage.",
      actionLabel: "Clear data"
    });
    if (!accepted) return;
    await writeData(DEFAULT_DATA);
    renderDashboard();
    toast("Data cleared");
  };

  const initDashboard = async () => {
    state = await readData();
    await seedIfEmpty();
    renderDashboard();

    $$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    $$("[data-view-link]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewLink)));
    $("#quickAdd")?.addEventListener("click", () => openMemoryDialog());
    $("#saveMemory")?.addEventListener("click", saveMemoryFromDialog);
    $("#globalSearch")?.addEventListener("input", renderDashboard);
    $("#sortBy")?.addEventListener("change", renderLibrary);
    $("#exportData")?.addEventListener("click", exportData);
    $("#importData")?.addEventListener("change", (event) => importData(event.target.files[0]).catch(() => toast("Import failed")));
    $("#clearData")?.addEventListener("click", clearData);
    $("#saveSettings")?.addEventListener("click", saveSettings);
    $("#connectGoogle")?.addEventListener("click", connectGoogle);
    $("#disconnectGoogle")?.addEventListener("click", disconnectGoogle);

    $("#statusFilter")?.addEventListener("click", (event) => {
      if (!event.target.matches("button")) return;
      activeFilter = event.target.dataset.filter;
      $$("#statusFilter button").forEach((button) => button.classList.toggle("active", button === event.target));
      renderLibrary();
    });

    document.addEventListener("click", async (event) => {
      const editId = event.target.dataset.edit;
      const pinId = event.target.dataset.pin;
      const archiveId = event.target.dataset.archive;
      const deleteId = event.target.dataset.delete;
      const reviewId = event.target.dataset.review;
      const recall = event.target.dataset.recall;

      if (editId) openMemoryDialog(state.memories.find((memory) => memory.id === editId));
      if (reviewId) {
        activeReviewId = reviewId;
        setView("review");
        renderReview();
      }
      if (pinId || archiveId) {
        const key = pinId ? "pinned" : "archived";
        const id = pinId || archiveId;
        await writeData({
          ...state,
          memories: state.memories.map((memory) => memory.id === id ? { ...memory, [key]: !memory[key] } : memory)
        });
        renderDashboard();
      }
      if (deleteId) {
        const memory = state.memories.find((item) => item.id === deleteId);
        if (!memory) return;
        const accepted = await confirmAction({
          eyebrow: "Delete memory",
          title: `Delete "${memory.title}"?`,
          message: "This removes the memory from your library and review queue. This action cannot be undone.",
          actionLabel: "Delete memory"
        });
        if (!accepted) return;
        await writeData({
          ...state,
          memories: state.memories.filter((item) => item.id !== deleteId)
        });
        if (activeReviewId === deleteId) activeReviewId = null;
        renderDashboard();
        toast("Memory deleted");
      }
      if (recall) scoreReview(recall);
      if (event.target.id === "revealAnswer") $("#answerBlock").hidden = false;
    });
  };

  const initPopup = async () => {
    state = await readData();
    const [tab] = isExtension() ? await chrome.tabs.query({ active: true, currentWindow: true }) : [{ title: "", url: "" }];
    $("#captureTitle").value = tab?.title || "";
    $("#pageCaptureTitle").value = tab?.title || "";
    $("#pagePreviewTitle").textContent = tab?.title || "Current page";
    $("#pagePreviewUrl").textContent = hostName(tab?.url) || tab?.url || "No active webpage";
    renderAccount();

    const requestSelection = () => {
      if (!isExtension() || !tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: "MINDSTACK_GET_SELECTION" }, (response) => {
        if (!chrome.runtime.lastError && response?.text) {
          $("#captureText").value = response.text;
          return;
        }
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection().toString().trim()
        }, (results) => {
          if (!chrome.runtime.lastError && results?.[0]?.result) {
            $("#captureText").value = results[0].result;
          }
        });
      });
    };

    if ($("#popupNotifications")) {
      $("#popupNotifications").checked = state.settings.resurfaceEnabled ?? true;
      $("#popupNotifications").addEventListener("change", async () => {
        await writeData({ ...state, settings: { ...state.settings, resurfaceEnabled: $("#popupNotifications").checked } });
        state = await readData();
      });
    }

    requestSelection();
    $$(".capture-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.captureMode;
        $$(".capture-tabs button").forEach((item) => item.classList.toggle("active", item === button));
        $("#webpageCapturePanel")?.classList.toggle("active", mode === "webpage");
        $("#memoryCapturePanel")?.classList.toggle("active", mode === "memory");
      });
    });
    $("#grabSelection")?.addEventListener("click", requestSelection);
    $("#connectGoogle")?.addEventListener("click", connectGoogle);
    $("#copyPageUrl")?.addEventListener("click", async () => {
      if (!tab?.url) {
        toast("No page URL available");
        return;
      }
      try {
        await navigator.clipboard.writeText(tab.url);
        toast("URL copied");
      } catch {
        toast("Copy failed");
      }
    });
    $("#openDashboard")?.addEventListener("click", () => {
      if (isExtension()) chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      else location.href = "dashboard.html";
    });
    $("#savePageCapture")?.addEventListener("click", async () => {
      if (!requireConnectedAccount()) return;
      if (!tab?.url) {
        toast("No webpage available to save");
        return;
      }
      const memory = {
        id: uid(),
        type: "webpage",
        title: $("#pageCaptureTitle").value.trim() || tab?.title || tab.url,
        text: $("#pageCaptureText").value.trim(),
        prompt: `Why did you save ${$("#pageCaptureTitle").value.trim() || tab?.title || "this page"}?`,
        tags: normalizeTags($("#pageCaptureTags").value || "webpage"),
        priority: $("#pageCapturePriority").value,
        url: tab.url,
        sourceTitle: tab?.title || "",
        pinned: false,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nextReviewAt: addDays(state.settings.defaultIntervalDays),
        reviewCount: 0,
        successCount: 0,
        ease: 2.5
      };
      await writeData({ ...state, memories: [memory, ...state.memories] });
      const message = savedMessage("Webpage", memory);
      toast(message);
      systemToast(message);
      pageToast(tab.id, message);
      $("#pageCaptureText").value = "";
    });
    $("#saveCapture")?.addEventListener("click", async () => {
      if (!requireConnectedAccount()) return;
      const text = $("#captureText").value.trim();
      if (!text) {
        toast("Add text before saving");
        return;
      }
      const memory = {
        id: uid(),
        type: "memory",
        title: $("#captureTitle").value.trim() || tab?.title || "Untitled memory",
        text,
        prompt: $("#capturePrompt").value.trim(),
        tags: normalizeTags($("#captureTags").value),
        priority: $("#capturePriority").value,
        url: tab?.url || "",
        sourceTitle: tab?.title || "",
        pinned: false,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nextReviewAt: addDays(state.settings.defaultIntervalDays),
        reviewCount: 0,
        successCount: 0,
        ease: 2.5
      };
      await writeData({ ...state, memories: [memory, ...state.memories] });
      const message = savedMessage("Text", memory);
      toast(message);
      systemToast(message);
      pageToast(tab.id, message);
      $("#captureText").value = "";
      $("#capturePrompt").value = "";
    });
  };

  const initOptions = async () => {
    state = await readData();
    bindSettingsValues();
    renderAccount();
    $("#saveSettings")?.addEventListener("click", saveSettings);
    $("#connectGoogle")?.addEventListener("click", connectGoogle);
    $("#disconnectGoogle")?.addEventListener("click", disconnectGoogle);
  };

  document.addEventListener("DOMContentLoaded", () => {
    if ($("#overviewView")) initDashboard();
    if ($(".popup-shell")) initPopup();
    if ($(".options-shell")) initOptions();
  });
})();

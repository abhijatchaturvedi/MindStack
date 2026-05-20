const STORE_KEY = "mindstack:data";

const DEFAULT_DATA = {
  memories: [],
  settings: {
    resurfaceEnabled: true,
    dailyTarget: 8,
    defaultIntervalDays: 2
  }
};

const storageArea = () => chrome.storage?.sync || chrome.storage?.local;

const readData = async () => {
  const stored = await storageArea().get(STORE_KEY);
  return {
    ...DEFAULT_DATA,
    ...(stored[STORE_KEY] || {}),
    settings: {
      ...DEFAULT_DATA.settings,
      ...((stored[STORE_KEY] || {}).settings || {})
    }
  };
};

const writeData = async (data) => {
  await storageArea().set({ [STORE_KEY]: data });
};

const uid = () => `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeTags = (value) =>
  String(value || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 1));
  return date.toISOString();
};

const truncate = (value, max = 72) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

const savedMessage = (label, memory) => `${label} saved to MindStack: ${truncate(memory.title)}`;

const notifyTab = (tabId, message) => {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message, () => {
    if (!chrome.runtime.lastError || message?.type !== "MINDSTACK_CAPTURED") return;
    injectPageToast(tabId, message.saved === false ? message.title : (message.message || `Saved to MindStack: ${message.title}`));
  });
};

const injectPageToast = (tabId, toastMessage) => {
  if (!tabId || !toastMessage) return;
  chrome.scripting.executeScript({
    target: { tabId },
    args: [toastMessage],
    func: (message) => {
      const existing = document.querySelector(".mindstack-capture-toast");
      if (existing) existing.remove();

      const toast = document.createElement("aside");
      toast.className = "mindstack-capture-toast";
      toast.setAttribute("role", "status");
      Object.assign(toast.style, {
        position: "fixed",
        right: "18px",
        bottom: "20px",
        zIndex: "2147483647",
        maxWidth: "360px",
        padding: "14px 16px",
        border: "1px solid rgba(20, 124, 114, 0.22)",
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
      body.textContent = message;

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
};

const showNotification = (message) => {
  if (!chrome.notifications || !message) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title: "MindStack",
    message
  });
};

const getSelectionFromTab = async (tabId) => {
  if (!tabId) return "";
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection().toString().trim()
    });
    return result?.result || "";
  } catch {
    return "";
  }
};

const captureMemory = async ({ title, text, url, sourceTitle, tags, priority, prompt, type }) => {
  const data = await readData();
  const cleanText = String(text || "").trim();
  const cleanUrl = String(url || "").trim();
  if (!cleanText && !cleanUrl) return null;
  const captureType = type || (cleanText ? "memory" : "webpage");
  const cleanTitle = String(title || sourceTitle || cleanUrl || "Untitled memory").trim();

  const memory = {
    id: uid(),
    type: captureType,
    title: cleanTitle,
    text: cleanText,
    prompt: String(prompt || (captureType === "webpage" ? `Why did you save ${cleanTitle}?` : `What is important about ${cleanTitle}?`)).trim(),
    url: cleanUrl,
    sourceTitle: sourceTitle || "",
    tags: Array.isArray(tags) ? tags : normalizeTags(tags),
    priority: priority || "medium",
    pinned: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextReviewAt: daysFromNow(data.settings.defaultIntervalDays),
    reviewCount: 0,
    successCount: 0,
    ease: 2.5
  };

  data.memories.unshift(memory);
  await writeData(data);
  return memory;
};

const setupContextMenus = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "mindstack-capture-selection",
      title: "Save selection to MindStack",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "mindstack-save-page",
      title: "Save page to MindStack",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "mindstack-open-dashboard",
      title: "Open MindStack dashboard",
      contexts: ["action"]
    });
  });
};

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);
setupContextMenus();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "mindstack-open-dashboard") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    return;
  }

  if (info.menuItemId === "mindstack-capture-selection") {
    const memory = await captureMemory({
      text: info.selectionText,
      title: tab?.title,
      sourceTitle: tab?.title,
      url: tab?.url,
      tags: ["web"],
      priority: "medium"
    });
    if (memory && tab?.id) {
      const message = savedMessage("Text", memory);
      showNotification(message);
      notifyTab(tab.id, {
        type: "MINDSTACK_CAPTURED",
        title: memory.title,
        message
      });
    }
  }

  if (info.menuItemId === "mindstack-save-page") {
    const memory = await captureMemory({
      title: tab?.title,
      sourceTitle: tab?.title,
      url: tab?.url,
      tags: ["webpage"],
      priority: "medium",
      type: "webpage"
    });
    if (memory && tab?.id) {
      const message = savedMessage("Webpage", memory);
      showNotification(message);
      notifyTab(tab.id, {
        type: "MINDSTACK_CAPTURED",
        title: memory.title,
        message
      });
    }
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "open-dashboard") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }

  if (command === "save-page" && tab?.id) {
    const memory = await captureMemory({
      title: tab.title,
      sourceTitle: tab.title,
      url: tab.url,
      tags: ["webpage"],
      priority: "medium",
      type: "webpage"
    });
    const message = memory ? savedMessage("Webpage", memory) : undefined;
    if (message) showNotification(message);
    notifyTab(tab.id, {
      type: "MINDSTACK_CAPTURED",
      title: memory?.title || "This page could not be saved",
      saved: Boolean(memory),
      message
    });
  }

  if (command === "capture-selection" && tab?.id) {
    const text = await getSelectionFromTab(tab.id);
    const memory = await captureMemory({
      text,
      title: tab.title,
      sourceTitle: tab.title,
      url: tab.url,
      tags: ["web"],
      priority: "medium",
      type: "memory"
    });
    const message = memory ? savedMessage("Text", memory) : undefined;
    if (message) showNotification(message);
    notifyTab(tab.id, {
      type: "MINDSTACK_CAPTURED",
      title: memory?.title || "No selected text found",
      saved: Boolean(memory),
      message
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "MINDSTACK_CAPTURE") {
    captureMemory({
      ...message.payload,
      url: message.payload?.url || sender.tab?.url,
      sourceTitle: message.payload?.sourceTitle || sender.tab?.title
    }).then((memory) => {
      if (memory) {
        const label = memory.type === "webpage" ? "Webpage" : "Text";
        showNotification(savedMessage(label, memory));
      }
      sendResponse({ ok: Boolean(memory), memory });
    });
    return true;
  }

  if (message?.type === "MINDSTACK_OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    sendResponse({ ok: true });
  }

  return false;
});

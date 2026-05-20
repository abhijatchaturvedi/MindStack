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

const captureMemory = async ({ title, text, url, sourceTitle, tags, priority, prompt }) => {
  const data = await readData();
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;

  const memory = {
    id: uid(),
    title: String(title || sourceTitle || "Untitled memory").trim(),
    text: cleanText,
    prompt: String(prompt || `What is important about ${String(title || sourceTitle || "this note").trim()}?`).trim(),
    url: url || "",
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mindstack-capture-selection",
    title: "Save selection to MindStack",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "mindstack-open-dashboard",
    title: "Open MindStack dashboard",
    contexts: ["action"]
  });
});

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
      chrome.tabs.sendMessage(tab.id, { type: "MINDSTACK_CAPTURED", title: memory.title }, () => {
        void chrome.runtime.lastError;
      });
    }
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "open-dashboard") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }

  if (command === "capture-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "MINDSTACK_GET_SELECTION" }, async (response) => {
      if (chrome.runtime.lastError || !response?.text) return;
      await captureMemory({
        text: response.text,
        title: tab.title,
        sourceTitle: tab.title,
        url: tab.url,
        tags: ["web"],
        priority: "medium"
      });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "MINDSTACK_CAPTURE") {
    captureMemory({
      ...message.payload,
      url: message.payload?.url || sender.tab?.url,
      sourceTitle: message.payload?.sourceTitle || sender.tab?.title
    }).then((memory) => sendResponse({ ok: Boolean(memory), memory }));
    return true;
  }

  if (message?.type === "MINDSTACK_OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    sendResponse({ ok: true });
  }

  return false;
});

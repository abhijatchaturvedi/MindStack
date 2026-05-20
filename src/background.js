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

const notifyTab = (tabId, message) => {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
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
      notifyTab(tab.id, {
        type: "MINDSTACK_CAPTURED",
        title: memory.title,
        message: `Text saved to MindStack: ${memory.title}`
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
      notifyTab(tab.id, {
        type: "MINDSTACK_CAPTURED",
        title: memory.title,
        message: `Webpage saved to MindStack: ${memory.title}`
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
    notifyTab(tab.id, {
      type: "MINDSTACK_CAPTURED",
      title: memory?.title || "This page could not be saved",
      saved: Boolean(memory),
      message: memory ? `Webpage saved to MindStack: ${memory.title}` : undefined
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
    notifyTab(tab.id, {
      type: "MINDSTACK_CAPTURED",
      title: memory?.title || "No selected text found",
      saved: Boolean(memory),
      message: memory ? `Text saved to MindStack: ${memory.title}` : undefined
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

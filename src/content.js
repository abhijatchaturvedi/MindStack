(() => {
  const getSelectionText = () => window.getSelection().toString().trim();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "MINDSTACK_GET_SELECTION") {
      sendResponse({ text: getSelectionText() });
    }

    if (message?.type === "MINDSTACK_CAPTURED") {
      showToast(`Saved to MindStack: ${message.title}`);
      sendResponse({ ok: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    const isMod = event.ctrlKey || event.metaKey;
    if (!isMod || !event.shiftKey || event.key.toLowerCase() !== "y") return;
    const text = getSelectionText();
    if (!text) return;
    chrome.runtime.sendMessage({
      type: "MINDSTACK_CAPTURE",
      payload: {
        text,
        title: document.title,
        sourceTitle: document.title,
        url: location.href,
        tags: ["web"],
        priority: "medium"
      }
    });
  });

  const showToast = (message) => {
    const toast = document.createElement("div");
    toast.className = "mindstack-resurface";
    toast.innerHTML = `
      <header>
        <strong>MindStack</strong>
        <button class="mindstack-close" aria-label="Close">x</button>
      </header>
      <p>${escapeHtml(message)}</p>
    `;
    document.body.appendChild(toast);
    toast.querySelector("button").addEventListener("click", () => toast.remove());
    setTimeout(() => toast.remove(), 3600);
  };

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char]));

  const maybeShowResurface = () => {
    if (!chrome.storage) return;
    const key = "mindstack:data";
    const area = chrome.storage.sync || chrome.storage.local;
    area.get(key, (stored) => {
      const data = stored[key];
      if (!data?.settings?.resurfaceEnabled) return;

      const due = (data.memories || [])
        .filter((memory) => !memory.archived && new Date(memory.nextReviewAt) <= new Date())
        .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));

      if (!due.length) return;

      const memory = due[0];
      const card = document.createElement("aside");
      card.className = "mindstack-resurface";
      card.innerHTML = `
        <header>
          <strong>Review due</strong>
          <button class="mindstack-close" aria-label="Close">x</button>
        </header>
        <p>${escapeHtml(memory.prompt || memory.title)}</p>
        <button class="mindstack-open">Open review queue</button>
      `;
      document.body.appendChild(card);
      card.querySelector(".mindstack-close").addEventListener("click", () => card.remove());
      card.querySelector(".mindstack-open").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "MINDSTACK_OPEN_DASHBOARD" });
        card.remove();
      });
    });
  };

  setTimeout(maybeShowResurface, 1800);
})();

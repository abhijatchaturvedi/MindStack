(() => {
  const getSelectionText = () => window.getSelection().toString().trim();
  const truncate = (value, max = 72) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  };
  const savedMessage = (label, memory) => `${label} saved to MindStack: ${truncate(memory.title)}`;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "MINDSTACK_GET_SELECTION") {
      sendResponse({ text: getSelectionText() });
    }

    if (message?.type === "MINDSTACK_CAPTURED") {
      showToast(message.saved === false ? message.title : (message.message || `Saved to MindStack: ${message.title}`));
      sendResponse({ ok: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!event.altKey || !event.shiftKey) return;

    if (event.key.toLowerCase() === "t") {
      const text = getSelectionText();
      if (!text) return;
      event.preventDefault();
      chrome.runtime.sendMessage({
        type: "MINDSTACK_CAPTURE",
        payload: {
          text,
          title: document.title,
          sourceTitle: document.title,
          url: location.href,
          tags: ["web"],
          priority: "medium",
          type: "memory"
        }
      }, (response) => {
        if (response?.ok) showToast(savedMessage("Text", response.memory));
      });
    }

    if (event.key.toLowerCase() === "w") {
      event.preventDefault();
      chrome.runtime.sendMessage({
        type: "MINDSTACK_CAPTURE",
        payload: {
          text: "",
          title: document.title,
          sourceTitle: document.title,
          url: location.href,
          tags: ["webpage"],
          priority: "medium",
          type: "webpage"
        }
      }, (response) => {
        if (response?.ok) showToast(savedMessage("Webpage", response.memory));
      });
    }
  });

  const showToast = (message) => {
    document.querySelector(".mindstack-resurface.mindstack-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "mindstack-resurface mindstack-toast";
    toast.innerHTML = `
      <header>
        <strong>MindStack</strong>
        <button class="mindstack-close" aria-label="Close">x</button>
      </header>
      <p>${escapeHtml(message)}</p>
    `;
    document.body.appendChild(toast);
    toast.querySelector("button").addEventListener("click", () => toast.remove());
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 260);
    }, 3600);
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

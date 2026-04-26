(() => {
      "use strict";

      const $ = (id) => document.getElementById(id);
      const els = {
        apiUrl: $("apiUrl"),
        apiKey: $("apiKey"),
        rememberKey: $("rememberKey"),
        backendMode: $("backendMode"),
        saveDirStatus: $("saveDirStatus"),
        model: $("model"),
        reasoningEffort: $("reasoningEffort"),
        maxTokens: $("maxTokens"),
        serviceTier: $("serviceTier"),
        imageSize: $("imageSize"),
        customSize: $("customSize"),
        sizeHint: $("sizeHint"),
        imageQuality: $("imageQuality"),
        moderation: $("moderation"),
        outputFormat: $("outputFormat"),
        imageAction: $("imageAction"),
        outputCompression: $("outputCompression"),
        compressionValue: $("compressionValue"),
        preservePrompt: $("preservePrompt"),
        transparentMode: $("transparentMode"),
        transparentControls: $("transparentControls"),
        keyColor: $("keyColor"),
        chromaTolerance: $("chromaTolerance"),
        toleranceValue: $("toleranceValue"),
        streamMode: $("streamMode"),
        autoDownload: $("autoDownload"),
        storeResponse: $("storeResponse"),
        systemPrompt: $("systemPrompt"),
        prompt: $("prompt"),
        modeGenerate: $("modeGenerate"),
        modeEdit: $("modeEdit"),
        dropzone: $("dropzone"),
        fileInput: $("fileInput"),
        attachments: $("attachments"),
        attachmentImport: $("attachmentImport"),
        attachmentImportLabel: $("attachmentImportLabel"),
        attachmentImportMeta: $("attachmentImportMeta"),
        attachmentImportBar: $("attachmentImportBar"),
        pickFileBtn: $("pickFileBtn"),
        removeImagesBtn: $("removeImagesBtn"),
        sendBtn: $("sendBtn"),
        abortBtn: $("abortBtn"),
        requestPreview: $("requestPreview"),
        copyRequestBtn: $("copyRequestBtn"),
        outputArea: $("outputArea"),
        statusText: $("statusText"),
        meter: $("meter"),
        runMeta: $("runMeta"),
        gallery: $("gallery"),
        galleryMeta: $("galleryMeta"),
        eventLog: $("eventLog"),
        rawResponse: $("rawResponse"),
        clearRunBtn: $("clearRunBtn"),
        clearGalleryBtn: $("clearGalleryBtn"),
        saveDirBtn: $("saveDirBtn"),
        saveSessionDirBtn: $("saveSessionDirBtn"),
        exportSessionBtn: $("exportSessionBtn"),
        newSessionBtn: $("newSessionBtn"),
        sessionList: $("sessionList"),
        imageDialog: $("imageDialog"),
        modalTitle: $("modalTitle"),
        modalImage: $("modalImage"),
        modalMeta: $("modalMeta"),
        modalPrompt: $("modalPrompt"),
        modalCopyBtn: $("modalCopyBtn"),
        modalDownloadBtn: $("modalDownloadBtn"),
        modalUseBtn: $("modalUseBtn"),
        closeModalBtn: $("closeModalBtn"),
        loadJsonBtn: $("loadJsonBtn"),
        jsonDialog: $("jsonDialog"),
        closeJsonBtn: $("closeJsonBtn"),
        jsonInput: $("jsonInput"),
        importJsonBtn: $("importJsonBtn"),
        maskDialog: $("maskDialog"),
        closeMaskBtn: $("closeMaskBtn"),
        maskImage: $("maskImage"),
        maskCanvas: $("maskCanvas"),
        maskBrushSize: $("maskBrushSize"),
        maskBrushValue: $("maskBrushValue"),
        maskDrawBtn: $("maskDrawBtn"),
        maskEraseBtn: $("maskEraseBtn"),
        maskClearBtn: $("maskClearBtn"),
        maskSaveBtn: $("maskSaveBtn"),
        toast: $("toast"),
        sidebarToggle: $("sidebarToggle"),
        sessionsAside: $("sessionsAside"),
        paramsDrawer: $("paramsDrawer"),
        paramsOverlay: $("paramsOverlay"),
        paramsToggleBtn: $("paramsToggleBtn"),
        paramsCloseBtn: $("paramsCloseBtn"),
        tabChat: $("tabChat"),
        tabGallery: $("tabGallery"),
        galleryView: $("galleryView"),
        overflowMenuBtn: $("overflowMenuBtn"),
        overflowMenu: $("overflowMenu"),
        chatMain: $("chatMain"),
        tabAllGallery: $("tabAllGallery"),
        allGalleryView: $("allGalleryView"),
        allGallery: $("allGallery"),
        tabFavoriteGallery: $("tabFavoriteGallery"),
        favoriteGalleryView: $("favoriteGalleryView"),
        favoriteGallery: $("favoriteGallery"),
      };

      const state = {
        mode: "generate",
        attachments: [],
        gallery: [],
        turns: [],
        sessions: [],
        activeSessionId: "",
        saveDirHandle: null,
        db: null,
        modalImage: null,
        maskAttachmentId: "",
        maskMode: "draw",
        maskDrawing: false,
        runStates: {},
        turnSaveTimers: new Map(),
        attachmentImport: {
          active: false,
          totalFiles: 0,
          doneFiles: 0,
          totalBytes: 0,
          loadedBytes: 0,
          currentName: "",
        },
      };

      function getRunState(sessionId) {
        const id = sessionId || state.activeSessionId;
        if (!state.runStates[id]) {
          state.runStates[id] = {
            controller: null,
            currentText: "",
            currentImages: [],
            currentRunEl: null,
            currentTurnId: "",
            currentPrompt: "",
            currentAttachments: [],
            seenImageIds: new Set(),
            eventCount: 0,
            isRunning: false,
            runStartedAt: 0,
            runTimer: null,
            lastStatus: "就绪",
            backendJobId: "",
          };
        }
        return state.runStates[id];
      }

      function activeRun() {
        return getRunState(state.activeSessionId);
      }

      function hasRunningRequests() {
        return Object.values(state.runStates).some((run) => run && run.isRunning);
      }

      const settingsKeys = [
        "apiUrl",
        "backendMode",
        "model",
        "reasoningEffort",
        "imageSize",
        "customSize",
        "imageQuality",
        "moderation",
        "outputFormat",
        "imageAction",
        "outputCompression",
        "preservePrompt",
        "transparentMode",
        "keyColor",
        "chromaTolerance",
        "streamMode",
        "autoDownload",
        "storeResponse",
        "systemPrompt",
        "serviceTier",
      ];

      init();

      function init() {
        restoreSettings();
        restoreSidebarState();
        loadSessions();
        bindEvents();
        updateMode();
        updateOptionStates();
        updateRequestPreview();
        updateSaveDirStatus();
        openDb().then(async () => {
          await loadSavedDirectory();
          await loadTurns();
          await loadGallery();
        }).catch(() => {
          toast("IndexedDB 不可用，聊天记录和图库只在当前页面有效", "error");
        });
      }

      function bindEvents() {
        els.sidebarToggle.addEventListener("click", toggleSidebar);
        window.addEventListener("beforeunload", (event) => {
          if (!hasRunningRequests()) return;
          event.preventDefault();
          event.returnValue = "";
        });

        settingsKeys.forEach((id) => {
          const el = els[id];
          if (!el) return;
          el.addEventListener("input", () => {
            saveSettings();
            updateRequestPreview();
          });
          el.addEventListener("change", () => {
            saveSettings();
            updateRequestPreview();
          });
        });

        ["maxTokens", "prompt"].forEach((id) => {
          els[id].addEventListener("input", updateRequestPreview);
        });
        els.customSize.addEventListener("blur", normalizeCustomSizeField);
        els.rememberKey.addEventListener("change", () => {
          if (!els.rememberKey.checked) {
            try {
              const settings = JSON.parse(localStorage.getItem("imageWorkbench.settings") || "{}");
              delete settings.apiKey;
              delete settings.apiUrl;
              settings.rememberKey = false;
              localStorage.setItem("imageWorkbench.settings", JSON.stringify(settings));
            } catch {
              localStorage.removeItem("imageWorkbench.settings");
            }
            toast("已停止保存连接信息");
          } else {
            saveSettings();
            toast("已保存连接信息到当前浏览器");
          }
        });
        els.apiKey.addEventListener("input", () => {
          if (els.rememberKey.checked) saveSettings();
        });
        ["imageSize", "outputFormat", "transparentMode", "backendMode"].forEach((id) => {
          els[id].addEventListener("change", updateOptionStates);
        });
        ["outputCompression", "chromaTolerance"].forEach((id) => {
          els[id].addEventListener("input", updateOptionStates);
        });

        els.apiKey.addEventListener("paste", (event) => {
          const text = event.clipboardData && event.clipboardData.getData("text");
          if (text && text.trim().startsWith("{")) {
            const ok = applyConnectionJson(text);
            if (ok) event.preventDefault();
          }
        });

        els.modeGenerate.addEventListener("click", () => {
          state.mode = "generate";
          updateMode();
          updateRequestPreview();
        });
        els.modeEdit.addEventListener("click", () => {
          state.mode = "edit";
          updateMode();
          updateRequestPreview();
        });

        els.dropzone.addEventListener("click", () => els.fileInput.click());
        els.pickFileBtn.addEventListener("click", () => els.fileInput.click());
        els.dropzone.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            els.fileInput.click();
          }
        });
        els.fileInput.addEventListener("change", async () => {
          await addFiles(els.fileInput.files);
          els.fileInput.value = "";
        });
        els.removeImagesBtn.addEventListener("click", () => {
          state.attachments = [];
          renderAttachments();
          updateRequestPreview();
        });

        ["dragenter", "dragover"].forEach((name) => {
          els.dropzone.addEventListener(name, (event) => {
            event.preventDefault();
            els.dropzone.classList.add("drag");
          });
        });
        ["dragleave", "drop"].forEach((name) => {
          els.dropzone.addEventListener(name, (event) => {
            event.preventDefault();
            els.dropzone.classList.remove("drag");
          });
        });
        els.dropzone.addEventListener("drop", async (event) => addFiles(event.dataTransfer.files));

        document.addEventListener("paste", async (event) => {
          const items = Array.from(event.clipboardData ? event.clipboardData.items : []);
          const files = items
            .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .map((item) => item.getAsFile())
            .filter(Boolean);
          if (files.length) {
            await addFiles(files);
            toast(`已粘贴 ${files.length} 张图片`);
          }
        });

        els.sendBtn.addEventListener("click", sendRequest);
        els.abortBtn.addEventListener("click", async () => {
          const run = activeRun();
          if (run.backendJobId) {
            fetch(`./api/jobs/${encodeURIComponent(run.backendJobId)}`, { method: "DELETE" }).catch(() => {});
          }
          if (run.controller) run.controller.abort();
        });
        els.copyRequestBtn.addEventListener("click", () => copyText(els.requestPreview.textContent));
        els.clearRunBtn.addEventListener("click", () => clearRun());
        els.clearGalleryBtn.addEventListener("click", clearGallery);
        els.newSessionBtn.addEventListener("click", newSession);
        els.saveDirBtn.addEventListener("click", chooseSaveDirectory);
        els.saveSessionDirBtn.addEventListener("click", saveCurrentSessionToDirectory);
        els.exportSessionBtn.addEventListener("click", exportCurrentSessionZip);

        els.closeModalBtn.addEventListener("click", () => els.imageDialog.close());
        els.modalCopyBtn.addEventListener("click", () => {
          if (state.modalImage) copyImage(state.modalImage);
        });
        els.modalDownloadBtn.addEventListener("click", () => {
          if (state.modalImage) downloadImage(state.modalImage);
        });
        els.modalUseBtn.addEventListener("click", async () => {
          if (state.modalImage && state.modalImage.sourceKind !== "input") {
            await useImageAsInput(state.modalImage);
            els.imageDialog.close();
          }
        });

        els.loadJsonBtn.addEventListener("click", () => {
          els.jsonInput.value = "";
          els.jsonDialog.showModal();
        });
        els.closeJsonBtn.addEventListener("click", () => els.jsonDialog.close());
        els.importJsonBtn.addEventListener("click", importJson);
        bindMaskEvents();

        // Params drawer
        els.paramsToggleBtn.addEventListener("click", () => toggleParamsDrawer());
        els.paramsCloseBtn.addEventListener("click", () => toggleParamsDrawer(false));
        els.paramsOverlay.addEventListener("click", () => toggleParamsDrawer(false));

        // Tab switching
        els.tabChat.addEventListener("click", () => switchTab("chat"));
        els.tabGallery.addEventListener("click", () => switchTab("gallery"));
        els.tabAllGallery.addEventListener("click", () => switchTab("allGallery"));
        els.tabFavoriteGallery.addEventListener("click", () => switchTab("favoriteGallery"));

        // Overflow menu
        els.overflowMenuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          els.overflowMenu.classList.toggle("open");
        });
        document.addEventListener("click", () => els.overflowMenu.classList.remove("open"));
        els.overflowMenu.querySelectorAll(".menu-item").forEach((item) => {
          item.addEventListener("click", () => els.overflowMenu.classList.remove("open"));
        });

        // Auto-grow prompt textarea
        els.prompt.addEventListener("input", () => {
          els.prompt.style.height = "auto";
          els.prompt.style.height = Math.min(els.prompt.scrollHeight, 160) + "px";
        });

        // Expand drag-drop to chat area
        if (els.chatMain) {
          ["dragenter", "dragover"].forEach((name) => {
            els.chatMain.addEventListener(name, (event) => {
              event.preventDefault();
              els.chatMain.classList.add("drag");
            });
          });
          ["dragleave", "drop"].forEach((name) => {
            els.chatMain.addEventListener(name, (event) => {
              event.preventDefault();
              els.chatMain.classList.remove("drag");
            });
          });
          els.chatMain.addEventListener("drop", async (event) => addFiles(event.dataTransfer.files));
        }

        // Ctrl+Enter to send
        els.prompt.addEventListener("keydown", (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            els.sendBtn.click();
          }
        });
      }

      function toggleSidebar() {
        const aside = els.sessionsAside;
        aside.classList.toggle("sidebar-collapsed");
        localStorage.setItem("imageWorkbench.sidebarCollapsed", aside.classList.contains("sidebar-collapsed"));
      }

      function restoreSidebarState() {
        const collapsed = localStorage.getItem("imageWorkbench.sidebarCollapsed");
        if (collapsed === "false") {
          els.sessionsAside.classList.remove("sidebar-collapsed");
        }
      }

      function toggleParamsDrawer(open) {
        const isOpen = open !== undefined ? open : !els.paramsDrawer.classList.contains("open");
        els.paramsDrawer.classList.toggle("open", isOpen);
        els.paramsOverlay.classList.toggle("visible", isOpen);
      }

      function switchTab(tab) {
        els.tabChat.classList.toggle("active", tab === "chat");
        els.tabGallery.classList.toggle("active", tab === "gallery");
        els.tabAllGallery.classList.toggle("active", tab === "allGallery");
        els.tabFavoriteGallery.classList.toggle("active", tab === "favoriteGallery");
        els.outputArea.classList.toggle("hidden", tab !== "chat");
        els.galleryView.classList.toggle("hidden", tab !== "gallery");
        els.allGalleryView.classList.toggle("hidden", tab !== "allGallery");
        els.favoriteGalleryView.classList.toggle("hidden", tab !== "favoriteGallery");
        if (tab === "allGallery") renderAllGallery();
        if (tab === "favoriteGallery") renderFavoriteGallery();
      }

      function restoreSettings() {
        const raw = localStorage.getItem("imageWorkbench.settings");
        if (!raw) return;
        try {
          const settings = JSON.parse(raw);
          settingsKeys.forEach((id) => {
            if (!(id in settings) || !els[id]) return;
            if (els[id].type === "checkbox") els[id].checked = Boolean(settings[id]);
            else els[id].value = settings[id];
          });
          if (settings.apiUrl === "https://api.xdedm.top") els.apiUrl.value = "";
          if (settings.backendModeDefaultVersion !== 1) els.backendMode.checked = true;
          if (!("streamMode" in settings)) els.streamMode.checked = true;
          els.rememberKey.checked = settings.rememberKey !== false;
          if (els.rememberKey.checked && settings.apiKey) {
            els.apiKey.value = settings.apiKey;
          }
        } catch {
          localStorage.removeItem("imageWorkbench.settings");
        }
      }

      function saveSettings() {
        const settings = {};
        settingsKeys.forEach((id) => {
          if (!els[id]) return;
          settings[id] = els[id].type === "checkbox" ? els[id].checked : els[id].value;
        });
        settings.rememberKey = els.rememberKey.checked;
        settings.backendModeDefaultVersion = 1;
        if (els.rememberKey.checked) {
          settings.apiKey = els.apiKey.value;
        } else {
          delete settings.apiUrl;
        }
        localStorage.setItem("imageWorkbench.settings", JSON.stringify(settings));
      }

      function updateOptionStates() {
        const customSizeField = els.customSize.closest(".field");
        const customSizeActive = els.imageSize.value === "custom";
        els.customSize.disabled = !customSizeActive;
        if (customSizeField) customSizeField.classList.toggle("hidden", !customSizeActive);
        updateSizeHint();
        if (els.transparentMode.checked && els.outputFormat.value !== "png" && els.outputFormat.value !== "webp") {
          els.outputFormat.value = "png";
        }
        const compressed = els.outputFormat.value === "jpeg" || els.outputFormat.value === "webp";
        els.outputCompression.disabled = !compressed;
        els.compressionValue.textContent = els.outputCompression.value;
        els.toleranceValue.textContent = els.chromaTolerance.value;
        els.transparentControls.classList.toggle("hidden", !els.transparentMode.checked);
        saveSettings();
        updateRequestPreview();
      }

      function updateSizeHint() {
        if (els.imageSize.value !== "custom") {
          els.sizeHint.textContent = "";
          return;
        }
        const raw = els.customSize.value.trim();
        if (!raw) {
          els.sizeHint.innerHTML = '<span class="chip">输入 WIDTHxHEIGHT</span>';
          return;
        }
        const normalized = normalizeImageSize(raw);
        if (!normalized.ok) {
          els.sizeHint.innerHTML = `<span class="chip">${escapeHtml(normalized.message)}</span>`;
          return;
        }
        const changed = normalized.size !== raw;
        els.sizeHint.innerHTML = `<span class="chip">发送 ${normalized.size}${changed ? "，已自动规范" : ""}</span>`;
      }

      function normalizeCustomSizeField() {
        if (els.imageSize.value !== "custom") return;
        const normalized = normalizeImageSize(els.customSize.value.trim());
        if (normalized.ok) {
          els.customSize.value = normalized.size;
          saveSettings();
          updateRequestPreview();
        }
        updateSizeHint();
      }

      function loadSessions() {
        const raw = localStorage.getItem("imageWorkbench.sessions");
        try {
          state.sessions = raw ? JSON.parse(raw) : [];
        } catch {
          state.sessions = [];
        }
        if (!Array.isArray(state.sessions) || !state.sessions.length) {
          state.sessions = [createSession("Session 1")];
        }
        state.activeSessionId = localStorage.getItem("imageWorkbench.activeSession") || state.sessions[0].id;
        if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
          state.activeSessionId = state.sessions[0].id;
        }
        saveSessions();
        renderSessions();
      }

      function createSession(title) {
        const now = Date.now();
        const session = {
          id: uid("session"),
          title,
          createdAt: now,
          updatedAt: now,
        };
        session.folderName = buildSessionFolderName(session);
        return session;
      }

      function saveSessions() {
        state.sessions.forEach(ensureSessionFolderName);
        localStorage.setItem("imageWorkbench.sessions", JSON.stringify(state.sessions));
        localStorage.setItem("imageWorkbench.activeSession", state.activeSessionId);
      }

      function newSession() {
        const next = createSession(`Session ${state.sessions.length + 1}`);
        state.sessions.unshift(next);
        state.activeSessionId = next.id;
        saveSessions();
        state.attachments = [];
        renderAttachments();
        clearRun(next.id);
        renderSessions();
        renderGallery();
        updateRequestPreview();
        updateSaveDirStatus();
      }

      function switchSession(id) {
        if (!state.sessions.some((session) => session.id === id)) return;
        state.activeSessionId = id;
        saveSessions();
        renderSessions();
        renderGallery();
        renderSessionHistory();
        attachActivePendingJob();
        syncActiveRunControls();
        updateSaveDirStatus();
      }

      function touchActiveSession(prompt) {
        const session = getActiveSession();
        if (!session) return;
        session.updatedAt = Date.now();
        if (prompt && /^Session \d+$/.test(session.title)) {
          session.title = prompt.slice(0, 28);
          if (!currentSessionImages().length) session.folderName = buildSessionFolderName(session);
        }
        saveSessions();
        renderSessions();
        updateSaveDirStatus();
      }

      function getActiveSession() {
        return state.sessions.find((session) => session.id === state.activeSessionId);
      }

      function renderSessions() {
        els.sessionList.innerHTML = "";
        state.sessions.forEach((session) => {
          const imageCount = state.gallery.filter((image) => image.sessionId === session.id).length;
          const turnCount = state.turns.filter((turn) => turn.sessionId === session.id).length;
          const sessionRun = state.runStates[session.id];
          const running = sessionRun && sessionRun.isRunning;
          const row = document.createElement("div");
          row.className = `session-row ${session.id === state.activeSessionId ? "active" : ""}`;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "session-item";
          btn.innerHTML = [
            `<span class="session-title">${escapeHtml(session.title || "Session")}</span>`,
            `<span class="session-sub">${running ? '<span class="session-running">running</span>' : ""}<span>${turnCount} turns</span><span>${imageCount} images</span><span>${formatShortDateTime(session.updatedAt)}</span></span>`,
          ].join("");
          btn.addEventListener("click", () => {
            if (state.activeSessionId === session.id) return;
            switchSession(session.id);
          });
          const actions = document.createElement("div");
          actions.className = "session-actions";
          actions.append(
            iconButton("#i-pen", "重命名 Session", () => renameSession(session.id)),
            iconButton("#i-trash", "删除 Session", () => deleteSession(session.id)),
          );
          row.append(btn, actions);
          els.sessionList.append(row);
        });
      }

      function renameSession(id) {
        const session = state.sessions.find((entry) => entry.id === id);
        if (!session) return;
        const next = window.prompt("Session 名称", session.title || "Session");
        if (next === null) return;
        const title = next.trim();
        if (!title) return;
        session.title = title.slice(0, 80);
        session.updatedAt = Date.now();
        if (!state.gallery.some((image) => image.sessionId === id)) {
          session.folderName = buildSessionFolderName(session);
        }
        saveSessions();
        renderSessions();
        updateSaveDirStatus();
      }

      async function deleteSession(id) {
        const session = state.sessions.find((entry) => entry.id === id);
        if (!session) return;
        const images = state.gallery.filter((image) => image.sessionId === id);
        const turns = state.turns.filter((turn) => turn.sessionId === id);
        if (!confirm(`删除 "${session.title || "Session"}"、${turns.length} 轮对话和其中 ${images.length} 张本地图片？`)) return;

        state.sessions = state.sessions.filter((entry) => entry.id !== id);
        if (!state.sessions.length) state.sessions = [createSession("Session 1")];
        if (state.activeSessionId === id) state.activeSessionId = state.sessions[0].id;
        state.gallery = state.gallery.filter((image) => image.sessionId !== id);
        state.turns = state.turns.filter((turn) => turn.sessionId !== id);
        const deletedRun = state.runStates[id];
        if (deletedRun) {
          if (deletedRun.controller) deletedRun.controller.abort();
          if (deletedRun.runTimer) clearInterval(deletedRun.runTimer);
          delete state.runStates[id];
        }

        if (state.db && images.length) {
          const tx = state.db.transaction("images", "readwrite");
          const store = tx.objectStore("images");
          images.forEach((image) => store.delete(image.id));
          await transactionDone(tx);
        }
        if (state.db && turns.length) {
          const tx = state.db.transaction("turns", "readwrite");
          const store = tx.objectStore("turns");
          turns.forEach((turn) => store.delete(turn.id));
          await transactionDone(tx);
        }

        saveSessions();
        renderSessions();
        renderGallery();
        renderSessionHistory();
        updateSaveDirStatus();
        toast("Session 已删除");
      }

      function renderSessionHistory() {
        const turns = currentSessionTurns().slice().sort((a, b) => a.createdAt - b.createdAt);
        const images = currentSessionImages().slice().sort((a, b) => a.createdAt - b.createdAt);
        const run = activeRun();
        const wasRunning = run.isRunning;
        const runningTurnId = run.currentTurnId;
        run.currentRunEl = null;
        if (!wasRunning) {
          run.currentImages = [];
          run.currentText = "";
          run.currentPrompt = "";
          run.currentAttachments = [];
          run.currentTurnId = "";
          run.seenImageIds = new Set();
        }
        els.outputArea.innerHTML = "";
        if (!turns.length && !images.length) {
          els.outputArea.innerHTML = '<div class="empty">当前 Session 还没有历史</div>';
          return;
        }
        const renderedTurnIds = new Set();
        turns.forEach((turn) => {
          renderedTurnIds.add(turn.id);
          const turnImages = images.filter((image) => image.turnId === turn.id);
          renderSavedTurn(turn, turnImages);
        });

        const orphanImages = images.filter((image) => !image.turnId || !renderedTurnIds.has(image.turnId));
        if (orphanImages.length) {
          const groups = new Map();
          orphanImages.forEach((image) => {
            const key = image.turnId || image.id;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(image);
          });
          for (const group of groups.values()) {
            renderOrphanImageGroup(group);
          }
        }
        if (wasRunning) {
          const liveTurn = turns.find((turn) => turn.id === runningTurnId)
            || turns.find((turn) => turn.backendJobId && !turn.backendResultHandled);
          if (liveTurn) {
            prepareRunForTurn(liveTurn);
            updateMessageStatus(run.lastStatus || liveTurn.status || "后端生成中", true, liveTurn.sessionId);
          }
        }
      }

      function renderSavedTurn(turn, images) {
        const run = getRunState(turn.sessionId);
        const live = (run.isRunning && run.currentTurnId === turn.id) || (turn.backendJobId && !turn.backendResultHandled);
        const statusText = turn.status || formatShortDateTime(turn.updatedAt || turn.createdAt);
        const user = document.createElement("div");
        user.className = "message user-msg";
        user.dataset.turnId = turn.id;
        const thumbs = attachmentThumbsHtml(turn.attachments);
        user.innerHTML = [
          '<div class="message-head"><span>user</span><span>model context: current prompt + selected images only</span></div>',
          '<div class="message-body">',
          `<div class="text-output">${escapeHtml(turn.userPrompt || "")}</div>`,
          thumbs ? `<div class="message-attachments">${thumbs}</div>` : "",
          '</div>',
        ].join("");
        bindAttachmentThumbClicks(user, turn.attachments || [], turn.createdAt);
        appendMessageActions(user, () => turn.userPrompt || "", () => turn.attachments || []);
        els.outputArea.append(user);

        const wrap = document.createElement("div");
        wrap.className = "message assistant-msg";
        wrap.dataset.turnId = turn.id;
        wrap.innerHTML = [
          '<div class="message-head">',
          '<span>assistant</span>',
          live
            ? [
              '<span class="assistant-meta">',
              '<span class="message-status" data-message-status>',
              '<span class="spinner"></span>',
              `<span data-status-label>${escapeHtml(statusText)}</span>`,
              '<span class="elapsed" data-elapsed></span>',
              '</span>',
              `<span data-image-count>${images.length ? `${images.length} image${images.length === 1 ? "" : "s"}` : ""}</span>`,
              '</span>',
            ].join("")
            : `<span>${escapeHtml(statusText)} · ${escapeHtml(formatShortDateTime(turn.updatedAt || turn.createdAt))}${images.length ? ` · ${images.length} image${images.length === 1 ? "" : "s"}` : ""}</span>`,
          '</div>',
          '<div class="message-body">',
          `<div class="text-output">${escapeHtml(turn.assistantText || "")}</div>`,
          '<div class="gallery"></div>',
          '</div>',
        ].join("");
        const grid = wrap.querySelector(".gallery");
        images.forEach((image) => grid.append(createImageCard(image)));
        appendMessageActions(wrap, () => turn.assistantText || "", () => imageAttachments(images));
        els.outputArea.append(wrap);
      }

      function renderOrphanImageGroup(group) {
        const first = group[0];
        const wrap = document.createElement("div");
        wrap.className = "message assistant-msg";
        wrap.innerHTML = [
          `<div class="message-head"><span>${escapeHtml(new Date(first.createdAt).toLocaleString())}</span><span>${group.length} image${group.length === 1 ? "" : "s"}</span></div>`,
          '<div class="message-body">',
          `<div class="text-output">${escapeHtml(first.prompt || "")}</div>`,
          '<div class="gallery"></div>',
          '</div>',
        ].join("");
        const grid = wrap.querySelector(".gallery");
        group.forEach((image) => grid.append(createImageCard(image)));
        appendMessageActions(wrap, () => first.prompt || "", () => imageAttachments(group));
        els.outputArea.append(wrap);
      }

      function attachmentThumbsHtml(attachments) {
        return (attachments || []).map((item, index) => (
          `<button class="message-attachment message-attachment-btn" type="button" data-attachment-index="${index}" title="点击放大"><img src="${escapeHtml(item.dataUrl || "")}" alt="${escapeHtml(item.name || "input image")}">${item.maskDataUrl ? '<span class="mask-badge">mask</span>' : ""}</button>`
        )).join("");
      }

      function bindAttachmentThumbClicks(container, attachments, createdAt) {
        container.querySelectorAll("[data-attachment-index]").forEach((button) => {
          button.addEventListener("click", () => {
            const index = Number(button.dataset.attachmentIndex);
            const item = attachments[index];
            if (!item || !item.dataUrl) return;
            openImageModal({
              id: item.id || uid("input"),
              name: `${index + 1}. ${item.name || "input-image"}`,
              dataUrl: item.dataUrl,
              mime: item.type || "image/png",
              prompt: `Input Image ${index + 1}`,
              createdAt: createdAt || Date.now(),
              sourceKind: "input",
            });
          });
        });
      }

      function appendMessageActions(messageEl, textGetter, attachmentsGetter) {
        const actions = document.createElement("div");
        actions.className = "message-actions";
        actions.append(
          messageActionButton("#i-copy", "复制文字", () => copyText(String(textGetter() || ""))),
          messageActionButton("#i-arrow-down", "复用到输入框", () => reuseMessageInput(textGetter(), attachmentsGetter())),
        );
        messageEl.append(actions);
      }

      function messageActionButton(icon, title, handler) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "message-action-btn";
        btn.title = title;
        btn.setAttribute("aria-label", title);
        btn.innerHTML = `<svg><use href="${icon}"></use></svg>`;
        btn.addEventListener("click", handler);
        return btn;
      }

      function reuseMessageInput(text, attachments) {
        const nextAttachments = snapshotAttachments(attachments || []);
        els.prompt.value = String(text || "");
        els.prompt.style.height = "auto";
        els.prompt.style.height = Math.min(els.prompt.scrollHeight, 160) + "px";
        state.attachments = nextAttachments;
        state.mode = nextAttachments.length ? "edit" : "generate";
        updateMode();
        renderAttachments();
        updateRequestPreview();
        els.prompt.focus({ preventScroll: true });
        els.prompt.scrollIntoView({ block: "nearest", behavior: "smooth" });
        toast("已复用到输入框");
      }

      function imageAttachments(images) {
        return (images || []).filter((image) => image && image.dataUrl).map((image, index) => ({
          id: uid("input"),
          name: image.name || `image-${index + 1}.png`,
          type: image.mime || "image/png",
          size: dataUrlByteLength(image.dataUrl),
          dataUrl: image.dataUrl,
        }));
      }

      function applyConnectionJson(text) {
        try {
          const data = JSON.parse(text);
          if (!data || typeof data !== "object") return false;
          if (data.url) els.apiUrl.value = normalizeBaseUrl(String(data.url));
          if (data.key) els.apiKey.value = String(data.key);
          saveSettings();
          updateRequestPreview();
          toast("连接 JSON 已填入");
          return Boolean(data.url || data.key);
        } catch {
          return false;
        }
      }

      function updateMode() {
        els.modeGenerate.classList.toggle("active", state.mode === "generate");
        els.modeEdit.classList.toggle("active", state.mode === "edit");
        if (state.mode === "edit" && !state.attachments.length) {
          els.dropzone.focus({ preventScroll: true });
        }
      }

      async function addFiles(files) {
        const imageFiles = Array.from(files || []).filter((file) => file && file.type.startsWith("image/"));
        if (!imageFiles.length) return;
        if (state.attachmentImport.active) {
          toast("参考图正在导入，请稍等", "error");
          return;
        }

        const importState = state.attachmentImport;
        importState.active = true;
        importState.totalFiles = imageFiles.length;
        importState.doneFiles = 0;
        importState.totalBytes = imageFiles.reduce((sum, file) => sum + (file.size || 0), 0);
        importState.loadedBytes = 0;
        importState.currentName = "";
        updateAttachmentImportUI();
        syncActiveRunControls();

        let completedBytes = 0;
        try {
          for (const file of imageFiles) {
            importState.currentName = file.name || "pasted-image";
            updateAttachmentImportUI();
            const dataUrl = await fileToDataUrl(file, (loaded, total) => {
              const knownTotal = total || file.size || 0;
              importState.loadedBytes = completedBytes + Math.min(loaded || 0, knownTotal || loaded || 0);
              updateAttachmentImportUI();
            });
            completedBytes += file.size || 0;
            importState.doneFiles += 1;
            importState.loadedBytes = completedBytes;
            state.attachments.push({
              id: uid("input"),
              name: file.name || "pasted-image",
              type: file.type || "image/png",
              size: file.size || 0,
              dataUrl,
            });
            updateAttachmentImportUI();
          }
        } catch (error) {
          toast(`参考图导入失败：${error.message || error}`, "error");
        } finally {
          importState.active = false;
          importState.currentName = "";
          importState.loadedBytes = importState.totalBytes;
          updateAttachmentImportUI();
          syncActiveRunControls();
        }
        state.mode = "edit";
        updateMode();
        renderAttachments();
        updateRequestPreview();
      }

      function updateAttachmentImportUI() {
        const item = state.attachmentImport;
        if (!els.attachmentImport) return;
        const percent = item.totalBytes
          ? Math.min(100, Math.round((item.loadedBytes / item.totalBytes) * 100))
          : (item.totalFiles ? Math.round((item.doneFiles / item.totalFiles) * 100) : 0);
        els.attachmentImport.classList.toggle("hidden", !item.active);
        els.attachmentImportLabel.textContent = item.currentName
          ? `正在导入 ${item.currentName}`
          : "正在导入参考图";
        els.attachmentImportMeta.textContent = `${item.doneFiles}/${item.totalFiles} · ${percent}%`;
        els.attachmentImportBar.style.width = `${percent}%`;
      }

      function renderAttachments() {
        els.attachments.innerHTML = "";
        els.removeImagesBtn.style.display = state.attachments.length ? "" : "none";
        els.removeImagesBtn.classList.toggle("hidden", !state.attachments.length);
        state.attachments.forEach((item, index) => {
          const wrap = document.createElement("div");
          wrap.className = "attachment";
          const img = document.createElement("img");
          img.src = item.dataUrl;
          img.alt = item.name;
          img.title = "点击放大";
          img.addEventListener("click", () => openImageModal({
            id: item.id,
            name: `${index + 1}. ${item.name || "input-image"}`,
            dataUrl: item.dataUrl,
            mime: item.type || "image/png",
            prompt: `Input Image ${index + 1}`,
            createdAt: Date.now(),
            sourceKind: "input",
          }));
          if (item.maskDataUrl) {
            const badge = document.createElement("span");
            badge.className = "mask-badge";
            badge.textContent = "mask";
            wrap.append(badge);
          }
          const btn = document.createElement("button");
          btn.type = "button";
          btn.title = "移除";
          btn.innerHTML = '<svg><use href="#i-x"></use></svg>';
          btn.addEventListener("click", () => {
            state.attachments = state.attachments.filter((x) => x.id !== item.id);
            renderAttachments();
            updateRequestPreview();
          });
          const tools = document.createElement("div");
          tools.className = "attachment-tools";
          const label = document.createElement("span");
          label.className = "attachment-label";
          label.textContent = `Image ${index + 1}`;
          tools.append(
            label,
            iconButton("#i-arrow-up", "上移", () => moveAttachment(item.id, -1)),
            iconButton("#i-arrow-down", "下移", () => moveAttachment(item.id, 1)),
            iconButton("#i-image", "绘制 mask", () => openMaskEditor(item.id)),
          );
          wrap.append(img, btn, tools);
          els.attachments.append(wrap);
        });
      }

      function moveAttachment(id, direction) {
        const index = state.attachments.findIndex((item) => item.id === id);
        const next = index + direction;
        if (index < 0 || next < 0 || next >= state.attachments.length) return;
        const [item] = state.attachments.splice(index, 1);
        state.attachments.splice(next, 0, item);
        renderAttachments();
        updateRequestPreview();
      }

      function bindMaskEvents() {
        els.closeMaskBtn.addEventListener("click", () => els.maskDialog.close());
        els.maskBrushSize.addEventListener("input", () => {
          els.maskBrushValue.textContent = els.maskBrushSize.value;
        });
        els.maskDrawBtn.addEventListener("click", () => setMaskMode("draw"));
        els.maskEraseBtn.addEventListener("click", () => setMaskMode("erase"));
        els.maskClearBtn.addEventListener("click", clearMaskCanvas);
        els.maskSaveBtn.addEventListener("click", saveMaskCanvas);
        els.maskCanvas.addEventListener("pointerdown", beginMaskStroke);
        els.maskCanvas.addEventListener("pointermove", continueMaskStroke);
        window.addEventListener("pointerup", () => {
          state.maskDrawing = false;
        });
      }

      function setMaskMode(mode) {
        state.maskMode = mode;
        els.maskDrawBtn.classList.toggle("active", mode === "draw");
        els.maskEraseBtn.classList.toggle("active", mode === "erase");
      }

      async function openMaskEditor(id) {
        const item = state.attachments.find((entry) => entry.id === id);
        if (!item) return;
        state.maskAttachmentId = id;
        els.maskImage.src = item.dataUrl;
        const img = await loadImage(item.dataUrl);
        els.maskCanvas.width = img.naturalWidth || img.width;
        els.maskCanvas.height = img.naturalHeight || img.height;
        clearMaskCanvas();
        if (item.maskDataUrl) await restoreMaskOverlay(item.maskDataUrl);
        setMaskMode("draw");
        els.maskDialog.showModal();
      }

      function beginMaskStroke(event) {
        state.maskDrawing = true;
        drawMaskStroke(event);
      }

      function continueMaskStroke(event) {
        if (!state.maskDrawing) return;
        drawMaskStroke(event);
      }

      function drawMaskStroke(event) {
        const canvas = els.maskCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.globalCompositeOperation = state.maskMode === "erase" ? "destination-out" : "source-over";
        ctx.fillStyle = "rgba(220, 45, 38, 0.52)";
        ctx.beginPath();
        ctx.arc(x, y, Number(els.maskBrushSize.value) * scaleX / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function clearMaskCanvas() {
        const ctx = els.maskCanvas.getContext("2d");
        ctx.clearRect(0, 0, els.maskCanvas.width, els.maskCanvas.height);
      }

      async function restoreMaskOverlay(maskDataUrl) {
        const mask = await loadImage(maskDataUrl);
        const canvas = document.createElement("canvas");
        canvas.width = els.maskCanvas.width;
        canvas.height = els.maskCanvas.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const out = els.maskCanvas.getContext("2d").createImageData(canvas.width, canvas.height);
        for (let i = 0; i < image.data.length; i += 4) {
          if (image.data[i + 3] < 128) {
            out.data[i] = 220;
            out.data[i + 1] = 45;
            out.data[i + 2] = 38;
            out.data[i + 3] = 132;
          }
        }
        els.maskCanvas.getContext("2d").putImageData(out, 0, 0);
      }

      function saveMaskCanvas() {
        const overlay = els.maskCanvas.getContext("2d").getImageData(0, 0, els.maskCanvas.width, els.maskCanvas.height);
        const out = document.createElement("canvas");
        out.width = els.maskCanvas.width;
        out.height = els.maskCanvas.height;
        const ctx = out.getContext("2d");
        const image = ctx.createImageData(out.width, out.height);
        for (let i = 0; i < image.data.length; i += 4) {
          image.data[i] = 255;
          image.data[i + 1] = 255;
          image.data[i + 2] = 255;
          image.data[i + 3] = overlay.data[i + 3] > 8 ? 0 : 255;
        }
        ctx.putImageData(image, 0, 0);
        const index = state.attachments.findIndex((entry) => entry.id === state.maskAttachmentId);
        const item = state.attachments[index];
        if (item) {
          state.attachments.forEach((entry) => {
            if (entry.id !== item.id) delete entry.maskDataUrl;
          });
          item.maskDataUrl = out.toDataURL("image/png");
          if (index > 0) {
            state.attachments.splice(index, 1);
            state.attachments.unshift(item);
          }
        }
        renderAttachments();
        updateRequestPreview();
        els.maskDialog.close();
        toast("Mask 已保存");
      }

      function buildRequestBody() {
        const prompt = buildEffectivePrompt();
        const content = [];
        const orderText = buildInputOrderText();
        if (orderText) content.push({ type: "input_text", text: orderText });
        if (prompt) content.push({ type: "input_text", text: prompt });
        state.attachments.forEach((item) => {
          content.push({ type: "input_image", image_url: item.dataUrl });
        });

        const tool = {
          type: "image_generation",
          output_format: els.outputFormat.value || "png",
          size: selectedImageSize(),
          quality: els.imageQuality.value || "auto",
          moderation: els.moderation.value || "auto",
        };

        if (els.imageAction.value && els.imageAction.value !== "auto") {
          tool.action = els.imageAction.value;
        }
        if (tool.output_format === "jpeg" || tool.output_format === "webp") {
          tool.output_compression = Number(els.outputCompression.value);
        }
        const maskAttachment = state.attachments.find((item) => item.maskDataUrl);
        if (maskAttachment) {
          tool.input_image_mask = { image_url: maskAttachment.maskDataUrl };
          if (els.imageAction.value === "auto") tool.action = "edit";
        }
        if (!els.transparentMode.checked) {
          tool.background = "auto";
        }

        const body = {
          model: els.model.value.trim() || "gpt-5.4",
          input: [
            {
              role: "user",
              content: content.length ? content : [{ type: "input_text", text: "" }],
            },
          ],
          tools: [
            tool,
          ],
          stream: els.streamMode.checked,
          store: els.storeResponse.checked,
        };

        const effort = els.reasoningEffort.value;
        if (effort && effort !== "none") {
          body.reasoning = { effort };
        }

        const system = buildInstructions();
        if (system) body.instructions = system;

        const maxTokens = Number(els.maxTokens.value);
        if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_output_tokens = maxTokens;

        const tier = els.serviceTier.value;
        if (tier) body.service_tier = tier;

        return body;
      }

      function buildInputOrderText() {
        if (!state.attachments.length) return "";
        const rows = state.attachments.map((item, index) => (
          `Image ${index + 1}: input image ${index + 1}${item.maskDataUrl ? " with mask" : ""}.`
        ));
        return `Input images are referenced by order:\n${rows.join("\n")}`;
      }

      function buildEffectivePrompt() {
        const prompt = els.prompt.value.trim();
        if (!els.transparentMode.checked) return prompt;
        const key = els.keyColor.value || "#00ff00";
        return [
          prompt,
          "",
          `Create the requested subject on a perfectly flat solid ${key} chroma-key background for background removal.`,
          "The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.",
          `Keep the subject fully separated from the background with crisp edges and generous padding. Do not use ${key} anywhere in the subject.`,
          "No cast shadow, no contact shadow, no reflection, no watermark, and no text unless explicitly requested.",
        ].filter(Boolean).join("\n");
      }

      function buildInstructions() {
        const base = els.systemPrompt.value.trim();
        if (!els.preservePrompt.checked) return base;
        const preserve = [
          "When using the image_generation tool, pass the user's image prompt through faithfully.",
          "Do not rewrite, enrich, summarize, translate, omit, or reinterpret the user's prompt before invoking the tool.",
          "If an image is requested, use the image_generation tool directly with the user's prompt content.",
        ].join(" ");
        return [base, preserve].filter(Boolean).join("\n\n");
      }

      function selectedImageSize() {
        const size = els.imageSize.value;
        if (size === "custom") {
          const normalized = normalizeImageSize(els.customSize.value.trim());
          return normalized.ok ? normalized.size : "auto";
        }
        return size || "auto";
      }

      function normalizeImageSize(raw) {
        const input = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
        const match = input.match(/^(\d{2,5})[x*×](\d{2,5})$/);
        if (!match) return { ok: false, message: "格式应为 WIDTHxHEIGHT" };

        let width = Number(match[1]);
        let height = Number(match[2]);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          return { ok: false, message: "尺寸无效" };
        }

        width = roundToMultiple(width, 16);
        height = roundToMultiple(height, 16);

        const maxEdge = Math.max(width, height);
        if (maxEdge > 3840) {
          const scale = 3840 / maxEdge;
          width = roundToMultiple(width * scale, 16);
          height = roundToMultiple(height * scale, 16);
        }

        let long = Math.max(width, height);
        let short = Math.min(width, height);
        if (long / short > 3) {
          if (width >= height) height = roundToMultiple(width / 3, 16);
          else width = roundToMultiple(height / 3, 16);
        }

        const minPixels = 655360;
        const maxPixels = 8294400;
        let pixels = width * height;
        if (pixels < minPixels) {
          const scale = Math.sqrt(minPixels / pixels);
          width = roundToMultiple(width * scale, 16);
          height = roundToMultiple(height * scale, 16);
        } else if (pixels > maxPixels) {
          const scale = Math.sqrt(maxPixels / pixels);
          width = roundToMultiple(width * scale, 16);
          height = roundToMultiple(height * scale, 16);
        }

        width = clamp(roundToMultiple(width, 16), 16, 3840);
        height = clamp(roundToMultiple(height, 16), 16, 3840);
        pixels = width * height;
        if (pixels < minPixels || pixels > maxPixels || Math.max(width, height) / Math.min(width, height) > 3) {
          return { ok: false, message: "无法规范到合法尺寸" };
        }

        return { ok: true, size: `${width}x${height}` };
      }

      function roundToMultiple(value, multiple) {
        return Math.max(multiple, Math.round(Number(value) / multiple) * multiple);
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function updateRequestPreview() {
        const body = buildRequestBody();
        const safe = JSON.parse(JSON.stringify(body));
        for (const item of safe.input[0].content) {
          if (item.type === "input_image" && item.image_url) {
            item.image_url = summarizeDataUrl(item.image_url);
          }
        }
        if (safe.tools && safe.tools[0] && safe.tools[0].input_image_mask) {
          safe.tools[0].input_image_mask.image_url = summarizeDataUrl(safe.tools[0].input_image_mask.image_url);
        }
        els.requestPreview.textContent = JSON.stringify(safe, null, 2);
      }

      async function sendRequest() {
        const key = els.apiKey.value.trim();
        const useBackend = els.backendMode.checked;
        if (!key && !useBackend) {
          toast("缺少 API Key", "error");
          els.apiKey.focus();
          return;
        }
        const rawUrl = els.apiUrl.value.trim();
        if (!useBackend && !rawUrl) {
          toast("缺少 API URL", "error");
          els.apiUrl.focus();
          return;
        }
        const sessionId = state.activeSessionId;
        const run = getRunState(sessionId);
        if (state.attachmentImport.active) {
          toast("参考图还在导入，完成后再发送", "error");
          return;
        }
        if (run.isRunning) {
          toast("该 Session 正在生成中", "error");
          return;
        }
        const endpoint = rawUrl ? normalizeEndpoint(rawUrl) : "";
        const promptText = els.prompt.value.trim();
        const body = buildRequestBody();
        run.controller = new AbortController();
        startFrontendTurn(promptText, state.attachments, sessionId);
        els.prompt.value = "";
        els.prompt.style.height = "";
        state.attachments = [];
        renderAttachments();
        setRunning(true, sessionId);
        touchActiveSession(promptText);
        setStatus("正在提交请求", sessionId);
        els.eventLog.textContent = "";
        els.rawResponse.textContent = "";
        els.runMeta.innerHTML = "";
        run.eventCount = 0;
        appendEvent(`POST ${endpoint || "server default endpoint"}`, sessionId);
        appendEvent(JSON.stringify(maskRequestForLog(body), null, 2), sessionId);

        try {
          const started = performance.now();
          if (useBackend) {
            await submitBackendJob({ endpoint, apiKey: key, body, sessionId, started });
            return;
          }
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${key}`,
              "Accept": body.stream ? "text/event-stream, application/json" : "application/json",
            },
            body: JSON.stringify(body),
            signal: run.controller.signal,
          });

          appendEvent(`HTTP ${response.status} ${response.statusText}`, sessionId);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          const contentType = response.headers.get("content-type") || "";
          if (body.stream && response.body && contentType.includes("text/event-stream")) {
            setStatus("请求已提交，正在接收事件流", sessionId);
            await readSse(response, sessionId);
          } else if (body.stream && response.body && !contentType.includes("application/json")) {
            setStatus("请求已提交，正在接收事件流", sessionId);
            await readSse(response, sessionId);
          } else {
            setStatus("请求已提交，模型正在生成，等待完整响应", sessionId);
            const json = await response.json();
            await handleFinalResponse(json, true, sessionId);
          }

          const seconds = ((performance.now() - started) / 1000).toFixed(1);
          setStatus(`完成，用时 ${seconds}s`, sessionId);
        } catch (error) {
          if (error.name === "AbortError") {
            run.backendJobId = "";
            updateActiveTurn(sessionId, {
              backendJobId: "",
              backendResultHandled: true,
              updatedAt: Date.now(),
            }, true);
            setStatus("已停止", sessionId);
            appendEvent("AbortError", sessionId);
          } else {
            run.backendJobId = "";
            const statusLabel = error.statusLabel || "请求失败";
            if (useBackend) {
              updateActiveTurn(sessionId, {
                backendJobId: "",
                backendResultHandled: true,
                status: statusLabel,
                updatedAt: Date.now(),
              }, true);
            }
            setStatus(statusLabel, sessionId);
            appendEvent(String(error.stack || error.message || error), sessionId);
            toast(cleanErrorMessage(error.message || error), "error");
          }
        } finally {
          setRunning(false, sessionId);
          run.controller = null;
        }
      }

      async function submitBackendJob({ endpoint, apiKey, body, sessionId, started }) {
        const run = getRunState(sessionId);
        appendEvent("POST /api/jobs?wait=1", sessionId);
        setStatus("后端任务运行中，等待模型返回", sessionId);
        const response = await fetch("./api/jobs?wait=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint, apiKey, request: body }),
          signal: run.controller.signal,
        });
        appendEvent(`JOB HTTP ${response.status} ${response.statusText}`, sessionId);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Job HTTP ${response.status}`);
        }
        const job = await response.json();
        if (!job || !job.id) throw new Error("后端任务没有返回任务 ID");
        run.backendJobId = job.id;
        updateActiveTurn(sessionId, {
          backendJobId: job.id,
          backendResultHandled: false,
          status: job.statusLabel || "后端任务已创建",
          updatedAt: Date.now(),
        }, true);
        const settled = await applyBackendJobUpdate(job, sessionId, started);
        if (!settled) await pollBackendJob(job.id, sessionId, started);
      }

      async function pollBackendJob(jobId, sessionId, started = performance.now()) {
        const run = getRunState(sessionId);
        while (run.isRunning && run.backendJobId === jobId) {
          const response = await fetch(`./api/jobs/${encodeURIComponent(jobId)}`, {
            signal: run.controller && run.controller.signal,
          });
          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Job HTTP ${response.status}`);
          }
          const job = await response.json();
          if (await applyBackendJobUpdate(job, sessionId, started)) return;
          await sleep(1500);
        }
      }

      async function applyBackendJobUpdate(job, sessionId, started) {
        const run = getRunState(sessionId);
        if (job.outputText) replaceText(job.outputText, sessionId);
        if (job.status === "completed") {
          if (job.response) {
            await handleFinalResponse(job.response, true, sessionId);
          }
          const seconds = ((performance.now() - started) / 1000).toFixed(1);
          updateActiveTurn(sessionId, {
            backendResultHandled: true,
            status: `完成，用时 ${seconds}s`,
            updatedAt: Date.now(),
          }, true);
          setStatus(`完成，用时 ${seconds}s`, sessionId);
          run.backendJobId = "";
          setRunning(false, sessionId);
          run.controller = null;
          return true;
        }
        if (job.status === "failed" || job.status === "canceled") {
          const statusLabel = job.status === "canceled" ? "已停止" : (job.statusLabel || "请求失败");
          const message = cleanErrorMessage(job.error || (job.status === "canceled" ? "任务已取消" : statusLabel));
          run.backendJobId = "";
          updateActiveTurn(sessionId, {
            backendJobId: "",
            backendResultHandled: true,
            status: statusLabel,
            updatedAt: Date.now(),
          }, true);
          setStatus(statusLabel, sessionId);
          const error = new Error(message);
          error.statusLabel = statusLabel;
          throw error;
        }
        setStatus(job.statusLabel || "后端生成中", sessionId);
        return false;
      }

      function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      function pollingStartFromTimestamp(startedAt) {
        const timestamp = Number(startedAt) || 0;
        if (!timestamp) return performance.now();
        return performance.now() - Math.max(0, Date.now() - timestamp);
      }

      function cleanErrorMessage(error) {
        return String(error || "")
          .replace(/^Error:\s*/, "")
          .split(/\r?\n/)[0]
          .trim() || "请求失败";
      }

      async function readSse(response, sessionId) {
        setStatus("正在接收事件流", sessionId);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() || "";
          for (const part of parts) {
            await handleSseBlock(part, sessionId);
          }
        }
        if (buffer.trim()) await handleSseBlock(buffer, sessionId);
      }

      async function handleSseBlock(block, sessionId) {
        let eventName = "";
        const dataLines = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) return;
        const dataText = dataLines.join("\n");
        if (dataText === "[DONE]") {
          appendEvent("event: done");
          return;
        }
        let data;
        try {
          data = JSON.parse(dataText);
        } catch {
          appendEvent(`${eventName || "event"} ${dataText.slice(0, 500)}`, sessionId);
          return;
        }
        const type = data.type || eventName || "event";
        appendEvent(`${type} ${summarizeEvent(data)}`, sessionId);

        if (type === "response.output_text.delta" && data.delta) {
          appendText(data.delta, sessionId);
        } else if (type === "response.output_text.done" && typeof data.text === "string" && data.text) {
          replaceText(data.text, sessionId);
        } else if (type === "response.content_part.done" && data.part && typeof data.part.text === "string") {
          if (data.part.text) replaceText(data.part.text, sessionId);
        } else if (type === "response.image_generation_call.partial_image" && data.partial_image_b64) {
          setStatus(`正在生成图片 ${data.size || ""}`.trim(), sessionId);
        } else if (type === "response.output_item.done" && data.item) {
          await handleOutputItem(data.item, true, sessionId);
        } else if (type === "response.completed" && data.response) {
          await handleFinalResponse(data.response, false, sessionId);
        } else if (type === "response.failed" || type === "response.incomplete") {
          if (data.response) els.rawResponse.textContent = safeStringify(data.response);
        }
      }

      async function handleFinalResponse(response, showRaw, sessionId) {
        if (showRaw) els.rawResponse.textContent = safeStringify(response);
        if (response && response.id) updateRunMeta(response);
        const parsed = extractResponse(response);
        if (parsed.text) replaceText(parsed.text, sessionId);
        for (const image of parsed.images) {
          await addGeneratedImage(image, sessionId);
        }
      }

      async function handleOutputItem(item, showImage, sessionId) {
        if (item.type === "message") {
          const text = extractTextFromMessage(item);
          if (text) appendText(text, sessionId);
          return;
        }
        if (item.type === "image_generation_call" && (item.result || item.result_url)) {
          await addGeneratedImage({
            b64: item.result,
            dataUrl: item.result_url || "",
            mime: mimeFromFormat(item.output_format),
            ext: item.output_format || "png",
            prompt: els.prompt.value.trim(),
            revisedPrompt: item.revised_prompt || "",
            size: item.size || "",
            quality: item.quality || "",
            background: item.background || "",
            model: els.model.value.trim(),
            source: item,
          }, sessionId);
          if (showImage) setStatus("图片已生成", sessionId);
        }
      }

      function extractResponse(response) {
        const result = { text: "", images: [] };
        if (!response || typeof response !== "object") return result;
        if (typeof response.output_text === "string") result.text += response.output_text;
        for (const item of response.output || []) {
          if (!item || typeof item !== "object") continue;
          if (item.type === "message") {
            const text = extractTextFromMessage(item);
            if (text) result.text += (result.text ? "\n" : "") + text;
          }
          if (item.type === "image_generation_call" && (item.result || item.result_url)) {
            result.images.push({
              b64: item.result,
              dataUrl: item.result_url || "",
              mime: mimeFromFormat(item.output_format),
              ext: item.output_format || "png",
              prompt: els.prompt.value.trim(),
              revisedPrompt: item.revised_prompt || "",
              size: item.size || "",
              quality: item.quality || "",
              background: item.background || "",
              model: response.model || els.model.value.trim(),
              source: item,
            });
          }
        }
        return result;
      }

      function extractTextFromMessage(item) {
        const chunks = [];
        for (const part of item.content || []) {
          if (!part || typeof part !== "object") continue;
          if (typeof part.text === "string") chunks.push(part.text);
          else if (typeof part.output_text === "string") chunks.push(part.output_text);
        }
        return chunks.join("");
      }

      function appendText(text, sessionId) {
        if (!text) return;
        const run = getRunState(sessionId);
        ensureMessage(sessionId);
        run.currentText += text;
        const target = run.currentRunEl && run.currentRunEl.querySelector(".text-output");
        if (target) target.textContent = run.currentText;
        updateActiveTurn(sessionId, { assistantText: run.currentText });
      }

      function replaceText(text, sessionId) {
        const run = getRunState(sessionId);
        if (!text && run.currentText) return;
        ensureMessage(sessionId);
        run.currentText = text || "";
        const target = run.currentRunEl && run.currentRunEl.querySelector(".text-output");
        if (target) target.textContent = run.currentText;
        updateActiveTurn(sessionId, { assistantText: run.currentText }, true);
      }

      function ensureMessage(sessionId) {
        const run = getRunState(sessionId);
        if (sessionId && sessionId !== state.activeSessionId) return false;
        if (run.currentRunEl && run.currentRunEl.isConnected) return true;
        if (run.currentTurnId) {
          appendLiveTurnDom(run.currentPrompt, run.currentAttachments, run.currentText, sessionId);
          return true;
        }
        startFrontendTurn(els.prompt.value.trim(), state.attachments, sessionId);
        return true;
      }

      function startFrontendTurn(prompt, attachments, sessionId) {
        const run = getRunState(sessionId);
        run.currentText = "";
        run.currentImages = [];
        run.currentRunEl = null;
        run.currentTurnId = uid("turn");
        run.currentPrompt = prompt || "";
        run.currentAttachments = snapshotAttachments(attachments);
        run.seenImageIds = new Set();
        upsertTurn({
          id: run.currentTurnId,
          sessionId: sessionId || state.activeSessionId,
          userPrompt: run.currentPrompt,
          attachments: run.currentAttachments,
          assistantText: "",
          status: "等待响应",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }, true);
        renderSessions();

        appendLiveTurnDom(run.currentPrompt, run.currentAttachments, run.currentText, sessionId);
      }

      function appendLiveTurnDom(prompt, attachments, assistantText, sessionId) {
        if (sessionId && sessionId !== state.activeSessionId) return;
        const run = getRunState(sessionId);
        if (els.outputArea.querySelector(".empty")) els.outputArea.innerHTML = "";

        const user = document.createElement("div");
        user.className = "message user-msg";
        user.dataset.turnId = run.currentTurnId;
        const thumbs = attachmentThumbsHtml(attachments);
        user.innerHTML = [
          '<div class="message-head"><span>user</span><span>model context: current prompt + selected images only</span></div>',
          '<div class="message-body">',
          `<div class="text-output">${escapeHtml(prompt || "")}</div>`,
          thumbs ? `<div class="message-attachments">${thumbs}</div>` : "",
          '</div>',
        ].join("");
        bindAttachmentThumbClicks(user, attachments || [], Date.now());
        appendMessageActions(user, () => prompt || "", () => attachments || []);
        els.outputArea.append(user);

        const wrap = document.createElement("div");
        wrap.className = "message assistant-msg";
        wrap.dataset.turnId = run.currentTurnId;
        wrap.innerHTML = [
          '<div class="message-head">',
          '<span>assistant</span>',
          '<span class="assistant-meta">',
          '<span class="message-status done" data-message-status>',
          '<span class="spinner"></span>',
          '<span data-status-label>等待响应</span>',
          '<span class="elapsed" data-elapsed>(0s)</span>',
          '</span>',
          '<span data-image-count></span>',
          '</span>',
          '</div>',
          '<div class="message-body">',
          `<div class="text-output">${escapeHtml(assistantText || "")}</div>`,
          '<div class="gallery" id="runImages"></div>',
          '</div>',
        ].join("");
        appendMessageActions(wrap, () => run.currentText || "", () => imageAttachments(run.currentImages));
        els.outputArea.append(wrap);
        run.currentRunEl = wrap;
        renderCurrentImages(sessionId);
        updateMessageStatus(run.lastStatus, run.isRunning, sessionId);
        wrap.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }

      function showPartialImage(data, sessionId) {
        const run = getRunState(sessionId);
        if (!ensureMessage(sessionId)) return;
        let img = run.currentRunEl.querySelector('[data-partial="true"] img');
        if (!img) {
          const grid = run.currentRunEl.querySelector(".gallery");
          const card = document.createElement("div");
          card.className = "image-card";
          card.dataset.partial = "true";
          card.innerHTML = [
            '<img class="image-thumb" alt="partial">',
            '<div class="image-info">',
            '<p class="image-title">generating...</p>',
            '<div class="meta"><span class="chip">partial</span></div>',
            '</div>',
          ].join("");
          grid.prepend(card);
          img = card.querySelector("img");
        }
        img.src = `data:${mimeFromFormat(data.output_format)};base64,${data.partial_image_b64}`;
        setStatus(`正在生成图片 ${data.size || ""}`.trim(), sessionId);
      }

      async function addGeneratedImage(image, sessionId) {
        const run = getRunState(sessionId);
        const sourceId = image.source && image.source.id;
        if (sourceId && run.seenImageIds.has(sourceId)) return;
        if (sourceId) run.seenImageIds.add(sourceId);
        if (!run.currentTurnId) startFrontendTurn(els.prompt.value.trim(), state.attachments, sessionId);

        let dataUrl = image.dataUrl || `data:${image.mime || "image/png"};base64,${image.b64}`;
        let mime = image.mime || "image/png";
        let ext = image.ext || "png";
        if (els.transparentMode.checked) {
          setStatus("正在本地抠图", sessionId);
          dataUrl = await removeChromaKey(dataUrl, {
            keyColor: els.keyColor.value || "#00ff00",
            tolerance: Number(els.chromaTolerance.value) || 36,
          });
          mime = "image/png";
          ext = "png";
        }
        const entry = {
          id: uid("img"),
          name: `image-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`,
          dataUrl,
          mime,
          prompt: image.prompt || run.currentPrompt || "",
          revisedPrompt: image.revisedPrompt || "",
          size: image.size || "",
          quality: image.quality || "",
          background: image.background || "",
          model: image.model || els.model.value.trim(),
          sessionId: sessionId || state.activeSessionId,
          turnId: run.currentTurnId || uid("turn"),
          favorite: false,
          favoriteAt: 0,
          transparent: els.transparentMode.checked,
          createdAt: Date.now(),
          source: compactSource(image.source),
        };
        run.currentImages.push(entry);
        state.gallery.unshift(entry);
        await saveImage(entry);
        renderCurrentImages(sessionId);
        renderGallery();
        renderFavoriteGallery();
        renderSessions();
        await saveImageToDirectory(entry, true);
        if (els.autoDownload.checked) downloadImage(entry);
      }

      function renderCurrentImages(sessionId) {
        const run = getRunState(sessionId);
        if (!ensureMessage(sessionId)) return;
        const partial = run.currentRunEl.querySelector('[data-partial="true"]');
        if (partial) partial.remove();
        const grid = run.currentRunEl.querySelector(".gallery");
        if (!grid) return;
        grid.innerHTML = "";
        run.currentImages.forEach((image) => grid.append(createImageCard(image)));
        const count = run.currentRunEl.querySelector("[data-image-count]");
        if (count) count.textContent = `${run.currentImages.length} image${run.currentImages.length === 1 ? "" : "s"}`;
      }

      function renderGallery() {
        els.gallery.innerHTML = "";
        const sessionImages = state.gallery.filter((image) => image.sessionId === state.activeSessionId);
        if (!sessionImages.length) {
          els.gallery.innerHTML = '<div class="empty">本地图库为空</div>';
        } else {
          sessionImages.forEach((image) => els.gallery.append(createImageCard(image)));
        }
        els.galleryMeta.innerHTML = `<span class="chip">${sessionImages.length} images</span>`;
      }

      function renderAllGallery() {
        els.allGallery.innerHTML = "";
        if (!state.gallery.length) {
          els.allGallery.innerHTML = '<div class="empty">还没有生成过图片</div>';
          return;
        }
        state.gallery.forEach((image) => els.allGallery.append(createImageCard(image)));
      }

      function renderFavoriteGallery() {
        els.favoriteGallery.innerHTML = "";
        const favorites = state.gallery
          .filter((image) => image.favorite)
          .sort((a, b) => (b.favoriteAt || b.createdAt || 0) - (a.favoriteAt || a.createdAt || 0));
        if (!favorites.length) {
          els.favoriteGallery.innerHTML = '<div class="empty">还没有收藏图片</div>';
          return;
        }
        favorites.forEach((image) => els.favoriteGallery.append(createImageCard(image)));
      }

      function createImageCard(image) {
        const card = document.createElement("article");
        card.className = "image-card";
        card.dataset.imageId = image.id;

        const img = document.createElement("img");
        img.className = "image-thumb";
        img.src = image.dataUrl;
        img.alt = image.revisedPrompt || image.prompt || image.name;
        img.addEventListener("click", () => openImageModal(image));

        const favoriteBtn = document.createElement("button");
        favoriteBtn.type = "button";
        favoriteBtn.className = "favorite-btn";
        favoriteBtn.dataset.favoriteFor = image.id;
        favoriteBtn.title = image.favorite ? "取消收藏" : "收藏";
        favoriteBtn.setAttribute("aria-label", favoriteBtn.title);
        favoriteBtn.setAttribute("aria-pressed", image.favorite ? "true" : "false");
        favoriteBtn.innerHTML = '<svg><use href="#i-star"></use></svg>';
        favoriteBtn.classList.toggle("active", Boolean(image.favorite));
        favoriteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleFavorite(image.id, card);
        });

        const info = document.createElement("div");
        info.className = "image-info";

        const title = document.createElement("p");
        title.className = "image-title";
        title.textContent = image.revisedPrompt || image.prompt || image.name;

        const meta = document.createElement("div");
        meta.className = "meta";
        [image.model, image.size, image.quality].filter(Boolean).forEach((value) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = value;
          meta.append(chip);
        });

        const actions = document.createElement("div");
        actions.className = "image-actions";
        actions.append(
          actionButton("#i-plus", "输入", "作为输入", () => useImageAsInput(image)),
          actionButton("#i-copy", "复制", "复制图片", () => copyImage(image)),
          actionButton("#i-download", "下载", "下载图片", () => downloadImage(image)),
          actionButton("#i-trash", "删除", "删除", () => deleteImage(image.id), "danger-text"),
        );

        info.append(title, meta, actions);
        card.append(img, favoriteBtn, info);
        return card;
      }

      function iconButton(icon, title, handler) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn icon";
        btn.title = title;
        btn.innerHTML = `<svg><use href="${icon}"></use></svg>`;
        btn.addEventListener("click", handler);
        return btn;
      }

      function actionButton(icon, label, title, handler, variant = "") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn action-btn ${variant}`.trim();
        btn.title = title;
        btn.innerHTML = `<svg><use href="${icon}"></use></svg><span>${escapeHtml(label)}</span>`;
        btn.addEventListener("click", handler);
        return btn;
      }

      async function toggleFavorite(id, card) {
        const image = state.gallery.find((entry) => entry.id === id);
        if (!image) return;
        image.favorite = !image.favorite;
        image.favoriteAt = image.favorite ? Date.now() : 0;

        Object.values(state.runStates).forEach((run) => {
          run.currentImages.forEach((entry) => {
            if (entry.id === id) {
              entry.favorite = image.favorite;
              entry.favoriteAt = image.favoriteAt;
            }
          });
        });

        updateFavoriteButtons(image);
        if (image.favorite) {
          animateFavorite(card || document.querySelector(`[data-image-id="${cssEscape(id)}"]`));
        }
        renderFavoriteGallery();
        await saveImage(image);
      }

      function updateFavoriteButtons(image) {
        document.querySelectorAll(`[data-favorite-for="${cssEscape(image.id)}"]`).forEach((button) => {
          button.classList.toggle("active", Boolean(image.favorite));
          button.title = image.favorite ? "取消收藏" : "收藏";
          button.setAttribute("aria-label", button.title);
          button.setAttribute("aria-pressed", image.favorite ? "true" : "false");
        });
      }

      function animateFavorite(card) {
        if (!card) return;
        const button = card.querySelector(".favorite-btn");
        if (button) {
          button.classList.remove("favorite-pop");
          void button.offsetWidth;
          button.classList.add("favorite-pop");
        }
        const bubble = document.createElement("div");
        bubble.className = "favorite-bubble";
        bubble.textContent = "收藏成功";
        card.append(bubble);
        setTimeout(() => bubble.remove(), 1200);
      }

      function cssEscape(value) {
        if (window.CSS && window.CSS.escape) return window.CSS.escape(String(value));
        return String(value).replace(/["\\]/g, "\\$&");
      }

      function openImageModal(image) {
        state.modalImage = image;
        els.modalImage.src = image.dataUrl;
        els.modalImage.alt = image.revisedPrompt || image.prompt || image.name;
        els.modalTitle.textContent = image.name || "Image";
        els.modalMeta.innerHTML = "";
        const values = image.sourceKind === "input"
          ? [image.mime, `${dataUrlByteLength(image.dataUrl).toLocaleString()} bytes`]
          : [
            image.model,
            image.size,
            image.quality,
            image.background,
            new Date(image.createdAt).toLocaleString(),
          ];
        values.filter(Boolean).forEach((value) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = value;
          els.modalMeta.append(chip);
        });
        els.modalPrompt.textContent = image.revisedPrompt || image.prompt || "";
        els.modalUseBtn.disabled = image.sourceKind === "input";
        els.imageDialog.showModal();
      }

      async function useImageAsInput(image) {
        state.attachments = [{
          id: uid("input"),
          name: image.name || "generated-image.png",
          type: image.mime || "image/png",
          size: dataUrlByteLength(image.dataUrl),
          dataUrl: image.dataUrl,
        }];
        state.mode = "edit";
        updateMode();
        renderAttachments();
        updateRequestPreview();
        els.prompt.focus({ preventScroll: true });
        toast("已作为下一次请求的唯一输入图片");
      }

      async function copyImage(image) {
        try {
          const blob = await dataUrlToBlob(image.dataUrl);
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type || image.mime || "image/png"]: blob }),
            ]);
            toast("图片已复制");
            return;
          }
          await copyText(image.dataUrl);
        } catch (error) {
          try {
            await copyText(image.dataUrl);
            toast("已复制 data URL");
          } catch {
            toast(String(error.message || error), "error");
          }
        }
      }

      function downloadImage(image) {
        const a = document.createElement("a");
        a.href = image.dataUrl;
        a.download = image.name || `image-${Date.now()}.png`;
        document.body.append(a);
        a.click();
        a.remove();
      }

      async function chooseSaveDirectory() {
        if (!window.showDirectoryPicker) {
          toast("当前浏览器不支持直接选择保存目录，可继续使用下载按钮", "error");
          return;
        }
        try {
          state.saveDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
          try {
            await saveKv("saveDirHandle", state.saveDirHandle);
          } catch {
            toast("目录已选择，但浏览器未允许持久保存授权记录", "error");
          }
          updateSaveDirStatus();
          toast("保存目录已选择，后续图片会自动写入");
        } catch (error) {
          if (error.name !== "AbortError") toast(String(error.message || error), "error");
        }
      }

      async function saveImageToDirectory(image, writeMetadata) {
        if (!state.saveDirHandle) return;
        try {
          const ok = await verifyDirectoryPermission(state.saveDirHandle, true);
          if (!ok) return;
          const dir = await getSessionDirectoryHandle(image.sessionId || state.activeSessionId, true);
          if (!dir) return;
          const blob = await dataUrlToBlob(image.dataUrl);
          const handle = await dir.getFileHandle(sanitizeFileName(image.name), { create: true });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          if (writeMetadata) {
            const images = state.gallery.filter((entry) => entry.sessionId === image.sessionId);
            await writeTextFileToDirectory(dir, "metadata.json", JSON.stringify(buildSessionMetadata(images), null, 2));
          }
          updateSaveDirStatus(`已写入 ${dir.name}/${image.name}`);
        } catch (error) {
          toast(`目录保存失败：${error.message || error}`, "error");
        }
      }

      async function saveCurrentSessionToDirectory() {
        if (!state.saveDirHandle) {
          await chooseSaveDirectory();
          if (!state.saveDirHandle) return;
        }
        const ok = await verifyDirectoryPermission(state.saveDirHandle, true);
        if (!ok) {
          toast("没有目录写入权限", "error");
          return;
        }
        const images = currentSessionImages();
        if (!images.length) {
          toast("当前 Session 没有图片", "error");
          return;
        }
        try {
          const dir = await getSessionDirectoryHandle(state.activeSessionId, true);
          if (!dir) return;
          for (const image of images) {
            await saveImageToDirectory(image);
          }
          await writeTextFileToDirectory(dir, "metadata.json", JSON.stringify(buildSessionMetadata(images), null, 2));
          updateSaveDirStatus(`已写入 ${dir.name}`);
          toast(`已写入 ${images.length} 张图片和 metadata.json`);
        } catch (error) {
          toast(`写入目录失败：${error.message || error}`, "error");
        }
      }

      async function writeTextFileToDirectory(dir, name, text) {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(new Blob([text], { type: "application/json" }));
        await writable.close();
      }

      async function verifyDirectoryPermission(handle, write) {
        if (!handle || !handle.queryPermission) return false;
        const options = write ? { mode: "readwrite" } : {};
        if ((await handle.queryPermission(options)) === "granted") return true;
        if (!handle.requestPermission) return false;
        return (await handle.requestPermission(options)) === "granted";
      }

      async function loadSavedDirectory() {
        const handle = await loadKv("saveDirHandle");
        if (!handle) {
          updateSaveDirStatus();
          return;
        }
        state.saveDirHandle = handle;
        updateSaveDirStatus();
        toast("已恢复保存目录授权记录");
      }

      async function getSessionDirectoryHandle(sessionId, create) {
        if (!state.saveDirHandle) return null;
        const session = state.sessions.find((entry) => entry.id === sessionId) || getActiveSession();
        const folderName = ensureSessionFolderName(session);
        return state.saveDirHandle.getDirectoryHandle(folderName, { create });
      }

      function updateSaveDirStatus(detail) {
        if (!els.saveDirStatus) return;
        const root = state.saveDirHandle && state.saveDirHandle.name ? state.saveDirHandle.name : "";
        const session = getActiveSession();
        const folder = session ? ensureSessionFolderName(session) : "";
        if (!root) {
          els.saveDirStatus.innerHTML = '<span class="chip">未选择保存目录</span>';
          return;
        }
        const label = detail || `保存到 ${root}/${folder}`;
        els.saveDirStatus.innerHTML = `<span class="chip">${escapeHtml(label)}</span>`;
      }

      async function exportCurrentSessionZip() {
        const images = currentSessionImages();
        if (!images.length) {
          toast("当前 Session 没有图片", "error");
          return;
        }
        const files = [];
        for (const image of images) {
          files.push({
            name: sanitizeFileName(image.name || `${image.id}.png`),
            bytes: new Uint8Array(await (await dataUrlToBlob(image.dataUrl)).arrayBuffer()),
          });
        }
        files.push({
          name: "metadata.json",
          bytes: new TextEncoder().encode(JSON.stringify(buildSessionMetadata(images), null, 2)),
        });
        const blob = new Blob([createZip(files)], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const session = getActiveSession();
        a.href = url;
        a.download = `${sanitizeFileName(session ? session.title : "session")}.zip`;
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      function currentSessionImages() {
        return state.gallery.filter((image) => image.sessionId === state.activeSessionId);
      }

      function currentSessionTurns() {
        return state.turns.filter((turn) => turn.sessionId === state.activeSessionId);
      }

      function snapshotAttachments(attachments) {
        return (attachments || []).map((item) => ({
          id: item.id || uid("input"),
          name: item.name || "input image",
          type: item.type || "image/png",
          size: item.size || 0,
          dataUrl: item.dataUrl || "",
          maskDataUrl: item.maskDataUrl || "",
        }));
      }

      function normalizeTurn(turn) {
        const createdAt = Number(turn && turn.createdAt) || Date.now();
        return {
          id: turn.id || uid("turn"),
          sessionId: turn.sessionId || state.activeSessionId,
          userPrompt: String(turn.userPrompt || ""),
          attachments: snapshotAttachments(turn.attachments || []),
          assistantText: String(turn.assistantText || ""),
          status: String(turn.status || ""),
          backendJobId: String(turn.backendJobId || ""),
          backendResultHandled: Boolean(turn.backendResultHandled),
          createdAt,
          updatedAt: Number(turn.updatedAt) || createdAt,
        };
      }

      function upsertTurn(turn, immediate = false) {
        const normalized = normalizeTurn(turn);
        const existingIndex = state.turns.findIndex((entry) => entry.id === normalized.id);
        if (existingIndex >= 0) {
          const existing = state.turns[existingIndex];
          state.turns[existingIndex] = normalizeTurn({
            ...existing,
            ...normalized,
            createdAt: existing.createdAt || normalized.createdAt,
          });
        } else {
          state.turns.push(normalized);
        }
        const stored = state.turns.find((entry) => entry.id === normalized.id);
        persistTurn(stored, immediate);
        return stored;
      }

      function updateActiveTurn(sessionId, patch, immediate = false) {
        const run = getRunState(sessionId);
        if (!run.currentTurnId) return;
        const existing = state.turns.find((turn) => turn.id === run.currentTurnId);
        upsertTurn({
          ...(existing || {}),
          id: run.currentTurnId,
          sessionId: sessionId || state.activeSessionId,
          userPrompt: run.currentPrompt || (existing && existing.userPrompt) || "",
          attachments: run.currentAttachments && run.currentAttachments.length
            ? run.currentAttachments
            : (existing && existing.attachments) || [],
          assistantText: run.currentText || (existing && existing.assistantText) || "",
          status: run.lastStatus || (existing && existing.status) || "",
          createdAt: existing ? existing.createdAt : Date.now(),
          updatedAt: Date.now(),
          ...patch,
        }, immediate);
      }

      function persistTurn(turn, immediate = false) {
        if (!turn || !state.db || !state.db.objectStoreNames.contains("turns")) return;
        const existingTimer = state.turnSaveTimers.get(turn.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          state.turnSaveTimers.delete(turn.id);
        }
        if (immediate) {
          saveTurn(turn).catch(() => {});
          return;
        }
        const timer = setTimeout(() => {
          state.turnSaveTimers.delete(turn.id);
          saveTurn(turn).catch(() => {});
        }, 250);
        state.turnSaveTimers.set(turn.id, timer);
      }

      function buildSessionMetadata(images) {
        const sessionId = images[0] && images[0].sessionId;
        const session = state.sessions.find((entry) => entry.id === sessionId) || getActiveSession();
        return {
          session: session ? { ...session, folderName: ensureSessionFolderName(session) } : null,
          exportedAt: new Date().toISOString(),
          turns: state.turns
            .filter((turn) => turn.sessionId === (session && session.id))
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((turn) => ({
              id: turn.id,
              userPrompt: turn.userPrompt,
              assistantText: turn.assistantText,
              status: turn.status,
              backendJobId: turn.backendJobId,
              backendResultHandled: turn.backendResultHandled,
              attachmentCount: (turn.attachments || []).length,
              createdAt: turn.createdAt,
              updatedAt: turn.updatedAt,
            })),
          images: images.map((image) => ({
            id: image.id,
            file: image.name,
            turnId: image.turnId,
            prompt: image.prompt,
            revisedPrompt: image.revisedPrompt,
            model: image.model,
            size: image.size,
            quality: image.quality,
            background: image.background,
            favorite: Boolean(image.favorite),
            favoriteAt: image.favoriteAt || 0,
            transparent: image.transparent,
            createdAt: image.createdAt,
          })),
        };
      }

      function createZip(files) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let offset = 0;
        for (const file of files) {
          const name = encoder.encode(file.name);
          const bytes = file.bytes;
          const crc = crc32(bytes);
          const local = concatBytes(
            u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), name, bytes,
          );
          localParts.push(local);
          centralParts.push(concatBytes(
            u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), u16(0),
            u16(0), u16(0), u32(0), u32(offset), name,
          ));
          offset += local.length;
        }
        const central = concatBytes(...centralParts);
        const end = concatBytes(
          u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
          u32(central.length), u32(offset), u16(0),
        );
        return concatBytes(...localParts, central, end);
      }

      function concatBytes(...parts) {
        const total = parts.reduce((sum, part) => sum + part.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const part of parts) {
          out.set(part, offset);
          offset += part.length;
        }
        return out;
      }

      function u16(value) {
        const out = new Uint8Array(2);
        new DataView(out.buffer).setUint16(0, value, true);
        return out;
      }

      function u32(value) {
        const out = new Uint8Array(4);
        new DataView(out.buffer).setUint32(0, value >>> 0, true);
        return out;
      }

      function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) {
          crc ^= byte;
          for (let i = 0; i < 8; i += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
          }
        }
        return (crc ^ 0xffffffff) >>> 0;
      }

      function sanitizeFileName(name) {
        return String(name || "image").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "image";
      }

      function ensureSessionFolderName(session) {
        if (!session) return "session";
        if (!session.folderName) session.folderName = buildSessionFolderName(session);
        return session.folderName;
      }

      function buildSessionFolderName(session) {
        const stamp = new Date(session.createdAt || Date.now()).toISOString().replace(/[-:]/g, "").slice(0, 15);
        const idTail = String(session.id || "").replace(/[^a-z0-9]/gi, "").slice(-8) || "session";
        const title = sanitizeFileName(session.title || "Session").slice(0, 48);
        return sanitizeFileName(`${stamp}-${title}-${idTail}`);
      }

      function formatShortDateTime(value) {
        const time = Number(value) || Date.now();
        return new Date(time).toLocaleString([], {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      async function copyText(text) {
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          toast("已复制");
          return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        toast("已复制");
      }

      function clearRun(sessionId) {
        const run = getRunState(sessionId);
        run.currentText = "";
        run.currentImages = [];
        run.seenImageIds = new Set();
        run.currentRunEl = null;
        run.currentTurnId = "";
        run.eventCount = 0;
        els.outputArea.innerHTML = '<div class="empty">发送消息开始生成图片</div>';
        els.eventLog.textContent = "";
        els.rawResponse.textContent = "";
        els.runMeta.innerHTML = "";
      }

      async function clearGallery() {
        if (!confirm("清空本地图库？")) return;
        state.gallery = [];
        renderGallery();
        renderFavoriteGallery();
        renderSessions();
        renderSessionHistory();
        if (state.db) {
          await txDone(state.db.transaction("images", "readwrite").objectStore("images").clear());
        }
        toast("图库已清空");
      }

      async function deleteImage(id) {
        state.gallery = state.gallery.filter((image) => image.id !== id);
        const run = activeRun();
        run.currentImages = run.currentImages.filter((image) => image.id !== id);
        renderGallery();
        renderFavoriteGallery();
        if (run.currentRunEl && run.currentRunEl.isConnected) renderCurrentImages();
        else renderSessionHistory();
        renderSessions();
        if (state.db) {
          await txDone(state.db.transaction("images", "readwrite").objectStore("images").delete(id));
        }
      }

      function syncActiveRunControls() {
        const run = activeRun();
        els.sendBtn.disabled = run.isRunning || state.attachmentImport.active;
        els.abortBtn.disabled = !run.isRunning;
        els.meter.classList.toggle("on", run.isRunning);
        els.statusText.textContent = run.lastStatus || "就绪";
      }

      function setRunning(running, sessionId, startedAt) {
        const run = getRunState(sessionId);
        run.isRunning = running;
        const isActive = !sessionId || sessionId === state.activeSessionId;
        if (isActive) {
          els.sendBtn.disabled = running || state.attachmentImport.active;
          els.abortBtn.disabled = !running;
          els.meter.classList.toggle("on", running);
        }
        if (running) {
          run.runStartedAt = performanceStartFromTimestamp(startedAt);
          if (run.runTimer) clearInterval(run.runTimer);
          run.runTimer = setInterval(() => updateElapsedStatus(sessionId), 500);
          updateMessageStatus(run.lastStatus || "正在生成", true, sessionId);
        } else {
          if (run.runTimer) {
            clearInterval(run.runTimer);
            run.runTimer = null;
          }
          updateMessageStatus(run.lastStatus || "完成", false, sessionId);
          updateActiveTurn(sessionId, { status: run.lastStatus || "完成", updatedAt: Date.now() }, true);
        }
        renderSessions();
      }

      function performanceStartFromTimestamp(startedAt) {
        const timestamp = Number(startedAt) || 0;
        if (!timestamp) return performance.now();
        return performance.now() - Math.max(0, Date.now() - timestamp);
      }

      function setStatus(text, sessionId) {
        const run = getRunState(sessionId);
        run.lastStatus = text;
        const isActive = !sessionId || sessionId === state.activeSessionId;
        if (isActive) els.statusText.textContent = text;
        updateMessageStatus(text, run.isRunning, sessionId);
        updateActiveTurn(sessionId, { status: text || "", updatedAt: Date.now() });
      }

      function updateElapsedStatus(sessionId) {
        const run = getRunState(sessionId);
        updateMessageStatus(run.lastStatus, run.isRunning, sessionId);
      }

      function updateMessageStatus(text, running, sessionId) {
        const run = getRunState(sessionId);
        if (!run.currentRunEl || !run.currentRunEl.isConnected) return;
        const status = run.currentRunEl.querySelector("[data-message-status]");
        if (!status) return;
        const label = status.querySelector("[data-status-label]");
        const elapsed = status.querySelector("[data-elapsed]");
        const seconds = run.runStartedAt ? Math.max(0, Math.floor((performance.now() - run.runStartedAt) / 1000)) : 0;
        status.classList.toggle("done", !running);
        if (label) label.textContent = text || (running ? "正在生成" : "完成");
        if (elapsed) elapsed.textContent = running ? `(${seconds}s)` : seconds ? `(${seconds}s)` : "";
      }

      function updateRunMeta(response) {
        els.runMeta.innerHTML = "";
        [response.id, response.model, response.status].filter(Boolean).forEach((value) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = value;
          els.runMeta.append(chip);
        });
      }

      function appendEvent(line, sessionId) {
        const run = getRunState(sessionId);
        run.eventCount += 1;
        const isActive = !sessionId || sessionId === state.activeSessionId;
        if (isActive) {
          const prefix = String(run.eventCount).padStart(3, "0");
          els.eventLog.textContent += `${prefix} ${line}\n`;
          els.eventLog.scrollTop = els.eventLog.scrollHeight;
        }
      }

      function summarizeEvent(data) {
        const copy = JSON.parse(JSON.stringify(data));
        scrubLargeStrings(copy);
        return JSON.stringify(copy);
      }

      function safeStringify(value) {
        const copy = JSON.parse(JSON.stringify(value));
        scrubLargeStrings(copy);
        return JSON.stringify(copy, null, 2);
      }

      function scrubLargeStrings(value) {
        if (!value || typeof value !== "object") return;
        for (const key of Object.keys(value)) {
          const item = value[key];
          if (typeof item === "string" && item.length > 240) {
            value[key] = `<string len=${item.length}>`;
          } else if (item && typeof item === "object") {
            scrubLargeStrings(item);
          }
        }
      }

      function maskRequestForLog(body) {
        const copy = JSON.parse(JSON.stringify(body));
        for (const item of copy.input[0].content) {
          if (item.type === "input_image") item.image_url = summarizeDataUrl(item.image_url);
        }
        if (copy.tools && copy.tools[0] && copy.tools[0].input_image_mask) {
          copy.tools[0].input_image_mask.image_url = summarizeDataUrl(copy.tools[0].input_image_mask.image_url);
        }
        return copy;
      }

      function summarizeDataUrl(dataUrl) {
        if (!dataUrl) return "";
        const comma = dataUrl.indexOf(",");
        const head = comma >= 0 ? dataUrl.slice(0, comma) : "data";
        return `${head},<base64 len=${Math.max(0, dataUrl.length - comma - 1)}>`;
      }

      function normalizeBaseUrl(url) {
        return String(url || "").trim().replace(/\/+$/, "").replace(/\/v1\/responses$/, "").replace(/\/v1$/, "");
      }

      function normalizeEndpoint(url) {
        const raw = String(url || "").trim().replace(/\/+$/, "");
        if (!raw) return "/v1/responses";
        if (/\/v1\/responses$/.test(raw)) return raw;
        if (/\/v1$/.test(raw)) return `${raw}/responses`;
        return `${raw}/v1/responses`;
      }

      function mimeFromFormat(format) {
        const clean = String(format || "png").replace(/^\./, "").toLowerCase();
        if (clean === "jpg") return "image/jpeg";
        if (clean === "svg") return "image/svg+xml";
        if (clean === "webp") return "image/webp";
        return `image/${clean || "png"}`;
      }

      function fileToDataUrl(file, onProgress) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.onprogress = (event) => {
            if (typeof onProgress === "function") onProgress(event.loaded, event.total);
          };
          reader.readAsDataURL(file);
        });
      }

      function dataUrlToBlob(dataUrl) {
        return fetch(dataUrl).then((res) => res.blob());
      }

      function dataUrlByteLength(dataUrl) {
        const comma = dataUrl.indexOf(",");
        if (comma < 0) return dataUrl.length;
        const b64 = dataUrl.slice(comma + 1);
        return Math.floor((b64.length * 3) / 4);
      }

      function uid(prefix) {
        if (globalThis.crypto && globalThis.crypto.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
        return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      }

      function compactSource(source) {
        if (!source || typeof source !== "object") return null;
        const copy = JSON.parse(JSON.stringify(source));
        if (copy.result) copy.result = `<string len=${copy.result.length}>`;
        if (copy.partial_image_b64) copy.partial_image_b64 = `<string len=${copy.partial_image_b64.length}>`;
        return copy;
      }

      async function removeChromaKey(dataUrl, options) {
        const img = await loadImage(dataUrl);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = image.data;
        const key = parseHexColor(options.keyColor || "#00ff00");
        const transparentThreshold = Math.max(0, Number(options.tolerance) || 36);
        const opaqueThreshold = 220;
        const spill = spillChannels(key);

        for (let i = 0; i < data.length; i += 4) {
          const rgb = [data[i], data[i + 1], data[i + 2]];
          const distance = Math.max(
            Math.abs(rgb[0] - key[0]),
            Math.abs(rgb[1] - key[1]),
            Math.abs(rgb[2] - key[2]),
          );
          let alpha = 255;
          if (distance <= transparentThreshold) {
            alpha = 0;
          } else if (distance < opaqueThreshold && looksKeyColored(rgb, key, distance)) {
            const t = smoothstep((distance - transparentThreshold) / (opaqueThreshold - transparentThreshold));
            alpha = Math.round(255 * t);
          }

          if (alpha < 255 && spill.length) {
            const nonSpill = [0, 1, 2].filter((idx) => !spill.includes(idx));
            const cap = Math.max(...nonSpill.map((idx) => data[i + idx])) - 1;
            spill.forEach((idx) => {
              data[i + idx] = Math.max(0, Math.min(data[i + idx], cap));
            });
          }

          data[i + 3] = Math.round(data[i + 3] * (alpha / 255));
          if (data[i + 3] <= 8) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 0;
          }
        }
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL("image/png");
      }

      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      }

      function parseHexColor(hex) {
        const clean = String(hex || "#00ff00").replace("#", "");
        return [
          parseInt(clean.slice(0, 2), 16),
          parseInt(clean.slice(2, 4), 16),
          parseInt(clean.slice(4, 6), 16),
        ];
      }

      function spillChannels(key) {
        const max = Math.max(...key);
        if (max < 128) return [];
        return key.map((value, idx) => ({ value, idx }))
          .filter((item) => item.value >= max - 16 && item.value >= 128)
          .map((item) => item.idx);
      }

      function looksKeyColored(rgb, key, distance) {
        if (distance <= 32) return true;
        const spill = spillChannels(key);
        if (!spill.length) return true;
        const nonSpill = [0, 1, 2].filter((idx) => !spill.includes(idx));
        const keyStrength = Math.min(...spill.map((idx) => rgb[idx]));
        const nonKeyStrength = Math.max(...nonSpill.map((idx) => rgb[idx]));
        return keyStrength - nonKeyStrength >= 16;
      }

      function smoothstep(value) {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function toast(message, type = "ok") {
        const item = document.createElement("div");
        item.className = `toast-item ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
        item.textContent = message;
        els.toast.append(item);
        setTimeout(() => {
          item.style.opacity = "0";
          item.style.transform = "translateY(6px)";
        }, 2800);
        setTimeout(() => item.remove(), 3400);
      }

      function openDb() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open("image-workbench", 3);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("images")) {
              const store = db.createObjectStore("images", { keyPath: "id" });
              store.createIndex("createdAt", "createdAt");
            }
            if (!db.objectStoreNames.contains("turns")) {
              const store = db.createObjectStore("turns", { keyPath: "id" });
              store.createIndex("sessionId", "sessionId");
              store.createIndex("createdAt", "createdAt");
            }
            if (!db.objectStoreNames.contains("kv")) {
              db.createObjectStore("kv", { keyPath: "key" });
            }
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            state.db = request.result;
            resolve(state.db);
          };
        });
      }

      async function saveKv(key, value) {
        if (!state.db || !state.db.objectStoreNames.contains("kv")) return;
        const tx = state.db.transaction("kv", "readwrite");
        tx.objectStore("kv").put({ key, value });
        await transactionDone(tx);
      }

      async function loadKv(key) {
        if (!state.db || !state.db.objectStoreNames.contains("kv")) return null;
        const tx = state.db.transaction("kv", "readonly");
        const row = await requestToPromise(tx.objectStore("kv").get(key));
        return row ? row.value : null;
      }

      async function loadTurns() {
        if (!state.db || !state.db.objectStoreNames.contains("turns")) return;
        const tx = state.db.transaction("turns", "readonly");
        const store = tx.objectStore("turns");
        const turns = await requestToPromise(store.getAll());
        state.turns = turns.map(normalizeTurn).sort((a, b) => b.createdAt - a.createdAt);
        markInterruptedTurns();
        renderSessions();
      }

      function markInterruptedTurns() {
        state.turns.forEach((turn) => {
          if (isTerminalTurnStatus(turn.status)) return;
          if (turn.backendJobId && !turn.backendResultHandled) return;
          turn.status = "已中断（页面刷新）";
          turn.updatedAt = Date.now();
          saveTurn(turn).catch(() => {});
        });
      }

      function isTerminalTurnStatus(status) {
        const text = String(status || "");
        if (!text) return true;
        return text.startsWith("完成") || text === "已停止" || text === "请求失败" || text === "响应为空" || text === "JSON 已导入" || text.startsWith("已中断");
      }

      async function loadGallery() {
        if (!state.db) return;
        const tx = state.db.transaction("images", "readonly");
        const store = tx.objectStore("images");
        const images = await requestToPromise(store.getAll());
        const fallbackSession = state.sessions[state.sessions.length - 1] || getActiveSession();
        state.gallery = images.map((image) => ({
          ...image,
          sessionId: image.sessionId || (fallbackSession && fallbackSession.id) || state.activeSessionId,
          favorite: Boolean(image.favorite),
          favoriteAt: image.favoriteAt || 0,
        })).sort((a, b) => b.createdAt - a.createdAt);
        renderSessions();
        renderGallery();
        renderFavoriteGallery();
        renderSessionHistory();
        resumeBackendJobs();
      }

      function resumeBackendJobs() {
        if (!els.backendMode.checked) return;
        const pendingBySession = new Map();
        state.turns
          .filter((entry) => entry.backendJobId && !entry.backendResultHandled)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .forEach((turn) => {
            if (!pendingBySession.has(turn.sessionId)) pendingBySession.set(turn.sessionId, turn);
          });
        for (const turn of pendingBySession.values()) {
          const run = getRunState(turn.sessionId);
          if (run.isRunning && run.backendJobId === turn.backendJobId) continue;
          prepareRunForTurn(turn);
          setRunning(true, turn.sessionId, turn.createdAt);
          setStatus("后端生成中", turn.sessionId);
          pollBackendJob(turn.backendJobId, turn.sessionId, pollingStartFromTimestamp(turn.createdAt)).catch((error) => {
            const failedRun = getRunState(turn.sessionId);
            failedRun.backendJobId = "";
            const statusLabel = error.statusLabel || "请求失败";
            updateActiveTurn(turn.sessionId, {
              backendJobId: "",
              backendResultHandled: true,
              status: statusLabel,
              updatedAt: Date.now(),
            }, true);
            setStatus(statusLabel, turn.sessionId);
            appendEvent(String(error.stack || error.message || error), turn.sessionId);
            toast(cleanErrorMessage(error.message || error), "error");
            setRunning(false, turn.sessionId);
          });
        }
        syncActiveRunControls();
        renderSessions();
      }

      function attachActivePendingJob() {
        if (!els.backendMode.checked) return;
        const run = activeRun();
        if (run.isRunning) return;
        const turn = state.turns
          .filter((entry) => entry.sessionId === state.activeSessionId && entry.backendJobId && !entry.backendResultHandled)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (!turn) return;
        prepareRunForTurn(turn);
        setRunning(true, turn.sessionId, turn.createdAt);
        setStatus("后端生成中", turn.sessionId);
        pollBackendJob(turn.backendJobId, turn.sessionId, pollingStartFromTimestamp(turn.createdAt)).catch((error) => {
          const failedRun = getRunState(turn.sessionId);
          failedRun.backendJobId = "";
          const statusLabel = error.statusLabel || "请求失败";
          updateActiveTurn(turn.sessionId, {
            backendJobId: "",
            backendResultHandled: true,
            status: statusLabel,
            updatedAt: Date.now(),
          }, true);
          setStatus(statusLabel, turn.sessionId);
          appendEvent(String(error.stack || error.message || error), turn.sessionId);
          toast(cleanErrorMessage(error.message || error), "error");
          setRunning(false, turn.sessionId);
        });
      }

      function prepareRunForTurn(turn) {
        const run = getRunState(turn.sessionId);
        run.currentTurnId = turn.id;
        run.currentPrompt = turn.userPrompt || "";
        run.currentAttachments = snapshotAttachments(turn.attachments || []);
        run.currentText = turn.assistantText || "";
        run.currentImages = state.gallery.filter((image) => image.turnId === turn.id);
        run.seenImageIds = new Set(run.currentImages.map((image) => image.source && image.source.id).filter(Boolean));
        run.backendJobId = turn.backendJobId || "";
        run.currentRunEl = els.outputArea.querySelector(`.assistant-msg[data-turn-id="${cssEscape(turn.id)}"]`);
      }

      async function saveTurn(turn) {
        if (!state.db || !state.db.objectStoreNames.contains("turns")) return;
        const tx = state.db.transaction("turns", "readwrite");
        tx.objectStore("turns").put(normalizeTurn(turn));
        await transactionDone(tx);
      }

      async function saveImage(image) {
        if (!state.db) return;
        const tx = state.db.transaction("images", "readwrite");
        tx.objectStore("images").put(image);
        await transactionDone(tx);
      }

      function requestToPromise(request) {
        return new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      function transactionDone(tx) {
        return new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      }

      function txDone(request) {
        return new Promise((resolve, reject) => {
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
        });
      }

      async function importJson() {
        try {
          const json = JSON.parse(els.jsonInput.value);
          clearRun();
          await handleFinalResponse(json, true, state.activeSessionId);
          els.jsonDialog.close();
          setStatus("JSON 已导入", state.activeSessionId);
        } catch (error) {
          toast(String(error.message || error), "error");
        }
      }
    })();
  

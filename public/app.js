const STORAGE_KEY = "clover-reading-state-v2";
const DAILY_GOAL_MINUTES = 30;
const SAVE_STREAK_MINUTES = 60;
const WORDS_PER_PAGE_ESTIMATE = 275;

let state = loadState();
let activeView = "bookshelf";
let editingId = null;
let suggestionTimer = null;
let latestSuggestionQuery = "";
let saveStatusTimer = null;
let remoteSaveTimer = null;
let remoteSyncReady = false;
let remoteSyncAvailable = false;

const els = {
  menuItems: document.querySelectorAll(".menu-item[data-view]"),
  panelToggles: document.querySelectorAll(".panel-toggle"),
  bookGrid: document.querySelector("#bookGrid"),
  statsPage: document.querySelector("#statsPage"),
  searchInput: document.querySelector("#searchInput"),
  streakTop: document.querySelector(".streak-hero"),
  streakTitle: document.querySelector("#streakTitle"),
  streakStatus: document.querySelector("#streakStatus"),
  quickReadButton: document.querySelector("#quickReadButton"),
  coverTimeline: document.querySelector("#coverTimeline"),
  logPanel: document.querySelector(".log-panel"),
  sessionBook: document.querySelector("#sessionBook"),
  sessionForm: document.querySelector("#sessionForm"),
  addBookButton: document.querySelector("#addBookButton"),
  bookDialog: document.querySelector("#bookDialog"),
  bookForm: document.querySelector("#bookForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialog: document.querySelector("#closeDialog"),
  deleteBookButton: document.querySelector("#deleteBookButton"),
  csvInput: document.querySelector("#csvInput"),
  exportButton: document.querySelector("#exportButton"),
  saveStatus: document.querySelector("#saveStatus"),
  bookTitle: document.querySelector("#bookTitle"),
  bookAuthor: document.querySelector("#bookAuthor"),
  bookShelf: document.querySelector("#bookShelf"),
  bookIsbn: document.querySelector("#bookIsbn"),
  bookTotalPages: document.querySelector("#bookTotalPages"),
  bookTags: document.querySelector("#bookTags"),
  bookRating: document.querySelector("#bookRating"),
  ratingValue: document.querySelector("#ratingValue"),
  ratingStarsFill: document.querySelector("#ratingStarsFill"),
  starSlider: document.querySelector("#starSlider"),
  bookCoverId: document.querySelector("#bookCoverId"),
  bookLinks: document.querySelector("#bookLinks"),
  bookSuggestions: document.querySelector("#bookSuggestions")
};

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { books: [], sessions: [], quickReadDates: [] };
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      books: (parsed.books || []).map((book) => ({
        pagesRead: 0,
        rating: 0,
        ...book,
        tags: englishTags(book.tags || []),
        notes: undefined
      })),
      sessions: parsed.sessions || [],
      quickReadDates: parsed.quickReadDates || []
    };
  } catch {
    return { books: [], sessions: [], quickReadDates: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  showSaveStatus();
  scheduleRemoteSave();
}

function showSaveStatus(message) {
  if (!els.saveStatus) return;
  window.clearTimeout(saveStatusTimer);
  els.saveStatus.textContent = message || `${remoteSyncAvailable ? "Synced" : "Saved locally"} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  els.saveStatus.classList.add("fresh");
  saveStatusTimer = window.setTimeout(() => els.saveStatus.classList.remove("fresh"), 1200);
}

async function loadRemoteState() {
  try {
    const response = await fetch("/api/state", { credentials: "same-origin" });
    if (response.status === 401) {
      remoteSyncReady = true;
      showSaveStatus("Saved on this device");
      return;
    }
    if (!response.ok) throw new Error("State sync failed.");
    const payload = await response.json();
    if (payload.state && Array.isArray(payload.state.books) && Array.isArray(payload.state.sessions)) {
      const localHasData = state.books.length || state.sessions.length || state.quickReadDates.length;
      const remoteHasData = payload.state.books.length || payload.state.sessions.length || payload.state.quickReadDates?.length;
      if (remoteHasData || !localHasData) {
        state = {
          books: (payload.state.books || []).map((book) => ({
            pagesRead: 0,
            rating: 0,
            ...book,
            tags: englishTags(book.tags || []),
            notes: undefined
          })),
          sessions: payload.state.sessions || [],
          quickReadDates: payload.state.quickReadDates || []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        await pushRemoteState();
      }
    }
    remoteSyncAvailable = true;
    remoteSyncReady = true;
    showSaveStatus("Synced to your account");
    render();
  } catch {
    remoteSyncReady = true;
    remoteSyncAvailable = false;
    showSaveStatus("Offline save only");
  }
}

function scheduleRemoteSave() {
  if (!remoteSyncReady || !remoteSyncAvailable) return;
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(pushRemoteState, 450);
}

async function pushRemoteState() {
  if (!remoteSyncReady) return;
  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    });
    remoteSyncAvailable = response.ok;
    if (response.ok) showSaveStatus();
  } catch {
    remoteSyncAvailable = false;
    showSaveStatus("Offline save only");
  }
}

function todayKey(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeShelf(value = "") {
  const shelf = value.toLowerCase().trim();
  if (shelf.includes("currently") || shelf === "reading") return "currently-reading";
  if (shelf === "read" || shelf.includes("read") && !shelf.includes("to-read")) return "read";
  return "want-to-read";
}

function shelfLabel(shelf) {
  return {
    "currently-reading": "Currently reading",
    "want-to-read": "To be read",
    read: "Read"
  }[shelf] || "To be read";
}

function coverUrl(book) {
  if (book.coverId) return `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`;
  const cleanIsbn = (book.isbn || "").replace(/[^0-9X]/gi, "");
  if (cleanIsbn) return `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`;
  const seed = encodeURIComponent(`${book.title} ${book.author}`);
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundColor=6f8c7a,d6a83f,c76a52,50748f`;
}

function annaArchiveUrl(book) {
  return `https://annas-archive.gl/search?q=${encodeURIComponent(book.isbn || `${book.title} ${book.author}`)}`;
}

function lidkopingLibraryUrl(book) {
  const query = `title:"${book.title}"`;
  return `https://dlgbibliotek.vskaraborg.se/web/pub/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&_searchResult_WAR_arenaportlet_agency_name=ASE100255&p_r_p_arena_urn%3Aarena_search_item_no=0&p_r_p_arena_urn%3Aarena_search_query=${encodeURIComponent(query)}&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&_searchResult_WAR_arenaportlet_arena_member_id=500781032`;
}

function dailyMinutes(dateKey) {
  return state.sessions
    .filter((session) => session.date === dateKey)
    .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
}

function isQualifiedDay(dateKey) {
  return dailyMinutes(dateKey) >= DAILY_GOAL_MINUTES;
}

function canSaveYesterday() {
  return !isQualifiedDay(todayKey(-1)) && isQualifiedDay(todayKey(-2)) && dailyMinutes(todayKey()) >= SAVE_STREAK_MINUTES;
}

function quickAlreadyPressed() {
  return (state.quickReadDates || []).includes(todayKey());
}

function saveWindowOpen() {
  return !isQualifiedDay(todayKey()) && !isQualifiedDay(todayKey(-1)) && isQualifiedDay(todayKey(-2));
}

function calculateStreak() {
  const savedYesterday = canSaveYesterday();
  const qualifies = (offset) => {
    if (offset === -1 && savedYesterday) return true;
    return isQualifiedDay(todayKey(offset));
  };

  let startOffset = 0;
  if (!qualifies(0)) {
    if (qualifies(-1)) startOffset = -1;
    else return { count: 0, savedYesterday: false };
  }

  let count = 0;
  for (let offset = startOffset; qualifies(offset); offset -= 1) {
    count += 1;
  }
  return { count, savedYesterday };
}

function requiredQuickMinutes() {
  return saveWindowOpen() ? SAVE_STREAK_MINUTES : DAILY_GOAL_MINUTES;
}

function sessionsPagesFor(bookId) {
  return state.sessions
    .filter((session) => session.bookId === bookId)
    .reduce((sum, session) => sum + Number(session.pages || 0), 0);
}

function progressFor(book) {
  if (book.shelf === "read") return 100;
  if (!book.totalPages) return 0;
  const pages = Number(book.pagesRead || 0) + sessionsPagesFor(book.id);
  return Math.min(100, Math.round((pages / Number(book.totalPages)) * 100));
}

function buyLinks(book) {
  return [
    ["Lidköping library", lidkopingLibraryUrl(book)],
    ["Download book", annaArchiveUrl(book)]
  ];
}

function englishTags(tags = []) {
  const rules = [
    ["fantasy", /\bfantasy|dragon|magic|witch|wizard|faerie|fairy|myth/i],
    ["romance", /\bromance|love stories|dating|marriage/i],
    ["mystery", /\bmystery|detective|whodunit/i],
    ["thriller", /\bthriller|suspense|spy|espionage/i],
    ["horror", /\bhorror|ghost|vampire|zombie|supernatural/i],
    ["science fiction", /\bscience fiction|sci[- ]?fi|space|alien|mars|dystopia|time travel/i],
    ["historical fiction", /\bhistorical fiction|history|war stories|victorian|regency/i],
    ["young adult", /\byoung adult|juvenile|teen|coming of age/i],
    ["classic", /\bclassic|literature|literary collections/i],
    ["literary fiction", /\bliterary|contemporary fiction|domestic fiction/i],
    ["adventure", /\badventure|quest|survival|voyage/i],
    ["crime", /\bcrime|criminal|murder|police/i],
    ["nonfiction", /\bnonfiction|non-fiction|study|education/i],
    ["memoir", /\bmemoir|autobiography|personal narratives/i],
    ["biography", /\bbiography|biographies/i],
    ["essays", /\bessay|essays/i],
    ["poetry", /\bpoetry|poems/i],
    ["nature", /\bnature|environment|ecology|plants|animals/i],
    ["short stories", /\bshort stories|short story/i],
    ["series", /\bseries|trilogy|saga/i],
    ["fiction", /\bfiction|novel|novels/i]
  ];
  const result = [];
  tags.map((tag) => String(tag).trim()).filter(Boolean).forEach((tag) => {
    const match = rules.find(([, pattern]) => pattern.test(tag));
    if (match && !result.includes(match[0])) result.push(match[0]);
  });
  return result.slice(0, 6);
}

function collectionKey(book) {
  const seriesTag = (book.tags || []).find((tag) => /series|trilogy|saga/i.test(tag));
  const titleRoot = book.title
    .toLowerCase()
    .replace(/\b(book|volume|vol)\s+\d+\b/g, "")
    .replace(/\s+#?\d+\s*$/g, "")
    .replace(/:.*$/, "")
    .replace(/\b(the|a|an)\b/g, "")
    .trim();
  return `${seriesTag || titleRoot}|${book.author.toLowerCase()}`;
}

function sortLikeBookshelf(books) {
  return [...books].sort((a, b) =>
    collectionKey(a).localeCompare(collectionKey(b)) ||
    a.author.localeCompare(b.author) ||
    a.title.localeCompare(b.title)
  );
}

function matchesSearch(book) {
  const query = els.searchInput.value.trim().toLowerCase();
  const haystack = [book.title, book.author, book.isbn, ...(book.tags || [])].join(" ").toLowerCase();
  return !query || haystack.includes(query);
}

function booksForView() {
  const books = state.books.filter(matchesSearch);
  if (activeView === "stats") return [];
  if (activeView === "bookshelf") return books.filter((book) => book.shelf !== "read");
  return books.filter((book) => book.shelf === activeView);
}

function renderBooks() {
  document.body.classList.toggle("stats-view", activeView === "stats");
  if (activeView === "stats") {
    els.bookGrid.hidden = true;
    els.statsPage.hidden = false;
    renderStatsPage();
    return;
  }

  els.bookGrid.hidden = false;
  els.statsPage.hidden = true;
  const books = booksForView();
  els.bookGrid.innerHTML = "";

  if (!books.length) {
    els.bookGrid.innerHTML = `<div class="empty-state">No books here yet. Add one or import your Goodreads CSV.</div>`;
    return;
  }

  if (activeView === "bookshelf") {
    renderShelfSection(sortLikeBookshelf(books.filter((book) => book.shelf === "currently-reading")));
    renderShelfSection(sortLikeBookshelf(books.filter((book) => book.shelf === "want-to-read")));
    return;
  }

  renderShelfSection(sortLikeBookshelf(books));
}

function renderShelfSection(books) {
  const section = document.createElement("section");
  section.className = "shelf-section";
  section.innerHTML = `<div class="shelf-row"></div>`;
  const row = section.querySelector(".shelf-row");

  if (!books.length) {
    row.innerHTML = `<div class="empty-state">Nothing on this shelf yet.</div>`;
  } else {
    books.forEach((book) => row.appendChild(bookCard(book)));
  }

  els.bookGrid.appendChild(section);
}

function bookCard(book) {
  const card = document.createElement("article");
  card.className = "book-card";
  card.style.setProperty("--spine", spineColor(book));
  card.style.setProperty("--spine-text", spineTextColor(book));
  card.style.setProperty("--cover-image", `url("${coverUrl(book)}")`);
  card.style.setProperty("--book-width", `${32 + (book.title.length % 5) * 5}px`);
  card.style.setProperty("--book-height", `${158 + Math.min(70, Number(book.totalPages || 250) / 7)}px`);
  card.innerHTML = `
    <button class="cover-button" data-edit="${book.id}" type="button" aria-label="${escapeHtml(book.title)} by ${escapeHtml(book.author)}">
    </button>
  `;
  return card;
}

function spineColor(book) {
  const colors = ["#b33f32", "#1d5f99", "#d79b2e", "#2f5f46", "#2f2f35", "#704b8f", "#c65f44", "#485f73", "#f0d36a", "#8d2f42"];
  const code = [...`${book.title}${book.author}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[code % colors.length];
}

function spineTextColor(book) {
  return ["#f0d36a", "#d79b2e"].includes(spineColor(book)) ? "#20211f" : "#fffdf8";
}

function renderStats() {
  const todayMinutes = dailyMinutes(todayKey());
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weekMinutes = state.sessions
    .filter((session) => new Date(`${session.date}T00:00:00`) >= weekStart)
    .reduce((sum, session) => sum + Number(session.minutes || 0), 0);

  return {
    todayMinutes,
    weekMinutes,
    wantCount: state.books.filter((book) => book.shelf === "want-to-read").length,
    currentCount: state.books.filter((book) => book.shelf === "currently-reading").length,
    readCount: state.books.filter((book) => book.shelf === "read").length,
    readingDays: last28QualifiedDays(),
    wpm: calculateWpm(),
    ratedAverage: averageRating()
  };
}

function renderStatsPage() {
  const stats = renderStats();
  const { count } = calculateStreak();
  const totalMinutes = state.sessions.reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  const totalPages = state.sessions.reduce((sum, session) => sum + Number(session.pages || 0), 0);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const offset = 6 - index;
    const key = todayKey(-offset);
    return { key, minutes: dailyMinutes(key), book: topBookForDay(key) };
  });
  const maxMinutes = Math.max(DAILY_GOAL_MINUTES, ...weekDays.map((day) => day.minutes));

  els.statsPage.innerHTML = `
    <div class="stats-hero">
      <div>
        <p class="eyebrow">Reading stats</p>
        <h3>${count} ${count === 1 ? "day" : "days"} alive</h3>
        <p>${stats.todayMinutes >= DAILY_GOAL_MINUTES ? "Today's goal is done." : `${Math.max(0, DAILY_GOAL_MINUTES - stats.todayMinutes)} minutes left today.`}</p>
      </div>
      <div class="stats-ring" style="--progress: ${Math.min(100, Math.round((stats.todayMinutes / DAILY_GOAL_MINUTES) * 100))}%">
        <strong>${stats.todayMinutes}m</strong>
        <span>today</span>
      </div>
    </div>
    <div class="stats-grid">
      ${statCard("This week", `${stats.weekMinutes}m`, "minutes read")}
      ${statCard("Total pages", totalPages, "pages logged")}
      ${statCard("Reading days", stats.readingDays, "last 28 days")}
      ${statCard("Words / min", stats.wpm, stats.wpm === "--" ? "more data needed" : "estimated pace")}
      ${statCard("Average rating", stats.ratedAverage, "rated books")}
      ${statCard("Archive", stats.readCount, "finished books")}
    </div>
    <section class="stats-section">
      <div class="section-title">
        <p class="eyebrow">Last 7 days</p>
        <h3>Reading rhythm</h3>
      </div>
      <div class="stats-bars">
        ${weekDays.map((day) => `
          <div class="stats-day" title="${day.key}: ${day.minutes} minutes${day.book ? `, ${escapeHtml(day.book.title)}` : ""}">
            <div class="stats-bar-track">
              <span style="height: ${Math.max(8, Math.round((day.minutes / maxMinutes) * 100))}%"></span>
            </div>
            <strong>${day.minutes}</strong>
            <small>${shortDay(day.key)}</small>
          </div>
        `).join("")}
      </div>
    </section>
    <section class="stats-section shelf-stats">
      <div class="section-title">
        <p class="eyebrow">Library</p>
        <h3>Shelf balance</h3>
      </div>
      <div class="shelf-meter">
        ${shelfMeterSegment("Reading", stats.currentCount, state.books.length, "#7acb86")}
        ${shelfMeterSegment("TBR", stats.wantCount, state.books.length, "#d6bc6a")}
        ${shelfMeterSegment("Read", stats.readCount, state.books.length, "#6f9db5")}
      </div>
    </section>
  `;
}

function statCard(label, value, hint) {
  return `
    <article class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `;
}

function shelfMeterSegment(label, value, total, color) {
  const width = total ? Math.max(8, Math.round((value / total) * 100)) : 0;
  return `
    <div>
      <span>${label}</span>
      <strong>${value}</strong>
      <i style="--meter-color: ${color}; width: ${width}%"></i>
    </div>
  `;
}

function averageRating() {
  const rated = state.books.map((book) => Number(book.rating || 0)).filter(Boolean);
  if (!rated.length) return "--";
  return (rated.reduce((sum, rating) => sum + rating, 0) / rated.length).toFixed(2);
}

function shortDay(key) {
  return new Date(`${key}T00:00:00`).toLocaleDateString("en", { weekday: "short" });
}

function last28QualifiedDays() {
  let count = 0;
  for (let index = 0; index < 28; index += 1) {
    if (isQualifiedDay(todayKey(-index))) count += 1;
  }
  return count;
}

function calculateWpm() {
  const useful = state.sessions.filter((session) => Number(session.pages || 0) > 0 && Number(session.minutes || 0) > 0);
  const pages = useful.reduce((sum, session) => sum + Number(session.pages || 0), 0);
  const minutes = useful.reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  if (pages < 10 || minutes < 30) return "--";
  return Math.round((pages * WORDS_PER_PAGE_ESTIMATE) / minutes);
}

function renderStreaks() {
  const { count, savedYesterday } = calculateStreak();
  const todayMinutes = dailyMinutes(todayKey());
  const needed = Math.max(0, DAILY_GOAL_MINUTES - todayMinutes);
  els.streakTitle.textContent = `${count} ${count === 1 ? "day" : "days"}`;

  if (savedYesterday) {
    els.streakStatus.textContent = "Saved. Yesterday stays in the streak.";
  } else if (todayMinutes >= DAILY_GOAL_MINUTES) {
    els.streakStatus.textContent = "Good job. Today's streak is safe.";
  } else if (saveWindowOpen()) {
    els.streakStatus.textContent = `Read ${SAVE_STREAK_MINUTES} minutes today to save yesterday.`;
  } else if (count > 0) {
    els.streakStatus.textContent = `${needed} minutes left today.`;
  } else {
    els.streakStatus.textContent = "Read 30 minutes today to start again. GG's if it has been more than a day.";
  }

  const quickDone = quickAlreadyPressed() || todayMinutes >= requiredQuickMinutes();
  els.quickReadButton.disabled = quickDone;
  els.quickReadButton.textContent = quickDone ? praiseMessage() : saveWindowOpen() ? "Save my streak" : "I've read today!";
  renderCoverTimeline();
}

function renderCoverTimeline() {
  els.coverTimeline.innerHTML = "";
  for (let index = 27; index >= 0; index -= 1) {
    const key = todayKey(-index);
    const book = topBookForDay(key);
    const day = document.createElement("div");
    day.className = `timeline-day${book ? " has-book" : ""}${key === todayKey() ? " today" : ""}`;
    day.title = book ? `${key}: ${book.title}` : `${key}: no reading`;
    day.innerHTML = book
      ? `<img src="${coverUrl(book)}" alt="${escapeHtml(book.title)}" loading="lazy" />`
      : `<span></span>`;
    els.coverTimeline.appendChild(day);
  }
}

function topBookForDay(dateKey) {
  const totals = new Map();
  state.sessions
    .filter((session) => session.date === dateKey && session.bookId)
    .forEach((session) => totals.set(session.bookId, (totals.get(session.bookId) || 0) + Number(session.minutes || 0)));
  const [bookId] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return state.books.find((book) => book.id === bookId);
}

function renderSessionOptions() {
  const readingBooks = state.books.filter((book) => book.shelf === "currently-reading");
  const options = readingBooks.length ? readingBooks : state.books.filter((book) => book.shelf !== "read");
  els.sessionBook.innerHTML = options.length
    ? options.map((book) => `<option value="${book.id}">${escapeHtml(book.title)}</option>`).join("")
    : `<option value="">No active books yet</option>`;
}

function render() {
  renderBooks();
  renderStats();
  renderStreaks();
  renderSessionOptions();
}

function openBookDialog(book = null) {
  editingId = book?.id || null;
  els.dialogTitle.textContent = book ? "Edit book" : "Add book";
  els.deleteBookButton.style.visibility = book ? "visible" : "hidden";
  document.querySelector("#bookId").value = book?.id || "";
  els.bookTitle.value = book?.title || "";
  els.bookAuthor.value = book?.author || "";
  els.bookShelf.value = book?.shelf || "want-to-read";
  els.bookIsbn.value = book?.isbn || "";
  els.bookCoverId.value = book?.coverId || "";
  els.bookTotalPages.value = book?.totalPages || 0;
  els.bookTags.value = englishTags(book?.tags || []).join(", ");
  els.bookRating.value = book?.rating || 0;
  updateRatingDisplay();
  renderBookLinks(book);
  hideSuggestions();
  els.bookDialog.showModal();
}

function renderBookLinks(book) {
  if (!book) {
    els.bookLinks.innerHTML = "";
    return;
  }
  els.bookLinks.innerHTML = buyLinks(book)
    .map(([label, url]) => `<a class="quick-link" href="${url}" target="_blank" rel="noreferrer">${label}</a>`)
    .join("");
}

function saveBookFromForm(event) {
  event.preventDefault();
  const prior = editingId ? state.books.find((bookItem) => bookItem.id === editingId) : null;
  const shelf = els.bookShelf.value;
  const book = {
    id: editingId || crypto.randomUUID(),
    title: els.bookTitle.value.trim(),
    author: els.bookAuthor.value.trim(),
    shelf,
    isbn: els.bookIsbn.value.trim(),
    coverId: els.bookCoverId.value.trim(),
    pagesRead: prior?.pagesRead || 0,
    totalPages: Number(els.bookTotalPages.value || 0),
    tags: englishTags(els.bookTags.value.split(",").map((tag) => tag.trim()).filter(Boolean)),
    rating: Number(els.bookRating.value || 0),
    addedAt: prior?.addedAt || todayKey(),
    finishedAt: shelf === "read" ? prior?.finishedAt || todayKey() : ""
  };

  if (editingId) {
    state.books = state.books.map((bookItem) => (bookItem.id === editingId ? book : bookItem));
  } else {
    state.books.unshift(book);
  }

  saveState();
  els.bookDialog.close();
  render();
}

function deleteEditingBook() {
  if (!editingId) return;
  state.books = state.books.filter((book) => book.id !== editingId);
  state.sessions = state.sessions.filter((session) => session.bookId !== editingId);
  saveState();
  els.bookDialog.close();
  render();
}

function logSession(event) {
  event.preventDefault();
  const bookId = els.sessionBook.value;
  const minutes = Number(document.querySelector("#sessionMinutes").value || 0);
  const pages = Number(document.querySelector("#sessionPages").value || 0);
  if (minutes <= 0) return;
  addSession(bookId, minutes, pages);
  showSessionLogged();
}

function addSession(bookId, minutes, pages = 0) {
  state.sessions.push({ id: crypto.randomUUID(), bookId, date: todayKey(), minutes, pages });
  if (bookId && pages > 0) {
    state.books = state.books.map((book) => {
      if (book.id !== bookId) return book;
      const nextPages = Number(book.pagesRead || 0) + pages;
      return { ...book, pagesRead: book.totalPages ? Math.min(Number(book.totalPages), nextPages) : nextPages };
    });
  }
  saveState();
  render();
}

function showSessionLogged() {
  els.logPanel.classList.remove("session-logged");
  void els.logPanel.offsetWidth;
  els.logPanel.classList.add("session-logged");
  window.setTimeout(() => {
    els.logPanel.classList.remove("session-logged");
  }, 2100);
}

function quickReadToday() {
  if (quickAlreadyPressed()) return;
  const options = state.books.filter((book) => book.shelf === "currently-reading");
  const fallback = state.books.find((book) => book.shelf !== "read");
  const book = options[0] || fallback;
  addSession(book?.id || "", requiredQuickMinutes(), 0);
  state.quickReadDates = [...new Set([...(state.quickReadDates || []), todayKey()])];
  saveState();
  render();
  celebrate();
}

function praiseMessage() {
  const messages = ["Good job", "Done for today", "Streak safe", "Nice reading"];
  const day = Number(todayKey().slice(-2));
  return messages[day % messages.length];
}

function celebrate() {
  els.streakTop.classList.remove("celebrate");
  window.requestAnimationFrame(() => {
    els.streakTop.classList.add("celebrate");
  });
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      insideQuote = !insideQuote;
    } else if (char === "," && !insideQuote) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !insideQuote) {
      if (current || row.length) {
        row.push(current);
        rows.push(row);
        row = [];
        current = "";
      }
      if (char === "\r" && next === "\n") index += 1;
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

async function importGoodreadsCsv(file) {
  const text = await file.text();
  const rows = parseCsv(text);
  const headers = rows.shift().map((header) => header.trim());
  const get = (record, names) => {
    const match = names.map((name) => headers.indexOf(name)).find((index) => index >= 0);
    return match >= 0 ? record[match] : "";
  };

  const imported = rows.map((row) => {
    const shelf = normalizeShelf(get(row, ["Exclusive Shelf", "Bookshelves"]));
    return {
      id: crypto.randomUUID(),
      title: get(row, ["Title"]),
      author: get(row, ["Author", "Author l-f"]),
      shelf,
      isbn: get(row, ["ISBN13", "ISBN"]).replace(/[="]/g, ""),
      pagesRead: shelf === "read" ? Number(get(row, ["Number of Pages"]) || 0) : 0,
      totalPages: Number(get(row, ["Number of Pages"]) || 0),
      tags: englishTags(get(row, ["Bookshelves"]).split(",").map((tag) => tag.trim()).filter(Boolean)),
      addedAt: get(row, ["Date Added"]) || todayKey(),
      finishedAt: get(row, ["Date Read"]) || ""
    };
  }).filter((book) => book.title && book.author);

  const existingKeys = new Set(state.books.map((book) => `${book.title.toLowerCase()}|${book.author.toLowerCase()}`));
  state.books = [
    ...imported.filter((book) => !existingKeys.has(`${book.title.toLowerCase()}|${book.author.toLowerCase()}`)),
    ...state.books
  ];
  saveState();
  render();
}

async function lookupBooks(query) {
  latestSuggestionQuery = query;
  if (query.trim().length < 3) {
    hideSuggestions();
    return;
  }

  try {
    const fields = "key,title,author_name,isbn,number_of_pages_median,subject,edition_key,first_publish_year,cover_i";
    const response = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=6&fields=${fields}`);
    const data = await response.json();
    if (latestSuggestionQuery !== query) return;
    renderSuggestions(data.docs || []);
  } catch {
    els.bookSuggestions.innerHTML = `<div class="suggestion-button"><span>Lookup is unavailable right now.</span></div>`;
    els.bookSuggestions.classList.add("visible");
  }
}

function renderSuggestions(docs) {
  const suggestions = docs
    .filter((doc) => doc.title && doc.author_name?.[0])
    .slice(0, 5)
    .map((doc) => ({
      title: doc.title,
      author: doc.author_name?.[0] || "",
      isbn: doc.isbn?.find((item) => String(item).length === 13) || doc.isbn?.[0] || "",
      totalPages: doc.number_of_pages_median || "",
      tags: englishTags((doc.subject || []).slice(0, 12)),
      workKey: doc.key || "",
      editionKey: doc.edition_key?.[0] || "",
      coverId: doc.cover_i || ""
    }));

  if (!suggestions.length) {
    hideSuggestions();
    return;
  }

  els.bookSuggestions.innerHTML = suggestions.map((book, index) => `
    <button class="suggestion-button" type="button" data-suggestion="${index}">
      <strong>${escapeHtml(book.title)}</strong>
      <span>${escapeHtml(book.author)}${book.totalPages ? ` · ${book.totalPages} pages` : ""}</span>
    </button>
  `).join("");
  els.bookSuggestions.classList.add("visible");
  els.bookSuggestions._books = suggestions;
}

function applySuggestion(book) {
  els.bookTitle.value = book.title;
  els.bookAuthor.value = book.author;
  els.bookIsbn.value = book.isbn;
  els.bookCoverId.value = book.coverId || "";
  els.bookTotalPages.value = book.totalPages || 0;
  els.bookTags.value = englishTags(book.tags || []).join(", ");
  els.bookShelf.value = "want-to-read";
  hideSuggestions();
  enrichSuggestion(book).then((enriched) => {
    if (els.bookTitle.value !== book.title) return;
    els.bookIsbn.value = enriched.isbn;
    els.bookCoverId.value = enriched.coverId || "";
    els.bookTotalPages.value = enriched.totalPages || 0;
    els.bookTags.value = englishTags(enriched.tags || []).join(", ");
  });
}

async function enrichSuggestion(book) {
  const enriched = { ...book, tags: [...(book.tags || [])] };
  if (enriched.isbn && enriched.totalPages && enriched.tags.length) return enriched;

  try {
    if (book.editionKey) {
      const editionResponse = await fetchWithTimeout(`https://openlibrary.org/books/${book.editionKey}.json`);
      const edition = await editionResponse.json();
      enriched.isbn = enriched.isbn || edition.isbn_13?.[0] || edition.isbn_10?.[0] || "";
      enriched.coverId = enriched.coverId || edition.covers?.[0] || "";
      enriched.totalPages = enriched.totalPages || edition.number_of_pages || 0;
    }

    if (book.workKey) {
      const workResponse = await fetchWithTimeout(`https://openlibrary.org${book.workKey}.json`);
      const work = await workResponse.json();
      enriched.tags = enriched.tags.length ? enriched.tags : englishTags((work.subjects || []).slice(0, 20));
    }

    if ((!enriched.isbn || !enriched.totalPages) && book.workKey) {
      const editionsResponse = await fetchWithTimeout(`https://openlibrary.org${book.workKey}/editions.json?limit=10`);
      const editions = await editionsResponse.json();
      const edition = (editions.entries || []).find((entry) => entry.isbn_13?.[0] || entry.isbn_10?.[0]) || editions.entries?.[0];
      if (edition) {
        enriched.isbn = enriched.isbn || edition.isbn_13?.[0] || edition.isbn_10?.[0] || "";
        enriched.coverId = enriched.coverId || edition.covers?.[0] || "";
        enriched.totalPages = enriched.totalPages || edition.number_of_pages || 0;
      }
    }
  } catch {
    return enriched;
  }

  return enriched;
}

async function fetchWithTimeout(url, timeoutMs = 1400) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function hideSuggestions() {
  els.bookSuggestions.classList.remove("visible");
  els.bookSuggestions.innerHTML = "";
  els.bookSuggestions._books = [];
}

function exportLibrary() {
  const headers = ["Title", "Author", "Shelf", "ISBN", "Pages Read", "Total Pages", "Tags", "Rating"];
  const rows = state.books.map((book) => [
    book.title,
    book.author,
    shelfLabel(book.shelf),
    book.isbn,
    book.pagesRead,
    book.totalPages,
    (book.tags || []).join("; "),
    book.rating || 0
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clover-export-${todayKey()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.menuItems.forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    els.menuItems.forEach((item) => item.classList.toggle("active", item === button));
    els.panelToggles.forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".menu-panel-section").forEach((panel) => panel.classList.remove("open"));
    document.querySelector(".app-menu").open = false;
    render();
  });
});

els.panelToggles.forEach((button) => {
  button.addEventListener("click", () => {
    const panel = document.querySelector(`#${button.dataset.panel}Panel`);
    const isOpen = panel?.classList.contains("open");
    document.querySelectorAll(".menu-panel-section").forEach((item) => item.classList.remove("open"));
    els.panelToggles.forEach((item) => item.classList.remove("active"));
    if (!isOpen && panel) {
      panel.classList.add("open");
      button.classList.add("active");
    }
  });
});

els.searchInput.addEventListener("input", renderBooks);
els.addBookButton.addEventListener("click", () => openBookDialog());
els.closeDialog.addEventListener("click", () => els.bookDialog.close());
els.bookForm.addEventListener("submit", saveBookFromForm);
els.deleteBookButton.addEventListener("click", deleteEditingBook);
els.sessionForm.addEventListener("submit", logSession);
els.quickReadButton.addEventListener("click", quickReadToday);
els.bookRating.addEventListener("input", updateRatingDisplay);
els.exportButton.addEventListener("click", exportLibrary);
els.csvInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importGoodreadsCsv(file);
  event.target.value = "";
});
els.bookGrid.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  if (!editButton) return;
  const book = state.books.find((item) => item.id === editButton.dataset.edit);
  if (book) openBookDialog(book);
});
els.bookTitle.addEventListener("input", () => {
  if (editingId) return;
  window.clearTimeout(suggestionTimer);
  const query = els.bookTitle.value.trim();
  suggestionTimer = window.setTimeout(() => lookupBooks(query), 260);
});
els.bookSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-suggestion]");
  if (!button) return;
  const book = els.bookSuggestions._books?.[Number(button.dataset.suggestion)];
  if (book) applySuggestion(book);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".lookup-field")) hideSuggestions();
});

function updateRatingDisplay() {
  const rating = Number(els.bookRating.value || 0);
  els.starSlider.style.setProperty("--rating-fill", `${(rating / 5) * 100}%`);
  els.ratingValue.textContent = `${rating.toFixed(2)} ${rating === 1 ? "star" : "stars"}`;
}

window.addEventListener("pagehide", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

render();
loadRemoteState();

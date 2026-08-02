/* ==========================================================================
   SECTiON — client-side app logic
   Everything runs on localStorage. There is no server: this file IS the
   backend for the demo. One browser = one reader's data.
   ========================================================================== */

(function () {
  "use strict";

  var DB_KEY = "section_db_v1";
  var GENRES = ["Action","Adventure","Drama","Fan-Fiction","Fantasy","Mature","Mecha","Military","Sci-fi","Shounen","Supernatural","Urban Life"];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultDB() {
    return {
      novels: [],
      chapters: [],
      user: { username: "", handle: "", bio: "", email: "", password: "" },
      session: { loggedIn: false },
      favorites: [],
      history: [],      // { novelId, chapterId, lastReadAt, status }
      readChapters: [],
      tickets: 0,
      settings: { fontSize: "medium", autoScroll: false, saveHistory: true },
      adDismissed: false
    };
  }

  function loadDB() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return defaultDB();
      var parsed = JSON.parse(raw);
      var base = defaultDB();
      // shallow-merge so older saved DBs gain any new fields safely
      for (var k in base) {
        if (!(k in parsed)) parsed[k] = base[k];
      }
      return parsed;
    } catch (e) {
      console.error("SECTiON: failed to read local data, resetting.", e);
      return defaultDB();
    }
  }

  function saveDB(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.error("SECTiON: failed to save local data.", e);
    }
    return db;
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function timeAgo(ts) {
    if (!ts) return "—";
    var diff = Math.max(0, Date.now() - ts);
    var m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    if (d < 30) return d + "d ago";
    var mo = Math.floor(d / 30);
    if (mo < 12) return mo + "mo ago";
    return Math.floor(mo / 12) + "y ago";
  }

  function novelChapters(db, novelId) {
    return db.chapters
      .filter(function (c) { return c.novelId === novelId; })
      .sort(function (a, b) { return a.index - b.index; });
  }

  function coverStyle(novel) {
    if (novel && novel.cover) {
      return 'style="background-image:url(' + novel.cover + ');background-size:cover;background-position:center;"';
    }
    return "";
  }

  function coverInitial(novel) {
    var t = (novel && novel.title || "?").trim();
    return t.charAt(0).toUpperCase();
  }

  /* ------------------------------------------------------------------ *
   *  Shared chrome: auth slot + ad notice dismiss + genre tag filtering
   * ------------------------------------------------------------------ */

  function renderAuthSlot(db) {
    var slot = document.getElementById("auth-slot");
    if (!slot) return;
    if (db.session.loggedIn && db.user.username) {
      slot.innerHTML =
        '<a href="profile.html" class="link-muted" style="margin-right:12px;font-weight:600;color:var(--text-main);">' +
        escapeHtml(db.user.username) + "</a>" +
        '<a href="#" id="logout-link" class="btn btn-outline btn-sm">Log Out</a>';
      var out = document.getElementById("logout-link");
      if (out) out.addEventListener("click", function (e) {
        e.preventDefault();
        var d = loadDB();
        d.session.loggedIn = false;
        saveDB(d);
        window.location.href = "index.html";
      });
    } else {
      slot.innerHTML = '<a href="login.html" class="btn btn-outline btn-sm">Login</a>';
    }
  }

  function initAdNotice(db) {
    var notice = document.getElementById("ad-notice");
    if (!notice) return;
    if (db.adDismissed) {
      notice.style.display = "none";
      return;
    }
    var btn = document.getElementById("ad-dismiss");
    if (btn) btn.addEventListener("click", function () {
      var d = loadDB();
      d.adDismissed = true;
      saveDB(d);
      notice.style.display = "none";
    });
  }

  function initGenreTags(container, onChange) {
    if (!container) return { get: function () { return "All"; }, set: function () {} };
    var current = "All";
    container.querySelectorAll(".genre-tag").forEach(function (tag) {
      tag.addEventListener("click", function (e) {
        e.preventDefault();
        container.querySelectorAll(".genre-tag").forEach(function (t) { t.classList.remove("active"); });
        tag.classList.add("active");
        current = tag.textContent.trim();
        onChange(current);
      });
    });
    return {
      get: function () { return current; },
      set: function (genre) {
        current = genre;
        container.querySelectorAll(".genre-tag").forEach(function (t) {
          t.classList.toggle("active", t.textContent.trim() === genre);
        });
      }
    };
  }

  function emptyStateHTML(icon, title, desc, ctaHref, ctaLabel) {
    return (
      '<div class="empty-state">' +
      '<i class="fa-solid ' + icon + '"></i>' +
      '<div class="empty-state-title">' + escapeHtml(title) + "</div>" +
      '<div class="empty-state-desc">' + escapeHtml(desc) + "</div>" +
      (ctaHref ? '<a href="' + ctaHref + '" class="btn btn-outline btn-sm">' + escapeHtml(ctaLabel) + "</a>" : "") +
      "</div>"
    );
  }

  function novelCardHTML(novel, opts) {
    opts = opts || {};
    var chs = novelChapters(loadDB(), novel.id);
    var chCount = chs.length;
    var lastCh = chs[chs.length - 1];
    var removeBtn = opts.removable
      ? '<button class="remove-btn" data-remove-fav="' + novel.id + '"><i class="fa-solid fa-xmark"></i></button>'
      : "";
    return (
      '<a href="novel-detail.html?id=' + encodeURIComponent(novel.id) + '" class="novel-card">' +
      removeBtn +
      '<div class="cover" ' + coverStyle(novel) + (novel.cover ? "" : ' data-initial="' + escapeHtml(coverInitial(novel)) + '"') + "></div>" +
      '<div class="info">' +
      '<div class="genre-mini">' + escapeHtml((novel.genres || []).join(" · ") || "Uncategorized") + "</div>" +
      '<div class="title">' + escapeHtml(novel.title || "Untitled Novel") + "</div>" +
      '<div class="meta-line"><span>Ch. ' + chCount + "</span><span>" + (lastCh ? timeAgo(lastCh.createdAt) : "—") + "</span></div>" +
      "</div></a>"
    );
  }

  /* ------------------------------------------------------------------ *
   *  Page: index.html
   * ------------------------------------------------------------------ */

  function pageHome() {
    var db = loadDB();
    var grid = document.getElementById("recent-grid");
    var genreTagsEl = document.getElementById("home-genre-tags");
    var featuredWrap = document.getElementById("featured-wrap");
    var spendersWrap = document.getElementById("spenders-wrap");

    function renderFeatured() {
      var featured = db.novels.filter(function (n) { return n.featured; })[0];
      if (!featured) {
        featuredWrap.innerHTML = emptyStateHTML("fa-star", "No featured novel yet",
          "Mark a novel as featured from the editor to showcase it here.", "novel-edit.html", "Add a Novel");
        return;
      }
      var chs = novelChapters(db, featured.id);
      featuredWrap.innerHTML =
        '<div class="featured">' +
        '<div class="featured-cover" ' + coverStyle(featured) + ">" +
        (featured.cover ? "" : '<span class="cover-glyph">' + escapeHtml(coverInitial(featured)) + "</span>") +
        "</div>" +
        '<div class="featured-body">' +
        '<span class="badge">Featured</span>' +
        '<h1 class="featured-title">' + escapeHtml(featured.title) + "</h1>" +
        '<div class="tag-row">' + (featured.genres || []).map(function (g) { return '<span class="tag">' + escapeHtml(g) + "</span>"; }).join("") + "</div>" +
        '<p class="featured-desc">' + escapeHtml(featured.description || "No description yet.") + "</p>" +
        '<div class="featured-meta">' +
        '<div class="stat-item"><strong>' + chs.length + '</strong><span>Chapters</span></div>' +
        '<div class="stat-item"><strong>' + (featured.views || 0) + '</strong><span>Views</span></div>' +
        '<div class="stat-item"><strong>' + (featured.rating != null ? featured.rating : "—") + '</strong><span>Rating</span></div>' +
        "</div>" +
        '<div class="featured-actions">' +
        '<a href="novel-detail.html?id=' + encodeURIComponent(featured.id) + '" class="btn btn-outline">Start Reading</a>' +
        '<a href="novel-detail.html?id=' + encodeURIComponent(featured.id) + '" class="btn btn-ghost">View Details</a>' +
        "</div></div></div>";
    }

    function renderGrid(genre) {
      var list = db.novels.slice().sort(function (a, b) {
        var la = novelChapters(db, a.id).slice(-1)[0];
        var lb = novelChapters(db, b.id).slice(-1)[0];
        var ta = la ? la.createdAt : a.createdAt || 0;
        var tb = lb ? lb.createdAt : b.createdAt || 0;
        return tb - ta;
      });
      if (genre && genre !== "All") {
        list = list.filter(function (n) { return (n.genres || []).indexOf(genre) !== -1; });
      }
      list = list.slice(0, 6);
      if (!list.length) {
        grid.innerHTML = emptyStateHTML("fa-book", "No novels yet",
          "Newly updated novels will appear here once they're added to the library.", "novel-edit.html", "Add a Novel");
        return;
      }
      grid.innerHTML = list.map(function (n) { return novelCardHTML(n); }).join("");
    }

    function renderSpenders() {
      if (db.tickets > 0 && db.user.username) {
        spendersWrap.innerHTML =
          '<div class="rank-list"><div class="rank-row">' +
          '<span class="rank-num">1</span>' +
          '<span class="rank-avatar">' + escapeHtml(db.user.username.slice(0, 2).toUpperCase()) + "</span>" +
          '<span class="rank-name">' + escapeHtml(db.user.username) + "</span>" +
          '<span class="rank-tickets"><i class="fa-solid fa-ticket"></i>' + db.tickets + "</span>" +
          "</div></div>";
      } else {
        spendersWrap.innerHTML = emptyStateHTML("fa-ticket", "No activity yet today",
          "Read a few chapters to start earning tickets and show up on the leaderboard.");
      }
    }

    renderFeatured();
    renderGrid("All");
    renderSpenders();
    initGenreTags(genreTagsEl, renderGrid);
  }

  /* ------------------------------------------------------------------ *
   *  Page: login.html
   * ------------------------------------------------------------------ */

  function pageLogin() {
    var form = document.getElementById("login-form");
    var note = document.getElementById("login-note");
    if (!form) return;

    document.querySelectorAll(".social-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (note) note.textContent = "Social login isn't available in this demo — please use the form above.";
      });
    });

    var signup = document.getElementById("signup-link");
    if (signup) signup.addEventListener("click", function (e) {
      e.preventDefault();
      if (note) note.textContent = "Just fill in the form above — an account is created automatically the first time you log in.";
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var idVal = document.getElementById("login-id").value.trim();
      var pwVal = document.getElementById("login-pw").value;
      if (!idVal || !pwVal) {
        if (note) note.textContent = "Enter both a username/email and a password.";
        return;
      }
      var db = loadDB();
      var isEmail = idVal.indexOf("@") !== -1;
      if (!db.user.username) {
        db.user.username = isEmail ? idVal.split("@")[0] : idVal;
        db.user.handle = "@" + db.user.username.toLowerCase().replace(/\s+/g, "");
        db.user.email = isEmail ? idVal : db.user.email;
        db.user.password = pwVal;
      }
      db.session.loggedIn = true;
      saveDB(db);
      window.location.href = "profile.html";
    });
  }

  /* ------------------------------------------------------------------ *
   *  Page: library.html
   * ------------------------------------------------------------------ */

  function pageLibrary() {
    var db = loadDB();
    var grid = document.getElementById("library-grid");
    var pagination = document.getElementById("library-pagination");
    var searchInput = document.getElementById("library-search");
    var genreSelect = document.getElementById("library-genre-select");
    var sortSelect = document.getElementById("library-sort-select");
    var tagsEl = document.getElementById("library-genre-tags");
    var PAGE_SIZE = 12;
    var state = { search: "", genre: "All", sort: "latest", page: 1 };
    var tagsApi;

    function filtered() {
      var list = db.novels.slice();
      if (state.search) {
        var q = state.search.toLowerCase();
        list = list.filter(function (n) { return (n.title || "").toLowerCase().indexOf(q) !== -1; });
      }
      if (state.genre && state.genre !== "All") {
        list = list.filter(function (n) { return (n.genres || []).indexOf(state.genre) !== -1; });
      }
      list.sort(function (a, b) {
        if (state.sort === "popular") return (b.views || 0) - (a.views || 0);
        if (state.sort === "rating") return (b.rating || 0) - (a.rating || 0);
        if (state.sort === "az") return (a.title || "").localeCompare(b.title || "");
        var la = novelChapters(db, a.id).slice(-1)[0];
        var lb = novelChapters(db, b.id).slice(-1)[0];
        return ((lb ? lb.createdAt : b.createdAt) || 0) - ((la ? la.createdAt : a.createdAt) || 0);
      });
      return list;
    }

    function render() {
      var list = filtered();
      var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      var pageItems = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

      if (!list.length) {
        grid.innerHTML = emptyStateHTML("fa-book", "No novels found",
          db.novels.length ? "Try a different search or filter." : "Once novels are added, they'll show up here.",
          "novel-edit.html", "Add a Novel");
      } else {
        grid.innerHTML = pageItems.map(function (n) { return novelCardHTML(n); }).join("");
      }

      if (pages <= 1) {
        pagination.innerHTML = "";
      } else {
        var html = '<a href="#" class="page-btn" data-page="' + Math.max(1, state.page - 1) + '"><i class="fa-solid fa-angle-left"></i></a>';
        for (var i = 1; i <= pages; i++) {
          html += '<a href="#" class="page-btn' + (i === state.page ? " active" : "") + '" data-page="' + i + '">' + i + "</a>";
        }
        html += '<a href="#" class="page-btn" data-page="' + Math.min(pages, state.page + 1) + '"><i class="fa-solid fa-angle-right"></i></a>';
        pagination.innerHTML = html;
        pagination.querySelectorAll("[data-page]").forEach(function (a) {
          a.addEventListener("click", function (e) {
            e.preventDefault();
            state.page = parseInt(a.getAttribute("data-page"), 10);
            render();
          });
        });
      }
    }

    if (searchInput) searchInput.addEventListener("input", function () {
      state.search = searchInput.value.trim();
      state.page = 1;
      render();
    });
    if (genreSelect) genreSelect.addEventListener("change", function () {
      state.genre = genreSelect.value === "All Genres" ? "All" : genreSelect.value;
      state.page = 1;
      if (tagsApi) tagsApi.set(state.genre);
      render();
    });
    if (sortSelect) sortSelect.addEventListener("change", function () {
      var map = { "Sort: Latest Update": "latest", "Sort: Most Popular": "popular", "Sort: Highest Rated": "rating", "Sort: A–Z": "az" };
      state.sort = map[sortSelect.value] || "latest";
      render();
    });
    tagsApi = initGenreTags(tagsEl, function (genre) {
      state.genre = genre;
      state.page = 1;
      render();
    });

    render();
  }

  /* ------------------------------------------------------------------ *
   *  Page: novel-detail.html
   * ------------------------------------------------------------------ */

  function pageNovelDetail() {
    var id = qs("id");
    var db = loadDB();
    var novel = db.novels.filter(function (n) { return n.id === id; })[0];
    var root = document.getElementById("novel-detail-root");
    if (!novel) {
      root.innerHTML =
        '<section class="block">' +
        emptyStateHTML("fa-triangle-exclamation", "Novel not found",
          "This novel may have been removed, or the link is out of date.", "library.html", "Back to Library") +
        "</section>";
      return;
    }

    // count a view once per page load
    novel.views = (novel.views || 0) + 1;
    saveDB(db);

    var chs = novelChapters(db, novel.id);
    var isFav = db.favorites.indexOf(novel.id) !== -1;
    document.title = escapeHtml(novel.title) + " — SECTiON";

    root.innerHTML =
      '<section class="block">' +
      '<div class="detail-head">' +
      '<div class="detail-cover" ' + coverStyle(novel) + "></div>" +
      "<div>" +
      '<h1 class="detail-title">' + escapeHtml(novel.title) + "</h1>" +
      '<p class="detail-alt">' + escapeHtml(novel.altTitle || "No original title") + " · " + escapeHtml(novel.lang || "—") + " · " + escapeHtml(novel.status || "Ongoing") + "</p>" +
      '<div class="tag-row">' + ((novel.genres || []).map(function (g) { return '<span class="tag">' + escapeHtml(g) + "</span>"; }).join("") || '<span class="tag">Uncategorized</span>') + "</div>" +
      '<div class="stat-row">' +
      '<div class="stat-item"><strong>' + chs.length + '</strong><span>Chapters</span></div>' +
      '<div class="stat-item"><strong>' + novel.views + '</strong><span>Views</span></div>' +
      '<div class="stat-item"><strong>' + (novel.rating != null ? novel.rating : "—") + '</strong><span>Rating</span></div>' +
      '<div class="stat-item"><strong>' + (isFav ? 1 : 0) + '</strong><span>Favorites</span></div>' +
      "</div>" +
      '<p class="detail-desc">' + escapeHtml(novel.description || "No description has been added for this novel yet.") + "</p>" +
      '<div class="detail-actions">' +
      (chs[0]
        ? '<a href="reading.html?novel=' + encodeURIComponent(novel.id) + "&chapter=" + encodeURIComponent(chs[0].id) + '" class="btn btn-outline">Read First Chapter</a>'
        : '<a href="novel-edit.html?id=' + encodeURIComponent(novel.id) + '" class="btn btn-outline">Add a Chapter</a>') +
      '<button type="button" id="fav-toggle" class="btn btn-ghost"><i class="fa-' + (isFav ? "solid" : "regular") + ' fa-bookmark"></i> ' + (isFav ? "In Favorites" : "Add to Favorites") + "</button>" +
      '<a href="novel-edit.html?id=' + encodeURIComponent(novel.id) + '" class="btn btn-ghost"><i class="fa-solid fa-pen"></i> Edit Novel</a>' +
      "</div></div></div></section>" +

      '<section class="block">' +
      '<div class="section-head"><h2>Chapters</h2><span class="view-all">' + chs.length + " total</span></div>" +
      (chs.length
        ? '<div class="chapter-list">' + chs.map(function (c) {
            var read = db.readChapters.indexOf(c.id) !== -1;
            return (
              '<a href="reading.html?novel=' + encodeURIComponent(novel.id) + "&chapter=" + encodeURIComponent(c.id) + '" class="chapter-row">' +
              '<div class="chapter-info"><span class="chapter-num">' + (c.index + 1) + '</span><span class="chapter-name">' + escapeHtml(c.title) + "</span></div>" +
              '<div class="chapter-info"><span class="chapter-date">' + timeAgo(c.createdAt) + '</span><span class="status-pill ' + (read ? "read" : "unread") + '">' + (read ? "Read" : "Unread") + "</span></div>" +
              "</a>"
            );
          }).join("") + "</div>"
        : emptyStateHTML("fa-file-lines", "No chapters yet",
            "Chapters for this novel haven't been published. Check back soon, or add one from the editor.",
            "novel-edit.html?id=" + encodeURIComponent(novel.id), "Add a Chapter")) +
      "</section>";

    var favBtn = document.getElementById("fav-toggle");
    if (favBtn) favBtn.addEventListener("click", function () {
      var d = loadDB();
      var idx = d.favorites.indexOf(novel.id);
      if (idx === -1) d.favorites.push(novel.id);
      else d.favorites.splice(idx, 1);
      saveDB(d);
      pageNovelDetail();
    });
  }

  /* ------------------------------------------------------------------ *
   *  Page: novel-edit.html
   * ------------------------------------------------------------------ */

  function pageNovelEdit() {
    var id = qs("id");
    var db = loadDB();
    var novel = id ? db.novels.filter(function (n) { return n.id === id; })[0] : null;
    var pendingCover = novel ? novel.cover : null;

    document.getElementById("editor-heading").textContent = novel ? "Edit Novel" : "Add Novel";
    document.getElementById("editor-subheading").textContent = novel
      ? "Update details, cover, and chapters for this title."
      : "Fill in the details below to publish a new novel.";
    document.title = (novel ? "Edit Novel" : "Add Novel") + " — SECTiON";

    var titleInput = document.getElementById("novel-title");
    var altInput = document.getElementById("novel-alt");
    var langSelect = document.getElementById("novel-lang");
    var statusSelect = document.getElementById("novel-status");
    var descInput = document.getElementById("novel-desc");
    var featuredCheck = document.getElementById("novel-featured");
    var coverBox = document.getElementById("cover-upload-box");
    var coverInput = document.getElementById("cover-file-input");
    var coverUploadBtn = document.getElementById("cover-upload-btn");

    if (novel) {
      titleInput.value = novel.title || "";
      altInput.value = novel.altTitle || "";
      if (novel.lang) langSelect.value = novel.lang;
      if (novel.status) statusSelect.value = novel.status;
      descInput.value = novel.description || "";
      featuredCheck.checked = !!novel.featured;
      document.querySelectorAll(".genre-check input").forEach(function (cb) {
        cb.checked = (novel.genres || []).indexOf(cb.value) !== -1;
      });
      renderCoverPreview();
    }

    function renderCoverPreview() {
      if (pendingCover) {
        coverBox.style.backgroundImage = "url(" + pendingCover + ")";
        coverBox.style.backgroundSize = "cover";
        coverBox.style.backgroundPosition = "center";
        coverBox.querySelector("i").style.display = "none";
        coverBox.querySelector("span").style.display = "none";
      }
    }

    if (coverUploadBtn) coverUploadBtn.addEventListener("click", function () { coverInput.click(); });
    if (coverInput) coverInput.addEventListener("change", function () {
      var file = coverInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        pendingCover = e.target.result;
        renderCoverPreview();
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("editor-cancel").addEventListener("click", function () {
      window.location.href = novel ? "novel-detail.html?id=" + encodeURIComponent(novel.id) : "library.html";
    });

    document.getElementById("editor-save").addEventListener("click", function () {
      var title = titleInput.value.trim();
      if (!title) {
        titleInput.focus();
        return;
      }
      var d = loadDB();
      var genres = Array.prototype.slice.call(document.querySelectorAll(".genre-check input:checked")).map(function (cb) { return cb.value; });
      var payload = {
        title: title,
        altTitle: altInput.value.trim(),
        lang: langSelect.value,
        status: statusSelect.value,
        genres: genres,
        description: descInput.value.trim(),
        featured: featuredCheck.checked,
        cover: pendingCover
      };
      var savedId;
      if (novel) {
        var idx = d.novels.findIndex(function (n) { return n.id === novel.id; });
        d.novels[idx] = Object.assign({}, d.novels[idx], payload);
        savedId = novel.id;
      } else {
        savedId = uid();
        d.novels.push(Object.assign({ id: savedId, createdAt: Date.now(), views: 0, rating: null }, payload));
      }
      saveDB(d);
      window.location.href = "novel-edit.html?id=" + encodeURIComponent(savedId);
    });

    renderChapterAdmin();

    function renderChapterAdmin() {
      var wrap = document.getElementById("chapter-admin-list");
      var addRow = document.getElementById("add-chapter-row");
      var countEl = document.getElementById("chapter-count");

      if (!novel) {
        wrap.innerHTML = emptyStateHTML("fa-file-lines", "Save the novel first",
          "Once this novel is saved, you'll be able to add and manage its chapters here.");
        addRow.style.display = "none";
        countEl.textContent = "0 total";
        return;
      }
      addRow.style.display = "flex";

      var d = loadDB();
      var chs = novelChapters(d, novel.id);
      countEl.textContent = chs.length + " total";

      if (!chs.length) {
        wrap.innerHTML = emptyStateHTML("fa-file-lines", "No chapters yet",
          "Add the first chapter below to start publishing this novel.");
      } else {
        wrap.innerHTML = chs.map(function (c) {
          return (
            '<div class="chapter-admin-row" data-chapter-id="' + c.id + '">' +
            '<span class="chapter-admin-num">' + (c.index + 1) + "</span>" +
            '<input type="text" class="chapter-admin-title" value="' + escapeHtml(c.title) + '">' +
            '<div class="chapter-admin-actions">' +
            '<a href="reading.html?novel=' + encodeURIComponent(novel.id) + "&chapter=" + encodeURIComponent(c.id) + '" class="icon-btn" title="Preview"><i class="fa-solid fa-eye"></i></a>' +
            '<button type="button" class="icon-btn" data-save-chapter title="Save"><i class="fa-solid fa-check"></i></button>' +
            '<button type="button" class="icon-btn danger" data-delete-chapter title="Delete"><i class="fa-solid fa-trash"></i></button>' +
            "</div></div>"
          );
        }).join("");

        wrap.querySelectorAll("[data-save-chapter]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var row = btn.closest(".chapter-admin-row");
            var chId = row.getAttribute("data-chapter-id");
            var newTitle = row.querySelector(".chapter-admin-title").value.trim();
            var dd = loadDB();
            var ch = dd.chapters.filter(function (c) { return c.id === chId; })[0];
            if (ch && newTitle) {
              ch.title = newTitle;
              saveDB(dd);
              btn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--text-highlight);"></i>';
              setTimeout(function () { btn.innerHTML = '<i class="fa-solid fa-check"></i>'; }, 900);
            }
          });
        });
        wrap.querySelectorAll("[data-delete-chapter]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var row = btn.closest(".chapter-admin-row");
            var chId = row.getAttribute("data-chapter-id");
            if (!window.confirm("Delete this chapter? This can't be undone.")) return;
            var dd = loadDB();
            dd.chapters = dd.chapters.filter(function (c) { return c.id !== chId; });
            // re-index remaining chapters for this novel
            var remaining = novelChapters(dd, novel.id);
            remaining.forEach(function (c, i) { c.index = i; });
            saveDB(dd);
            renderChapterAdmin();
          });
        });
      }

      var input = document.getElementById("new-chapter-title");
      var addBtn = document.getElementById("add-chapter-btn");
      addBtn.onclick = function () {
        var title = input.value.trim();
        if (!title) { input.focus(); return; }
        var dd = loadDB();
        var existing = novelChapters(dd, novel.id);
        dd.chapters.push({
          id: uid(),
          novelId: novel.id,
          index: existing.length,
          title: title,
          content: "Chapter content will appear here once this novel's translated text is added.",
          createdAt: Date.now()
        });
        saveDB(dd);
        input.value = "";
        renderChapterAdmin();
      };
    }
  }

  /* ------------------------------------------------------------------ *
   *  Page: reading.html
   * ------------------------------------------------------------------ */

  function pageReading() {
    var novelId = qs("novel");
    var chapterId = qs("chapter");
    var db = loadDB();
    var novel = db.novels.filter(function (n) { return n.id === novelId; })[0];
    var root = document.getElementById("reading-root");
    var barTitle = document.getElementById("reader-chapter-select");
    var backLink = document.getElementById("reader-back");

    if (!novel) {
      root.innerHTML = emptyStateHTML("fa-triangle-exclamation", "Chapter not found",
        "This novel or chapter no longer exists.", "library.html", "Back to Library");
      return;
    }
    backLink.href = "novel-detail.html?id=" + encodeURIComponent(novel.id);

    var chs = novelChapters(db, novel.id);
    var chapter = chs.filter(function (c) { return c.id === chapterId; })[0] || chs[0];

    if (!chapter) {
      root.innerHTML = emptyStateHTML("fa-file-lines", "No chapters yet",
        "This novel doesn't have any published chapters.", "novel-edit.html?id=" + encodeURIComponent(novel.id), "Add a Chapter");
      return;
    }

    document.title = escapeHtml(chapter.title) + " — SECTiON";
    barTitle.textContent = chapter.title;

    var pos = chs.findIndex(function (c) { return c.id === chapter.id; });
    var prevCh = chs[pos - 1];
    var nextCh = chs[pos + 1];
    var isFav = db.favorites.indexOf(novel.id) !== -1;

    var paragraphs = (chapter.content || "").split(/\n+/).filter(Boolean);
    if (!paragraphs.length) paragraphs = ["This chapter doesn't have any content yet."];

    root.innerHTML =
      '<div class="reader-novel-title">' + escapeHtml(novel.title) + "</div>" +
      '<h1 class="reader-chapter-title">' + escapeHtml(chapter.title) + "</h1>" +
      '<div class="reader-mtl-note"><i class="fa-solid fa-language"></i><span>This chapter is machine-translated and may contain awkward phrasing.</span></div>' +
      '<article class="reader-text" id="reader-text">' + paragraphs.map(function (p) { return "<p>" + escapeHtml(p) + "</p>"; }).join("") + "</article>" +
      '<div class="reader-nav">' +
      (prevCh
        ? '<a href="reading.html?novel=' + encodeURIComponent(novel.id) + "&chapter=" + encodeURIComponent(prevCh.id) + '" class="btn btn-outline"><i class="fa-solid fa-angle-left"></i> Previous</a>'
        : '<span class="btn btn-outline disabled"><i class="fa-solid fa-angle-left"></i> Previous</span>') +
      '<a href="novel-detail.html?id=' + encodeURIComponent(novel.id) + '" class="btn btn-ghost">All Chapters</a>' +
      (nextCh
        ? '<a href="reading.html?novel=' + encodeURIComponent(novel.id) + "&chapter=" + encodeURIComponent(nextCh.id) + '" class="btn btn-outline">Next <i class="fa-solid fa-angle-right"></i></a>'
        : '<span class="btn btn-outline disabled">Next <i class="fa-solid fa-angle-right"></i></span>') +
      "</div>";

    // font size (persisted in settings)
    var sizes = { small: "14px", medium: "16px", large: "19px" };
    function applyFontSize() {
      var d = loadDB();
      document.getElementById("reader-text").style.fontSize = sizes[d.settings.fontSize] || sizes.medium;
    }
    applyFontSize();
    document.getElementById("font-dec").addEventListener("click", function (e) {
      e.preventDefault();
      var d = loadDB();
      var order = ["small", "medium", "large"];
      var i = Math.max(0, order.indexOf(d.settings.fontSize) - 1);
      d.settings.fontSize = order[i];
      saveDB(d);
      applyFontSize();
    });
    document.getElementById("font-inc").addEventListener("click", function (e) {
      e.preventDefault();
      var d = loadDB();
      var order = ["small", "medium", "large"];
      var i = Math.min(order.length - 1, order.indexOf(d.settings.fontSize) + 1);
      d.settings.fontSize = order[i];
      saveDB(d);
      applyFontSize();
    });

    // favorite toggle
    var favBtn = document.getElementById("reader-fav");
    function renderFav() {
      var d = loadDB();
      var fav = d.favorites.indexOf(novel.id) !== -1;
      favBtn.innerHTML = '<i class="fa-' + (fav ? "solid" : "regular") + ' fa-bookmark"></i>';
    }
    favBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var d = loadDB();
      var idx = d.favorites.indexOf(novel.id);
      if (idx === -1) d.favorites.push(novel.id); else d.favorites.splice(idx, 1);
      saveDB(d);
      renderFav();
    });
    renderFav();

    // record progress / history / tickets
    var d2 = loadDB();
    if (d2.settings.saveHistory) {
      if (d2.readChapters.indexOf(chapter.id) === -1) {
        d2.readChapters.push(chapter.id);
        d2.tickets = (d2.tickets || 0) + 5;
      }
      var hist = d2.history.filter(function (h) { return h.novelId === novel.id; })[0];
      var progressPct = Math.round(((pos + 1) / chs.length) * 100);
      var status = progressPct >= 100 ? "completed" : "reading";
      if (hist) {
        hist.chapterId = chapter.id;
        hist.lastReadAt = Date.now();
        hist.progress = progressPct;
        hist.status = status;
      } else {
        d2.history.unshift({ novelId: novel.id, chapterId: chapter.id, lastReadAt: Date.now(), progress: progressPct, status: status });
      }
      saveDB(d2);
    }

    // auto-scroll (if enabled in settings)
    if (d2.settings.autoScroll) {
      var scrollTimer = setInterval(function () {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 4) {
          clearInterval(scrollTimer);
          return;
        }
        window.scrollBy(0, 1);
      }, 60);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Page: favorites.html
   * ------------------------------------------------------------------ */

  function pageFavorites() {
    var db = loadDB();
    var grid = document.getElementById("favorites-grid");

    function render() {
      var d = loadDB();
      var novels = d.favorites.map(function (id) { return d.novels.filter(function (n) { return n.id === id; })[0]; }).filter(Boolean);
      if (!novels.length) {
        grid.innerHTML = emptyStateHTML("fa-bookmark", "No favorites yet",
          "Novels you bookmark will be saved here so you can find them again quickly.", "library.html", "Browse the Library");
        return;
      }
      grid.innerHTML = novels.map(function (n) { return novelCardHTML(n, { removable: true }); }).join("");
      grid.querySelectorAll("[data-remove-fav]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var id = btn.getAttribute("data-remove-fav");
          var dd = loadDB();
          dd.favorites = dd.favorites.filter(function (f) { return f !== id; });
          saveDB(dd);
          render();
        });
      });
    }
    render();
  }

  /* ------------------------------------------------------------------ *
   *  Page: history.html
   * ------------------------------------------------------------------ */

  function pageHistory() {
    var chipFilter = document.getElementById("history-chips");
    var list = document.getElementById("history-list");
    var state = { filter: "all" };

    function render() {
      var d = loadDB();
      var items = d.history.slice().sort(function (a, b) { return b.lastReadAt - a.lastReadAt; });
      if (state.filter !== "all") items = items.filter(function (h) { return h.status === state.filter; });

      if (!items.length) {
        list.innerHTML = emptyStateHTML("fa-clock-rotate-left", "No reading history yet",
          "Chapters you open will be tracked here automatically so you can pick up where you left off.",
          "library.html", "Browse the Library");
        return;
      }

      list.innerHTML = items.map(function (h) {
        var novel = d.novels.filter(function (n) { return n.id === h.novelId; })[0];
        if (!novel) return "";
        var ch = d.chapters.filter(function (c) { return c.id === h.chapterId; })[0];
        var statusLabel = h.status === "completed" ? "Completed" : h.status === "paused" ? "Paused" : "Reading";
        return (
          '<a href="reading.html?novel=' + encodeURIComponent(novel.id) + "&chapter=" + encodeURIComponent(h.chapterId) + '" class="history-item" style="text-decoration:none;">' +
          '<div class="history-cover" ' + coverStyle(novel) + "></div>" +
          '<div class="history-body">' +
          '<div class="history-title">' + escapeHtml(novel.title) + "</div>" +
          '<div class="history-chapter">Last read: ' + escapeHtml(ch ? ch.title : "—") + " — " + timeAgo(h.lastReadAt) + "</div>" +
          '<div class="progress-bar"><div class="progress-fill" style="width:' + (h.progress || 0) + '%"></div></div>' +
          "</div>" +
          '<span class="history-status' + (h.status === "reading" ? " reading" : "") + '">' + statusLabel + "</span>" +
          "</a>"
        );
      }).join("");
    }

    if (chipFilter) chipFilter.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        chipFilter.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        var map = { All: "all", Reading: "reading", Completed: "completed", Paused: "paused" };
        state.filter = map[chip.textContent.trim()] || "all";
        render();
      });
    });

    render();
  }

  /* ------------------------------------------------------------------ *
   *  Page: profile.html
   * ------------------------------------------------------------------ */

  function pageProfile() {
    var db = loadDB();
    document.getElementById("profile-avatar").textContent = (db.user.username || "U").slice(0, 2).toUpperCase();
    document.getElementById("profile-name").textContent = db.user.username || "Guest";
    document.getElementById("profile-handle").textContent = db.user.handle || "@guest";
    document.getElementById("profile-bio").textContent = db.user.bio || "No bio added yet.";

    var novelsRead = new Set(db.history.map(function (h) { return h.novelId; })).size;
    document.getElementById("stat-novels").textContent = novelsRead;
    document.getElementById("stat-chapters").textContent = db.readChapters.length;
    document.getElementById("stat-tickets").textContent = db.tickets || 0;

    var wrap = document.getElementById("recent-read-wrap");
    var items = db.history.slice().sort(function (a, b) { return b.lastReadAt - a.lastReadAt; }).slice(0, 4);
    if (!items.length) {
      wrap.innerHTML = emptyStateHTML("fa-book-open", "Nothing read yet",
        "Start a novel and it'll show up here for quick access.", "library.html", "Browse the Library");
      return;
    }
    wrap.innerHTML = '<div class="rank-list">' + items.map(function (h) {
      var novel = db.novels.filter(function (n) { return n.id === h.novelId; })[0];
      if (!novel) return "";
      var chs = novelChapters(db, novel.id);
      var pos = chs.findIndex(function (c) { return c.id === h.chapterId; });
      return (
        '<a href="reading.html?novel=' + encodeURIComponent(novel.id) + "&chapter=" + encodeURIComponent(h.chapterId) + '" class="recent-row" style="text-decoration:none;">' +
        '<div class="recent-cover" ' + coverStyle(novel) + "></div>" +
        '<div class="recent-title">' + escapeHtml(novel.title) + "</div>" +
        '<div class="recent-progress">Ch. ' + (pos + 1) + " of " + chs.length + "</div>" +
        "</a>"
      );
    }).join("") + "</div>";
  }

  /* ------------------------------------------------------------------ *
   *  Page: rankings.html
   * ------------------------------------------------------------------ */

  function pageRankings() {
    var wrap = document.getElementById("rankings-wrap");
    var tabs = document.getElementById("rankings-tabs");

    function render() {
      var db = loadDB();
      if (db.tickets > 0 && db.user.username) {
        wrap.innerHTML =
          '<div class="ranking-list"><div class="ranking-row top3">' +
          '<span class="ranking-index">1</span>' +
          '<div class="ranking-cover"></div>' +
          '<div class="ranking-info"><div class="ranking-title">' + escapeHtml(db.user.username) + '</div><div class="ranking-genres">You, ranked on this device</div></div>' +
          '<div class="ranking-tickets"><strong>' + db.tickets + '</strong><span>Tickets</span></div>' +
          "</div></div>";
      } else {
        wrap.innerHTML = emptyStateHTML("fa-ranking-star", "No rankings yet",
          "Read a few chapters to start earning tickets — you'll show up on the leaderboard here.");
      }
    }

    if (tabs) tabs.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        tabs.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        render();
      });
    });

    render();
  }

  /* ------------------------------------------------------------------ *
   *  Page: settings.html
   * ------------------------------------------------------------------ */

  function pageSettings() {
    var db = loadDB();

    var fontSelect = document.getElementById("setting-font-size");
    if (fontSelect) {
      fontSelect.value = db.settings.fontSize === "small" ? "Small" : db.settings.fontSize === "large" ? "Large" : "Medium";
      fontSelect.addEventListener("change", function () {
        var d = loadDB();
        d.settings.fontSize = fontSelect.value.toLowerCase();
        saveDB(d);
      });
    }

    function wireToggle(id, key) {
      var el = document.getElementById(id);
      if (!el) return;
      function paint() {
        el.classList.toggle("on", !!loadDB().settings[key]);
      }
      paint();
      el.addEventListener("click", function () {
        var d = loadDB();
        d.settings[key] = !d.settings[key];
        saveDB(d);
        paint();
      });
    }
    wireToggle("setting-autoscroll", "autoScroll");
    wireToggle("setting-savehistory", "saveHistory");

    var emailDesc = document.getElementById("account-email-desc");
    var emailBtn = document.getElementById("account-email-btn");
    if (emailBtn) {
      emailDesc.textContent = db.user.email || "No email on file";
      emailBtn.addEventListener("click", function () {
        var val = window.prompt("Enter a new email address:", db.user.email || "");
        if (val === null) return;
        var d = loadDB();
        d.user.email = val.trim();
        saveDB(d);
        emailDesc.textContent = d.user.email || "No email on file";
      });
    }

    var pwDesc = document.getElementById("account-password-desc");
    var pwBtn = document.getElementById("account-password-btn");
    if (pwBtn) {
      pwDesc.textContent = db.user.password ? "Password set" : "Not set";
      pwBtn.addEventListener("click", function () {
        var val = window.prompt("Enter a new password:");
        if (!val) return;
        var d = loadDB();
        d.user.password = val;
        saveDB(d);
        pwDesc.textContent = "Password set";
      });
    }

    var delBtn = document.getElementById("account-delete-btn");
    if (delBtn) delBtn.addEventListener("click", function () {
      if (!window.confirm("Delete your account and all local reading data? This can't be undone.")) return;
      localStorage.removeItem(DB_KEY);
      window.location.href = "index.html";
    });
  }

  /* ------------------------------------------------------------------ *
   *  Boot
   * ------------------------------------------------------------------ */

  document.addEventListener("DOMContentLoaded", function () {
    var db = loadDB();
    renderAuthSlot(db);
    initAdNotice(db);

    var page = document.body.getAttribute("data-page");
    var pages = {
      home: pageHome,
      login: pageLogin,
      library: pageLibrary,
      "novel-detail": pageNovelDetail,
      "novel-edit": pageNovelEdit,
      reading: pageReading,
      favorites: pageFavorites,
      history: pageHistory,
      profile: pageProfile,
      rankings: pageRankings,
      settings: pageSettings
    };
    if (page && pages[page]) pages[page]();
  });

  window.SECTiON = { GENRES: GENRES, loadDB: loadDB, saveDB: saveDB, uid: uid };
})();

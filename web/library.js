'use strict';

(function () {
  const LibraryPage = {
    elements: {},
    items: [],
    savedHandler: null,
    trackChangeHandler: null,
    stateChangeHandler: null,

    mount(container) {
      const tpl = document.getElementById('tpl-library');
      const node = tpl.content.firstElementChild.cloneNode(true);
      container.appendChild(node);

      this.elements = {
        root: node,
        list: node.querySelector('.recording-list'),
        empty: node.querySelector('.empty-state'),
        refresh: node.querySelector('.refresh-btn'),
      };

      this.elements.refresh.addEventListener('click', () => this.refresh());

      this.savedHandler = () => this.refresh();
      window.addEventListener('recording-saved', this.savedHandler);

      this.trackChangeHandler = () => this.render();
      this.stateChangeHandler = () => this.render();
      window.addEventListener('player:track-change', this.trackChangeHandler);
      window.addEventListener('player:state-change', this.stateChangeHandler);

      this.refresh();
    },

    unmount() {
      if (this.savedHandler) window.removeEventListener('recording-saved', this.savedHandler);
      if (this.trackChangeHandler) window.removeEventListener('player:track-change', this.trackChangeHandler);
      if (this.stateChangeHandler) window.removeEventListener('player:state-change', this.stateChangeHandler);
      this.savedHandler = null;
      this.trackChangeHandler = null;
      this.stateChangeHandler = null;
    },

    async refresh() {
      try {
        this.items = await window.recorderAPI.list();
      } catch (err) {
        console.error('list failed:', err);
        this.items = [];
      }
      this.render();
    },

    formatDuration(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    },

    formatBytes(b) {
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    },

    formatDate(iso) {
      try {
        return new Date(iso).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
      } catch {
        return iso;
      }
    },

    playButtonSVG() {
      return '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
    },

    eqGlyph() {
      return '<span class="eq-glyph" aria-hidden="true"><i></i><i></i><i></i></span>';
    },

    render() {
      const { list, empty } = this.elements;
      list.innerHTML = '';

      if (this.items.length === 0) {
        empty.hidden = false;
        return;
      }
      empty.hidden = true;

      const currentFile = window.Player.currentFilename();
      const isPlaying = window.Player.isPlaying();

      this.items.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'recording-row';
        li.dataset.filename = item.filename;
        const isCurrent = item.filename === currentFile;
        if (isCurrent) li.classList.add('is-current');
        if (isCurrent && isPlaying) li.classList.add('is-playing');

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'row-play';
        playBtn.title = isCurrent && isPlaying ? 'Pause' : 'Play';
        playBtn.innerHTML = isCurrent && isPlaying ? this.eqGlyph() : this.playButtonSVG();
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handlePlayClick(item, idx);
        });

        const info = document.createElement('div');
        info.className = 'row-info';
        const name = document.createElement('div');
        name.className = 'row-title';
        name.textContent = item.filename.replace(/\.webm$/, '');
        name.title = item.filename;
        const sub = document.createElement('div');
        sub.className = 'row-sub';
        sub.textContent = `${this.formatDate(item.createdAt)} • ${this.formatBytes(item.sizeBytes)}`;
        info.appendChild(name);
        info.appendChild(sub);

        const dur = document.createElement('div');
        dur.className = 'row-duration';
        dur.textContent = this.formatDuration(item.durationMs);

        const actions = document.createElement('div');
        actions.className = 'row-actions';
        const revealBtn = document.createElement('button');
        revealBtn.type = 'button';
        revealBtn.className = 'icon-btn';
        revealBtn.title = 'Reveal in Finder';
        revealBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';
        revealBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.recorderAPI.reveal(item.filename);
        });
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'icon-btn danger';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${item.filename}"? This cannot be undone.`)) return;
          try {
            await window.recorderAPI.delete(item.filename);
            window.Player.removeFromQueue(item.filename);
            await this.refresh();
          } catch (err) {
            console.error('delete failed:', err);
            alert('Delete failed: ' + (err.message || err));
          }
        });
        actions.appendChild(revealBtn);
        actions.appendChild(delBtn);

        li.appendChild(playBtn);
        li.appendChild(info);
        li.appendChild(dur);
        li.appendChild(actions);

        li.addEventListener('click', () => this.handlePlayClick(item, idx));

        list.appendChild(li);
      });
    },

    handlePlayClick(item, idx) {
      const currentFile = window.Player.currentFilename();
      if (item.filename === currentFile) {
        window.Player.togglePlay();
      } else {
        window.Player.playFromList(this.items, idx);
      }
    },
  };

  window.LibraryPage = LibraryPage;
})();

'use strict';

(function () {
  const LibraryPage = {
    elements: {},
    items: [],
    selected: null,
    savedHandler: null,

    mount(container) {
      const tpl = document.getElementById('tpl-library');
      const node = tpl.content.firstElementChild.cloneNode(true);
      container.appendChild(node);

      this.elements = {
        root: node,
        list: node.querySelector('.recording-list'),
        empty: node.querySelector('.empty-state'),
        refresh: node.querySelector('.refresh-btn'),
        playerPane: node.querySelector('.player-pane'),
        playerTitle: node.querySelector('.player-title'),
        playerMeta: node.querySelector('.player-meta'),
        player: node.querySelector('.player'),
        closePlayer: node.querySelector('.close-player'),
      };

      this.elements.refresh.addEventListener('click', () => this.refresh());
      this.elements.closePlayer.addEventListener('click', () => this.closePlayer());

      this.savedHandler = () => this.refresh();
      window.addEventListener('recording-saved', this.savedHandler);

      this.refresh();
    },

    unmount() {
      if (this.savedHandler) {
        window.removeEventListener('recording-saved', this.savedHandler);
        this.savedHandler = null;
      }
      if (this.elements.player) {
        this.elements.player.pause();
        this.elements.player.removeAttribute('src');
        this.elements.player.load();
      }
      this.selected = null;
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
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return iso;
      }
    },

    render() {
      const { list, empty } = this.elements;
      list.innerHTML = '';

      if (this.items.length === 0) {
        empty.hidden = false;
        return;
      }
      empty.hidden = true;

      for (const item of this.items) {
        const li = document.createElement('li');
        li.className = 'recording-row';
        if (this.selected === item.filename) li.classList.add('active');
        li.dataset.filename = item.filename;

        const name = document.createElement('div');
        name.className = 'col-name';
        name.textContent = item.filename;
        name.title = item.filename;

        const dur = document.createElement('div');
        dur.className = 'col-meta';
        dur.textContent = this.formatDuration(item.durationMs);

        const size = document.createElement('div');
        size.className = 'col-meta';
        size.textContent = this.formatBytes(item.sizeBytes);

        const date = document.createElement('div');
        date.className = 'col-meta';
        date.textContent = this.formatDate(item.createdAt);

        const actions = document.createElement('div');
        actions.className = 'row-actions';
        const revealBtn = document.createElement('button');
        revealBtn.type = 'button';
        revealBtn.className = 'icon-btn';
        revealBtn.textContent = 'Reveal';
        revealBtn.title = 'Reveal in Finder';
        revealBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.recorderAPI.reveal(item.filename);
        });
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'icon-btn danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${item.filename}"? This cannot be undone.`)) return;
          try {
            await window.recorderAPI.delete(item.filename);
            if (this.selected === item.filename) this.closePlayer();
            await this.refresh();
          } catch (err) {
            console.error('delete failed:', err);
            alert('Delete failed: ' + (err.message || err));
          }
        });
        actions.appendChild(revealBtn);
        actions.appendChild(delBtn);

        li.appendChild(name);
        li.appendChild(dur);
        li.appendChild(size);
        li.appendChild(date);
        li.appendChild(actions);

        li.addEventListener('click', () => this.play(item));

        list.appendChild(li);
      }
    },

    play(item) {
      this.selected = item.filename;
      const { playerPane, playerTitle, playerMeta, player } = this.elements;
      playerPane.hidden = false;
      playerTitle.textContent = item.filename;
      playerMeta.textContent = `${this.formatDuration(item.durationMs)} - ${this.formatBytes(item.sizeBytes)} - ${this.formatDate(item.createdAt)}`;
      player.src = window.recorderAPI.fileUrl(item.filename);
      player.play().catch((err) => console.warn('autoplay blocked or failed:', err));
      this.render();
    },

    closePlayer() {
      const { playerPane, player } = this.elements;
      player.pause();
      player.removeAttribute('src');
      player.load();
      playerPane.hidden = true;
      this.selected = null;
      this.render();
    },
  };

  window.LibraryPage = LibraryPage;
})();

'use strict';

(function () {
  const Player = {
    queue: [],
    index: -1,
    audio: null,
    bar: null,
    els: {},
    seekDragging: false,

    init() {
      this.bar = document.getElementById('player-bar');
      this.audio = this.bar.querySelector('audio');
      this.els = {
        title: this.bar.querySelector('.pb-title'),
        meta: this.bar.querySelector('.pb-meta'),
        play: this.bar.querySelector('.pb-play'),
        prev: this.bar.querySelector('.pb-prev'),
        next: this.bar.querySelector('.pb-next'),
        elapsed: this.bar.querySelector('.pb-elapsed'),
        total: this.bar.querySelector('.pb-total'),
        scrub: this.bar.querySelector('.pb-scrub'),
        scrubFill: this.bar.querySelector('.pb-scrub-fill'),
        volIcon: this.bar.querySelector('.pb-vol-icon'),
        vol: this.bar.querySelector('.pb-vol'),
        volFill: this.bar.querySelector('.pb-vol-fill'),
      };

      this.els.play.addEventListener('click', () => this.togglePlay());
      this.els.prev.addEventListener('click', () => this.prev());
      this.els.next.addEventListener('click', () => this.next());

      this.audio.addEventListener('timeupdate', () => this.renderProgress());
      this.audio.addEventListener('loadedmetadata', () => this.renderProgress());
      this.audio.addEventListener('ended', () => this.next());
      this.audio.addEventListener('play', () => this.renderPlayState());
      this.audio.addEventListener('pause', () => this.renderPlayState());

      this.els.scrub.addEventListener('mousedown', (e) => this.startSeek(e));
      window.addEventListener('mousemove', (e) => this.seekDragging && this.doSeek(e));
      window.addEventListener('mouseup', () => (this.seekDragging = false));

      this.els.vol.addEventListener('click', (e) => this.handleVolClick(e));

      const savedVol = parseFloat(localStorage.getItem('player.volume'));
      this.audio.volume = isFinite(savedVol) ? Math.max(0, Math.min(1, savedVol)) : 0.9;
      this.renderVolume();

      this.bar.hidden = true;
    },

    playFromList(items, startIndex) {
      this.queue = items.slice();
      this.index = startIndex;
      this.loadCurrent(true);
    },

    loadCurrent(autoplay) {
      const item = this.queue[this.index];
      if (!item) {
        this.bar.hidden = true;
        return;
      }
      this.bar.hidden = false;
      this.audio.src = window.recorderAPI.fileUrl(item.filename);
      this.els.title.textContent = item.filename.replace(/\.webm$/, '');
      this.els.meta.textContent = this.formatMeta(item);
      this.renderProgress();
      this.emitTrackChange();
      if (autoplay) {
        this.audio.play().catch((e) => console.warn('autoplay blocked:', e));
      }
    },

    togglePlay() {
      if (this.index < 0) return;
      if (this.audio.paused) this.audio.play().catch(() => {});
      else this.audio.pause();
    },

    prev() {
      if (this.audio.currentTime > 3) {
        this.audio.currentTime = 0;
        return;
      }
      if (this.index > 0) {
        this.index -= 1;
        this.loadCurrent(true);
      } else {
        this.audio.currentTime = 0;
      }
    },

    next() {
      if (this.index < this.queue.length - 1) {
        this.index += 1;
        this.loadCurrent(true);
      } else {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.renderProgress();
      }
    },

    removeFromQueue(filename) {
      const i = this.queue.findIndex((x) => x.filename === filename);
      if (i < 0) return;
      const wasCurrent = i === this.index;
      this.queue.splice(i, 1);
      if (wasCurrent) {
        if (this.queue.length === 0) {
          this.audio.pause();
          this.audio.src = '';
          this.index = -1;
          this.bar.hidden = true;
        } else {
          this.index = Math.min(this.index, this.queue.length - 1);
          this.loadCurrent(true);
        }
      } else if (i < this.index) {
        this.index -= 1;
      }
      this.emitTrackChange();
    },

    currentFilename() {
      return this.queue[this.index]?.filename || null;
    },

    isPlaying() {
      return !this.audio.paused;
    },

    formatTime(s) {
      if (!isFinite(s)) return '0:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    },

    formatMeta(item) {
      const dur = isFinite(item.durationMs) ? this.formatTime(item.durationMs / 1000) : '0:00';
      const date = new Date(item.createdAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      return `${dur} • ${date}`;
    },

    renderProgress() {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || (this.queue[this.index]?.durationMs / 1000) || 0;
      const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
      this.els.scrubFill.style.width = pct + '%';
      this.els.elapsed.textContent = this.formatTime(cur);
      this.els.total.textContent = this.formatTime(dur);
    },

    renderPlayState() {
      this.els.play.dataset.state = this.audio.paused ? 'paused' : 'playing';
      this.els.play.setAttribute('aria-label', this.audio.paused ? 'Play' : 'Pause');
      this.emitStateChange();
    },

    renderVolume() {
      const v = this.audio.volume;
      this.els.volFill.style.width = (v * 100) + '%';
      this.els.volIcon.dataset.muted = v === 0 ? 'true' : 'false';
    },

    startSeek(e) {
      this.seekDragging = true;
      this.doSeek(e);
    },

    doSeek(e) {
      const r = this.els.scrub.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const dur = this.audio.duration || 0;
      if (dur > 0) this.audio.currentTime = pct * dur;
      this.renderProgress();
    },

    handleVolClick(e) {
      const r = this.els.vol.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.audio.volume = pct;
      localStorage.setItem('player.volume', String(pct));
      this.renderVolume();
    },

    emitTrackChange() {
      window.dispatchEvent(new CustomEvent('player:track-change', {
        detail: { filename: this.currentFilename() },
      }));
    },

    emitStateChange() {
      window.dispatchEvent(new CustomEvent('player:state-change', {
        detail: { filename: this.currentFilename(), playing: this.isPlaying() },
      }));
    },
  };

  window.Player = Player;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Player.init());
  } else {
    Player.init();
  }
})();

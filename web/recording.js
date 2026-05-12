'use strict';

(function () {
  const RecordingPage = {
    state: 'idle',
    mediaStream: null,
    audioOnlyStream: null,
    recorder: null,
    chunks: [],
    startedAt: 0,
    timerHandle: null,
    elements: {},

    mount(container) {
      const tpl = document.getElementById('tpl-recording');
      const node = tpl.content.firstElementChild.cloneNode(true);
      container.appendChild(node);

      this.elements = {
        root: node,
        dot: node.querySelector('.dot'),
        statusText: node.querySelector('.status-text'),
        timer: node.querySelector('.timer'),
        button: node.querySelector('.record-btn'),
        error: node.querySelector('.error'),
      };

      this.elements.button.addEventListener('click', () => this.toggle());
      this.render();
    },

    unmount() {
      if (this.timerHandle) {
        clearInterval(this.timerHandle);
        this.timerHandle = null;
      }
    },

    showError(msg) {
      this.elements.error.hidden = !msg;
      this.elements.error.textContent = msg || '';
    },

    formatTime(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const m = String(Math.floor(total / 60)).padStart(2, '0');
      const s = String(total % 60).padStart(2, '0');
      return `${m}:${s}`;
    },

    render() {
      const { dot, statusText, button, timer } = this.elements;
      dot.dataset.state = this.state;
      switch (this.state) {
        case 'recording':
          statusText.textContent = 'Recording';
          button.textContent = 'Stop Recording';
          button.dataset.state = 'recording';
          button.disabled = false;
          break;
        case 'saving':
          statusText.textContent = 'Saving...';
          button.textContent = 'Saving...';
          button.dataset.state = 'saving';
          button.disabled = true;
          break;
        default:
          statusText.textContent = 'Idle';
          button.textContent = 'Start Recording';
          button.dataset.state = 'idle';
          button.disabled = false;
          if (!this.recorder) timer.textContent = '00:00';
      }
    },

    async toggle() {
      this.showError('');
      if (this.state === 'recording') {
        await this.stop();
      } else if (this.state === 'idle') {
        await this.start();
      }
    },

    async start() {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error(
            'No system audio captured. In the screen-share dialog, enable "Share audio" and choose to share your entire screen.'
          );
        }

        stream.getVideoTracks().forEach((t) => t.stop());

        const audioOnly = new MediaStream(audioTracks);
        this.mediaStream = stream;
        this.audioOnlyStream = audioOnly;

        const mimeType = 'audio/webm;codecs=opus';
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mimeType)) {
          throw new Error('audio/webm;codecs=opus is not supported in this build.');
        }

        this.chunks = [];
        this.recorder = new MediaRecorder(audioOnly, { mimeType });
        this.recorder.addEventListener('dataavailable', (e) => {
          if (e.data && e.data.size > 0) this.chunks.push(e.data);
        });
        this.recorder.addEventListener('error', (e) => {
          console.error('MediaRecorder error:', e);
          this.showError('Recorder error: ' + ((e.error && e.error.message) || 'unknown'));
        });
        this.recorder.addEventListener('stop', () => this.handleStop());

        audioTracks[0].addEventListener('ended', () => {
          if (this.state === 'recording') this.stop();
        });

        this.recorder.start(1000);
        this.startedAt = Date.now();
        this.state = 'recording';
        this.render();
        this.timerHandle = setInterval(() => {
          this.elements.timer.textContent = this.formatTime(Date.now() - this.startedAt);
        }, 250);
      } catch (err) {
        console.error('start failed:', err);
        this.cleanupStreams();
        this.state = 'idle';
        this.render();
        if (err && err.name === 'NotAllowedError') {
          this.showError('Permission denied. You must allow screen sharing to capture system audio.');
        } else {
          this.showError(err.message || String(err));
        }
      }
    },

    async stop() {
      if (!this.recorder || this.recorder.state === 'inactive') return;
      this.state = 'saving';
      this.render();
      this.recorder.stop();
    },

    cleanupStreams() {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop());
        this.mediaStream = null;
      }
      if (this.audioOnlyStream) {
        this.audioOnlyStream.getTracks().forEach((t) => t.stop());
        this.audioOnlyStream = null;
      }
    },

    async handleStop() {
      const durationMs = Date.now() - this.startedAt;
      const blob = new Blob(this.chunks, { type: 'audio/webm' });
      this.chunks = [];

      if (this.timerHandle) {
        clearInterval(this.timerHandle);
        this.timerHandle = null;
      }
      this.cleanupStreams();
      this.recorder = null;

      try {
        if (blob.size === 0) throw new Error('Empty recording (no audio data captured).');
        const buffer = await blob.arrayBuffer();
        const entry = await window.recorderAPI.save(buffer, durationMs);
        console.log('Saved:', entry);
        window.dispatchEvent(new CustomEvent('recording-saved', { detail: entry }));
      } catch (err) {
        console.error('save failed:', err);
        this.showError('Failed to save recording: ' + (err.message || err));
      } finally {
        this.state = 'idle';
        this.elements.timer.textContent = '00:00';
        this.render();
      }
    },
  };

  window.RecordingPage = RecordingPage;
})();

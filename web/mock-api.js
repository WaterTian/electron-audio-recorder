'use strict';

(function () {
  const fakeItems = [
    {
      filename: 'recording-2026-05-11T22-15-04.webm',
      durationMs: 142000,
      sizeBytes: 1820000,
      createdAt: '2026-05-11T14:15:04Z',
      src: 'samples/01.webm',
    },
    {
      filename: 'recording-2026-05-10T11-30-18.webm',
      durationMs: 87000,
      sizeBytes: 1100000,
      createdAt: '2026-05-10T03:30:18Z',
      src: 'samples/02.webm',
    },
    {
      filename: 'recording-2026-05-09T08-44-22.webm',
      durationMs: 215000,
      sizeBytes: 2780000,
      createdAt: '2026-05-09T00:44:22Z',
      src: 'samples/01.webm',
    },
    {
      filename: 'recording-2026-05-08T19-02-55.webm',
      durationMs: 63000,
      sizeBytes: 810000,
      createdAt: '2026-05-08T11:02:55Z',
      src: 'samples/02.webm',
    },
    {
      filename: 'recording-2026-05-07T14-21-09.webm',
      durationMs: 312000,
      sizeBytes: 4050000,
      createdAt: '2026-05-07T06:21:09Z',
      src: 'samples/01.webm',
    },
  ];

  let items = fakeItems.slice();

  window.recorderAPI = {
    list: async () => items.slice(),
    fileUrl: (name) => items.find((s) => s.filename === name)?.src || '',
    reveal: () => {
      flash('"Reveal in Finder" is Mac-only.');
      return false;
    },
    delete: async (name) => {
      const i = items.findIndex((s) => s.filename === name);
      if (i >= 0) items.splice(i, 1);
      return true;
    },
    save: async () => {
      throw new Error('Recording is Mac-only.');
    },
  };

  // Patch RecordingPage so clicking Start shows a friendly demo notice
  function patchRecording() {
    if (!window.RecordingPage) return false;
    window.RecordingPage.start = async function () {
      this.showError(
        'Recording requires the Mac app — system-audio capture is not available in the browser. Download the .dmg from the GitHub release linked in the header.'
      );
    };
    return true;
  }
  if (!patchRecording()) {
    // RecordingPage isn't defined yet — retry on next tick
    queueMicrotask(patchRecording);
  }

  // Mark body so CSS can adjust for web-mode chrome (no macOS traffic lights)
  document.body.classList.add('web');

  function flash(msg) {
    let n = document.getElementById('web-flash');
    if (!n) {
      n = document.createElement('div');
      n.id = 'web-flash';
      document.body.appendChild(n);
    }
    n.textContent = msg;
    n.classList.add('show');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => n.classList.remove('show'), 2400);
  }
  window.__webFlash = flash;

  document.title = 'Audio Recorder — Web Demo';
})();

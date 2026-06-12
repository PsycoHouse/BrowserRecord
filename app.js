const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const statusText = document.querySelector('#statusText');
const recordingPulse = document.querySelector('#recordingPulse');
const errorBox = document.querySelector('#errorBox');
const saveLocation = document.querySelector('#saveLocation');
const timer = document.querySelector('#timer');
const levelMeter = document.querySelector('#levelMeter');
const recordingsList = document.querySelector('#recordingsList');
const recordingCount = document.querySelector('#recordingCount');
const recordingTemplate = document.querySelector('#recordingTemplate');

const canvasContext = levelMeter.getContext('2d');
let mediaRecorder;
let audioStream;
let audioContext;
let analyser;
let animationFrameId;
let timerIntervalId;
let recordingStartedAt = 0;
let audioChunks = [];
let recordings = [];

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function setRecordingUi(isRecording) {
  startButton.disabled = isRecording;
  stopButton.disabled = !isRecording;
  recordingPulse.classList.toggle('recording', isRecording);
  statusText.textContent = isRecording ? 'Aufnahme läuft …' : 'Bereit für die Aufnahme';
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateTimer() {
  timer.textContent = formatDuration(Date.now() - recordingStartedAt);
}

function drawIdleMeter() {
  const { width, height } = levelMeter;
  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = 'rgba(255, 255, 255, 0.08)';

  for (let i = 0; i < 34; i += 1) {
    const barHeight = 14 + Math.sin(i * 0.8) * 8;
    const x = i * (width / 34) + 6;
    canvasContext.fillRect(x, (height - barHeight) / 2, 8, barHeight);
  }
}

function drawLiveMeter() {
  if (!analyser) {
    drawIdleMeter();
    return;
  }

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  const { width, height } = levelMeter;
  canvasContext.clearRect(0, 0, width, height);

  const gradient = canvasContext.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#7c5cff');
  gradient.addColorStop(1, '#26d9c5');
  canvasContext.fillStyle = gradient;

  const barWidth = width / 64;
  for (let i = 0; i < 64; i += 1) {
    const value = data[i] / 255;
    const barHeight = Math.max(8, value * height * 0.9);
    canvasContext.fillRect(i * barWidth, height - barHeight, Math.max(4, barWidth - 4), barHeight);
  }

  animationFrameId = requestAnimationFrame(drawLiveMeter);
}

function getSupportedMimeType() {
  const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function getFileExtension(mimeType) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function createFilename(extension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `browserrecord-${timestamp}.${extension}`;
}

function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateRecordingsList() {
  recordingCount.textContent = `${recordings.length} ${recordings.length === 1 ? 'Datei' : 'Dateien'}`;
  recordingsList.innerHTML = '';

  if (recordings.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Starte eine Aufnahme, um hier deine Audiodateien zu sehen.';
    recordingsList.append(emptyState);
    return;
  }

  recordings.forEach((recording, index) => {
    const item = recordingTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector('h3').textContent = `Aufnahme ${recordings.length - index}`;
    item.querySelector('.recording-meta').textContent = `${recording.filename} · ${recording.duration} · ${humanFileSize(recording.blob.size)}`;

    const audio = item.querySelector('audio');
    audio.src = recording.url;

    const downloadLink = item.querySelector('a');
    downloadLink.href = recording.url;
    downloadLink.download = recording.filename;
    downloadLink.textContent = 'Speichern';
    downloadLink.addEventListener('click', () => {
      saveLocation.textContent = `„${recording.filename}“ wird in deinem Browser-Download-Ordner gespeichert. Den exakten Ordner zeigt dein Browser in den Download-Einstellungen an.`;
    });

    recordingsList.append(item);
  });
}

function stopAudioTracks() {
  audioStream?.getTracks().forEach((track) => track.stop());
  audioStream = undefined;
}

function stopVisuals() {
  cancelAnimationFrame(animationFrameId);
  clearInterval(timerIntervalId);
  audioContext?.close();
  audioContext = undefined;
  analyser = undefined;
  drawIdleMeter();
}

async function startRecording() {
  clearError();

  if (!navigator.mediaDevices?.getUserMedia) {
    showError('Dein Browser unterstützt keine Mikrofonaufnahme. Bitte nutze eine aktuelle Version von Chrome, Edge, Firefox oder Safari.');
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    showError('Die MediaRecorder-Schnittstelle ist in diesem Browser nicht verfügbar. Bitte aktualisiere deinen Browser oder wechsle zu einem unterstützten Browser.');
    return;
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    audioChunks = [];

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener('stop', handleRecordingStop, { once: true });

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error('AudioContext wird von diesem Browser nicht unterstützt.');
    }

    audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(audioStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);

    recordingStartedAt = Date.now();
    timerIntervalId = window.setInterval(updateTimer, 250);
    updateTimer();
    setRecordingUi(true);
    mediaRecorder.start();
    drawLiveMeter();
  } catch (error) {
    stopAudioTracks();
    stopVisuals();
    setRecordingUi(false);

    if (error.name === 'NotAllowedError') {
      showError('Mikrofonzugriff wurde verweigert. Erlaube den Zugriff in der Adressleiste oder in den Website-Einstellungen und versuche es erneut.');
    } else if (error.name === 'NotFoundError') {
      showError('Es wurde kein Mikrofon gefunden. Schließe ein Mikrofon an oder prüfe die Systemeinstellungen.');
    } else if (error.name === 'NotReadableError') {
      showError('Das Mikrofon kann gerade nicht verwendet werden. Schließe andere Apps, die das Mikrofon benutzen, und versuche es erneut.');
    } else {
      showError(`Die Aufnahme konnte nicht gestartet werden: ${error.message || 'Unbekannter Fehler'}`);
    }
  }
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') {
    statusText.textContent = 'Aufnahme wird verarbeitet …';
    mediaRecorder.stop();
  }
}

function handleRecordingStop() {
  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  const blob = new Blob(audioChunks, { type: mimeType });
  const extension = getFileExtension(mimeType);
  const filename = createFilename(extension);
  const url = URL.createObjectURL(blob);
  const duration = formatDuration(Date.now() - recordingStartedAt);

  recordings.unshift({ blob, duration, filename, url });
  saveLocation.textContent = `Die neue Datei heißt „${filename}“. Klicke auf „Speichern“; dein Browser legt sie danach im eingestellten Download-Ordner ab.`;

  stopAudioTracks();
  stopVisuals();
  setRecordingUi(false);
  timer.textContent = '00:00';
  updateRecordingsList();
}

startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);

drawIdleMeter();
updateRecordingsList();

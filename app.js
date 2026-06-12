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
const audioSourceInputs = document.querySelectorAll('input[name="audioSource"]');

const canvasContext = levelMeter.getContext('2d');
let mediaRecorder;
let audioStream;
let displayStream;
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
  audioSourceInputs.forEach((input) => {
    input.disabled = isRecording;
  });
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
  canvasContext.fillStyle = 'rgba(37, 99, 235, 0.14)';

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
  gradient.addColorStop(0, '#2563eb');
  gradient.addColorStop(1, '#0f766e');
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

function createFilename(extension, sourceType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sourceLabel = {
    microphone: 'mikrofon',
    tab: 'tab-audio',
    'tab-microphone': 'tab-und-mikrofon',
  }[sourceType] || 'aufnahme';

  return `browserrecord-${sourceLabel}-${timestamp}.${extension}`;
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

function stopStreamTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function stopAudioTracks() {
  stopStreamTracks(audioStream);
  stopStreamTracks(displayStream);
  audioStream = undefined;
  displayStream = undefined;
}

function stopVisuals() {
  cancelAnimationFrame(animationFrameId);
  clearInterval(timerIntervalId);
  audioContext?.close();
  audioContext = undefined;
  analyser = undefined;
  drawIdleMeter();
}

function getSelectedSourceType() {
  return document.querySelector('input[name="audioSource"]:checked')?.value || 'microphone';
}

function ensureAudioTracks(stream, sourceType) {
  if (stream.getAudioTracks().length > 0) return;

  stopStreamTracks(stream);

  if (sourceType === 'microphone') {
    throw new Error('Es wurde kein Mikrofon-Audiosignal gefunden.');
  }

  throw new Error('Die ausgewählte Freigabe enthält kein Audiosignal. Wähle im Browser-Dialog einen Tab oder Bildschirm mit aktivierter Audiofreigabe.');
}

async function getDisplayAudioStream() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Dein Browser unterstützt keine Tab-, Fenster- oder Systemaudio-Aufnahme. Bitte nutze eine aktuelle Version von Chrome oder Edge.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  ensureAudioTracks(stream, 'tab');
  return stream;
}

function createRecorderStream(sourceType) {
  audioContext = new AudioContextConstructor();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 128;

  const destination = audioContext.createMediaStreamDestination();
  const streamsToMix = sourceType === 'tab-microphone' ? [displayStream, audioStream] : [audioStream || displayStream];

  streamsToMix.forEach((stream) => {
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    source.connect(destination);
  });

  return destination.stream;
}

const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

async function startRecording() {
  clearError();

  if (!navigator.mediaDevices) {
    showError('Dein Browser unterstützt keine Audioaufnahme. Bitte nutze eine aktuelle Version von Chrome, Edge, Firefox oder Safari.');
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    showError('Die MediaRecorder-Schnittstelle ist in diesem Browser nicht verfügbar. Bitte aktualisiere deinen Browser oder wechsle zu einem unterstützten Browser.');
    return;
  }

  if (!AudioContextConstructor) {
    showError('AudioContext wird von diesem Browser nicht unterstützt. Bitte aktualisiere deinen Browser oder wechsle zu einem unterstützten Browser.');
    return;
  }

  const sourceType = getSelectedSourceType();

  if ((sourceType === 'microphone' || sourceType === 'tab-microphone') && !navigator.mediaDevices.getUserMedia) {
    showError('Dein Browser unterstützt keine Mikrofonaufnahme. Bitte nutze eine aktuelle Version von Chrome, Edge, Firefox oder Safari.');
    return;
  }

  try {
    if (sourceType === 'microphone' || sourceType === 'tab-microphone') {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ensureAudioTracks(audioStream, 'microphone');
    }

    if (sourceType === 'tab' || sourceType === 'tab-microphone') {
      statusText.textContent = 'Warte auf Tab- oder Systemaudio-Freigabe …';
      displayStream = await getDisplayAudioStream();
    }

    const recorderStream = createRecorderStream(sourceType);
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(recorderStream, mimeType ? { mimeType } : undefined);
    audioChunks = [];

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener('stop', () => handleRecordingStop(sourceType), { once: true });

    displayStream?.getAudioTracks().forEach((track) => {
      track.addEventListener('ended', () => stopRecording(), { once: true });
    });

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
      showError('Der Zugriff wurde verweigert. Erlaube Mikrofon- oder Tab-Audio in der Browser-Abfrage und versuche es erneut.');
    } else if (error.name === 'NotFoundError') {
      showError('Es wurde kein passendes Audiogerät oder keine Audiofreigabe gefunden. Prüfe Mikrofon, Tab-Audio und Systemeinstellungen.');
    } else if (error.name === 'NotReadableError') {
      showError('Die Audioquelle kann gerade nicht verwendet werden. Schließe andere Apps, die sie benutzen, und versuche es erneut.');
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

function handleRecordingStop(sourceType) {
  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  const blob = new Blob(audioChunks, { type: mimeType });
  const extension = getFileExtension(mimeType);
  const filename = createFilename(extension, sourceType);
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

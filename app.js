
// ============================================
// SPINNING WHEEL
// ============================================

const DEFAULT_ENTRIES = [
  "Option 1",
  "Option 2",
  "Option 3",
  "Option 4",
  "Option 5",
  "Option 6"
];

const COLORS = [
  "#F94144", "#F3722C", "#F9C74F", "#90BE6D",
  "#43AA8B", "#4D96FF", "#845EC2", "#D65DB1",
  "#FF9671", "#00C9A7", "#FFC75F", "#A3A1FB"
];

const STORAGE_KEY = "spinningWheelEntries";
const SETTINGS_KEY = "spinningWheelSettings";
const DB_NAME = "SpinningWheelAudioDB";
const DB_STORE = "audioFiles";

let entries = loadEntries();
let settings = loadSettings();
let currentRotation = 0;
let isSpinning = false;
let pendingWinnerIndex = null;
let audioDB = null;

const canvas = document.getElementById("wheelCanvas");
const ctx = canvas.getContext("2d");
const wheelShell = document.querySelector(".wheel-shell");

const entryForm = document.getElementById("entryForm");
const entryInput = document.getElementById("entryInput");
const entryList = document.getElementById("entryList");
const entryCount = document.getElementById("entryCount");

const spinBtn = document.getElementById("spinBtn");
const durationSelect = document.getElementById("durationSelect");
const customDuration = document.getElementById("customDuration");
const statusMessage = document.getElementById("statusMessage");

const resultModal = document.getElementById("resultModal");
const resultText = document.getElementById("resultText");
const closeModalBtn = document.getElementById("closeModalBtn");
const okBtn = document.getElementById("okBtn");

const backgroundAudio = document.getElementById("backgroundAudio");
const spinAudio = document.getElementById("spinAudio");
const resultAudio = document.getElementById("resultAudio");

let audioUrls = {
  background: null,
  spin: null,
  result: null
};

let backgroundBlob = null;
let spinBlob = null;
let resultBlob = null;

// ============================================
// LOCAL STORAGE
// ============================================

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      return saved.filter(item => typeof item === "string" && item.trim());
    }
  } catch (error) {
    console.warn("Could not load saved entries.", error);
  }
  return [...DEFAULT_ENTRIES];
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadSettings() {
  const defaults = {
    duration: "5",
    customDuration: "5",
    backgroundVolume: 35,
    spinVolume: 65,
    resultVolume: 75
  };

  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")
    };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ============================================
// AUDIO DATABASE - SAVES UPLOADED AUDIO
// ============================================

function openAudioDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported."));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveAudioToDatabase(key, blob) {
  return new Promise((resolve, reject) => {
    if (!audioDB) {
      reject(new Error("Audio database is not ready."));
      return;
    }

    const transaction = audioDB.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(blob, key);

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function getAudioFromDatabase(key) {
  return new Promise((resolve, reject) => {
    if (!audioDB) {
      resolve(null);
      return;
    }

    const transaction = audioDB.transaction(DB_STORE, "readonly");
    const request = transaction.objectStore(DB_STORE).get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteAudioFromDatabase(key) {
  return new Promise((resolve, reject) => {
    if (!audioDB) {
      resolve();
      return;
    }

    const transaction = audioDB.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).delete(key);

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function setAudioSource(type, blob) {
  const audioElements = {
    background: backgroundAudio,
    spin: spinAudio,
    result: resultAudio
  };

  if (audioUrls[type]) {
    URL.revokeObjectURL(audioUrls[type]);
    audioUrls[type] = null;
  }

  if (!blob) {
    audioElements[type].removeAttribute("src");
    audioElements[type].load();
    return;
  }

  audioUrls[type] = URL.createObjectURL(blob);
  audioElements[type].src = audioUrls[type];
  audioElements[type].load();
}

async function restoreSavedAudio() {
  const types = ["background", "spin", "result"];

  for (const type of types) {
    try {
      const blob = await getAudioFromDatabase(type);
      if (blob) {
        setAudioSource(type, blob);

        if (type === "background") {
          backgroundBlob = blob;
        } else if (type === "spin") {
          spinBlob = blob;
        } else {
          resultBlob = blob;
        }

        updateAudioName(type, blob.name || "Saved audio file");
      }
    } catch (error) {
      console.warn("Could not restore audio:", type, error);
    }
  }
}

function updateAudioName(type, name) {

  const elements = {
    spin: document.getElementById("spinSoundName"),
    result: document.getElementById("resultSoundName")
  };

  if (elements[type]) {
    elements[type].textContent =
      name || (
        type === "spin"
          ? "Using default spinning sound"
          : "Using default result sound"
      );
  }

  if (type === "background") {
    document.getElementById("backgroundToggle").textContent =
      backgroundAudio.paused
        ? "▶ Play music"
        : "⏸ Pause music";
  }
}

// ============================================
// DRAW THE WHEEL
// ============================================

function drawWheel() {
  const width = canvas.width;
  const height = canvas.height;
  const center = width / 2;
  const radius = width / 2;
  const count = entries.length;

  ctx.clearRect(0, 0, width, height);

  if (count === 0) {
    ctx.beginPath();
    ctx.arc(center, center, radius - 3, 0, Math.PI * 2);
    ctx.fillStyle = "#e9e6fa";
    ctx.fill();

    ctx.fillStyle = "#77768b";
    ctx.font = "bold 30px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Add entries", center, center);
    return;
  }

  const angle = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const start = -Math.PI / 2 + i * angle;
    const end = start + angle;

    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();

    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.stroke();

    // Draw text in each section
    const middle = start + angle / 2;
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(middle);

    const maxTextLength = 18;
    let label = entries[i];
    if (label.length > maxTextLength) {
      label = label.substring(0, maxTextLength - 1) + "…";
    }

    const fontSize = Math.max(
      13,
      Math.min(27, 390 / Math.max(count, 8))
    );

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 3;
    ctx.fillText(label, radius * 0.83, 0);

    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(center, center, radius - 4, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.stroke();
}

// ============================================
// ENTRY MANAGEMENT
// ============================================

function renderEntries() {
  entryList.innerHTML = "";

  entryCount.textContent =
    `${entries.length} ${entries.length === 1 ? "item" : "items"}`;

  if (entries.length === 0) {
    entryList.innerHTML =
      '<div class="empty-list">No entries yet. Add some choices above!</div>';
  }

  entries.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "entry-item";

    const color = document.createElement("span");
    color.className = "entry-color";
    color.style.backgroundColor = COLORS[index % COLORS.length];

    const text = document.createElement("span");
    text.className = "entry-text";
    text.textContent = entry;

    const editButton = document.createElement("button");
    editButton.textContent = "Edit";
    editButton.type = "button";
    editButton.addEventListener("click", () => editEntry(index));

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "×";
    deleteButton.className = "delete-entry";
    deleteButton.type = "button";
    deleteButton.title = "Delete entry";
    deleteButton.addEventListener("click", () => deleteEntry(index));

    item.append(color, text, editButton, deleteButton);
    entryList.appendChild(item);
  });

  drawWheel();
  spinBtn.disabled = isSpinning || entries.length < 2;
}

function editEntry(index) {
  if (isSpinning || index >= entries.length) return;

  const updated = prompt("Edit this entry:", entries[index]);

  if (updated === null) return;

  const cleanText = updated.trim();

  if (!cleanText) {
    alert("Entry cannot be empty.");
    return;
  }

  entries[index] = cleanText;
  saveEntries();
  renderEntries();
}

function deleteEntry(index) {
  if (isSpinning || index >= entries.length) return;

  entries.splice(index, 1);
  saveEntries();
  renderEntries();
}

entryForm.addEventListener("submit", event => {
  event.preventDefault();

  if (isSpinning) return;

  const value = entryInput.value.trim();

  if (!value) {
    alert("Please enter some text.");
    return;
  }

  if (entries.length >= 100) {
    alert("Maximum 100 entries allowed.");
    return;
  }

  entries.push(value);
  entryInput.value = "";
  saveEntries();
  renderEntries();
  entryInput.focus();
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (isSpinning) return;

  if (!entries.length) return;

  if (confirm("Are you sure you want to clear all entries?")) {
    entries = [];
    saveEntries();
    renderEntries();
  }
});

document.getElementById("resetBtn").addEventListener("click", () => {
  if (isSpinning) return;

  if (confirm("Restore the original default entries?")) {
    entries = [...DEFAULT_ENTRIES];
    saveEntries();
    renderEntries();
  }
});

// ============================================
// SPIN DURATION
// ============================================

durationSelect.value = settings.duration || "5";
customDuration.value = settings.customDuration || "5";

function updateDurationDisplay() {
  customDuration.classList.toggle(
    "hidden",
    durationSelect.value !== "custom"
  );
}

durationSelect.addEventListener("change", () => {
  settings.duration = durationSelect.value;
  updateDurationDisplay();
  saveSettings();
});

customDuration.addEventListener("change", () => {
  settings.customDuration = customDuration.value;
  saveSettings();
});

updateDurationDisplay();

function getSpinDuration() {
  let seconds;

  if (durationSelect.value === "custom") {
    seconds = Number(customDuration.value);
  } else {
    seconds = Number(durationSelect.value);
  }

  if (!Number.isFinite(seconds) || seconds < 1) {
    seconds = 5;
  }

  return Math.min(seconds, 120);
}

// ============================================
// SPINNING ANIMATION
// ============================================

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function spinWheel() {
  if (isSpinning || entries.length < 2) return;

  // Choose a random winner
  const winnerIndex = Math.floor(Math.random() * entries.length);
  pendingWinnerIndex = winnerIndex;

  const count = entries.length;
  const sectionAngle = 360 / count;

  // Align the selected section with the top pointer
  const desiredRotation = modulo(
    -(winnerIndex + 0.5) * sectionAngle,
    360
  );

  const currentNormalized = modulo(currentRotation, 360);
  const extraRotation = 360 * 6;

  const rotationDifference = modulo(
    desiredRotation - currentNormalized,
    360
  );

  const finalRotation =
    currentRotation + extraRotation + rotationDifference;

  const duration = getSpinDuration();

  isSpinning = true;
  spinBtn.disabled = true;
  durationSelect.disabled = true;
  customDuration.disabled = true;

  // Automatically start background music when spinning begins
if (backgroundAudio.src && backgroundAudio.paused) {
  backgroundAudio.play().catch(() => {});
}
  entryInput.disabled = true;
  statusMessage.textContent = "🎡 The wheel is spinning...";

  // Start optional spinning sound
if (spinAudio.src) {
  spinAudio.currentTime = 0;
  spinAudio.volume = Number(settings.spinVolume) / 100;
  spinAudio.play().catch(() => {});
}

  // Background music is intentionally NOT paused.
  wheelShell.style.transition = `transform ${duration}s cubic-bezier(0.12, 0.75, 0.12, 1)`;
  wheelShell.style.transform = `rotate(${finalRotation}deg)`;

  currentRotation = finalRotation;

  const finishSpin = () => {
    wheelShell.removeEventListener("transitionend", finishSpin);

    spinAudio.pause();
    spinAudio.currentTime = 0;

    isSpinning = false;
    durationSelect.disabled = false;
    customDuration.disabled = false;
    entryInput.disabled = false;

    showWinner(pendingWinnerIndex);
  };

  wheelShell.addEventListener("transitionend", finishSpin);

  // Fallback in case transitionend does not fire
  window.setTimeout(() => {
    if (isSpinning) {
      wheelShell.removeEventListener("transitionend", finishSpin);
      finishSpin();
    }
  }, duration * 1000 + 500);
}

spinBtn.addEventListener("click", spinWheel);

// ============================================
// RESULT POPUP
// ============================================

function showWinner(index) {
  if (index === null || !entries[index]) return;

  resultText.textContent = entries[index];
  statusMessage.textContent = "🎉 We have a result!";

  resultModal.classList.remove("hidden");

  // Play optional result sound.
  // Background music continues playing underneath.
if (resultAudio.src) {
  resultAudio.currentTime = 0;
  resultAudio.volume = Number(settings.resultVolume) / 100;
  resultAudio.play().catch(() => {});
}

  okBtn.focus();
}

function closeResultPopup() {
  if (resultModal.classList.contains("hidden")) return;

  // Remove only the selected entry, after popup is closed
  if (pendingWinnerIndex !== null) {
    entries.splice(pendingWinnerIndex, 1);
    saveEntries();
  }

  pendingWinnerIndex = null;

  resultAudio.pause();
  resultAudio.currentTime = 0;

  resultModal.classList.add("hidden");
  statusMessage.textContent = "Ready for the next spin!";

  renderEntries();
}

okBtn.addEventListener("click", closeResultPopup);
closeModalBtn.addEventListener("click", closeResultPopup);

// Clicking the dark background also closes the popup
resultModal.addEventListener("click", event => {
  if (event.target === resultModal) {
    closeResultPopup();
  }
});

// Escape key closes popup
document.addEventListener("keydown", event => {
  if (event.key === "Escape" &&
      !resultModal.classList.contains("hidden")) {
    closeResultPopup();
  }
});

// ============================================
// BACKGROUND MUSIC - AUTOPLAY + PLAY/PAUSE
// ============================================

const backgroundToggle = document.getElementById("backgroundToggle");

// Play background music
async function playBackgroundMusic() {
  try {
    await backgroundAudio.play();
    backgroundToggle.textContent = "⏸ Pause music";
  } catch (error) {
    console.log("Autoplay blocked. Waiting for user interaction.");
  }
}

// Pause background music
function pauseBackgroundMusic() {
  backgroundAudio.pause();
  backgroundToggle.textContent = "▶ Play music";
}

// Play/Pause button
backgroundToggle.addEventListener("click", async () => {
  if (backgroundAudio.paused) {
    await playBackgroundMusic();
  } else {
    pauseBackgroundMusic();
  }
});

// Keep button text synchronised
backgroundAudio.addEventListener("play", () => {
  backgroundToggle.textContent = "⏸ Pause music";
});

backgroundAudio.addEventListener("pause", () => {
  backgroundToggle.textContent = "▶ Play music";
});

// Try autoplay when website opens
async function startBackgroundMusic() {
  await playBackgroundMusic();
}

// If browser blocks autoplay, start after first user interaction
document.addEventListener("click", function startAfterInteraction() {
  if (backgroundAudio.paused) {
    playBackgroundMusic();
  }

  if (!backgroundAudio.paused) {
    document.removeEventListener("click", startAfterInteraction);
  }
});

// Attempt autoplay
startBackgroundMusic();

// ============================================
// UPLOAD AUDIO FILES
// ============================================

async function handleAudioUpload(inputId, type) {
  const input = document.getElementById(inputId);

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      alert("Please select a valid audio file.");
      input.value = "";
      return;
    }

    try {
      await saveAudioToDatabase(type, file);

      if (type === "background") backgroundBlob = file;
      if (type === "spin") spinBlob = file;
      if (type === "result") resultBlob = file;

      setAudioSource(type, file);
      updateAudioName(type, file.name);

      if (type === "background") {
        backgroundAudio.pause();
        document.getElementById("backgroundToggle").textContent = "▶ Play music";
      }

      alert("Audio uploaded and saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Could not save this audio file. Please try another file.");
    }

    input.value = "";
  });
}

handleAudioUpload("backgroundFile", "background");
handleAudioUpload("spinSoundFile", "spin");
handleAudioUpload("resultSoundFile", "result");

// ============================================
// VOLUME CONTROLS
// ============================================

function setupVolumeControl(inputId, labelId, type) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);

  input.value = settings[type];

  function update() {
    const volume = Number(input.value);
    settings[type] = volume;
    label.textContent = `${volume}%`;
    saveSettings();

    if (type === "backgroundVolume") {
      backgroundAudio.volume = volume / 100;
    }

    if (type === "spinVolume") {
      spinAudio.volume = volume / 100;
    }

    if (type === "resultVolume") {
      resultAudio.volume = volume / 100;
    }
  }

  input.addEventListener("input", update);
  update();
}

setupVolumeControl(
  "backgroundVolume",
  "backgroundVolumeValue",
  "backgroundVolume"
);

setupVolumeControl(
  "spinVolume",
  "spinVolumeValue",
  "spinVolume"
);

setupVolumeControl(
  "resultVolume",
  "resultVolumeValue",
  "resultVolume"
);

// ============================================
// REMOVE UPLOADED AUDIO - RESTORE DEFAULT
// ============================================

async function removeAudio(type) {

  const names = {
    background: "background music",
    spin: "spinning sound",
    result: "result popup sound"
  };

  if (!confirm(`Remove your uploaded ${names[type]} and restore the default music?`)) {
    return;
  }

  const audioElements = {
    background: backgroundAudio,
    spin: spinAudio,
    result: resultAudio
  };

  const defaultSources = {
    background: "audio/background.mp3",
    spin: "audio/spinning.mp3",
    result: "audio/result.mp3"
  };

  const audio = audioElements[type];

  // Stop currently playing uploaded audio
  audio.pause();
  audio.currentTime = 0;

  // Restore the original default music
  audio.src = defaultSources[type];
  audio.load();

  // Delete only the user's uploaded audio from IndexedDB
  await deleteAudioFromDatabase(type);

  // Release uploaded audio URL
  if (audioUrls[type]) {
    URL.revokeObjectURL(audioUrls[type]);
    audioUrls[type] = null;
  }

  // Clear uploaded audio references
  if (type === "background") {
    backgroundBlob = null;
    document.getElementById("backgroundToggle").textContent =
      "▶ Play music";
  }

  if (type === "spin") {
    spinBlob = null;
    updateAudioName("spin", "Using default spinning sound");
  }

  if (type === "result") {
    resultBlob = null;
    updateAudioName("result", "Using default result sound");
  }

  alert(`Default ${names[type]} has been restored.`);
}

document.getElementById("backgroundRemove").addEventListener(
  "click", () => removeAudio("background")
);

// Add remove buttons for the optional sound files
const spinRemoveBtn = document.createElement("button");
spinRemoveBtn.className = "small-btn danger-btn";
spinRemoveBtn.textContent = "Remove spinning sound";
spinRemoveBtn.type = "button";
spinRemoveBtn.addEventListener("click", () => removeAudio("spin"));

document.getElementById("spinSoundName").after(spinRemoveBtn);

const resultRemoveBtn = document.createElement("button");
resultRemoveBtn.className = "small-btn danger-btn";
resultRemoveBtn.textContent = "Remove result sound";
resultRemoveBtn.type = "button";
resultRemoveBtn.addEventListener("click", () => removeAudio("result"));

document.getElementById("resultSoundName").after(resultRemoveBtn);

// ============================================
// FULLSCREEN
// ============================================

document.getElementById("fullscreenBtn").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    alert("Fullscreen mode is not available in this browser.");
  }
});

document.addEventListener("fullscreenchange", () => {
  const isFullscreen = !!document.fullscreenElement;

  document.getElementById("fullscreenBtn").textContent =
    isFullscreen ? "⛶ Exit Fullscreen" : "⛶ Fullscreen";

  document.body.classList.toggle("fullscreen-mode", isFullscreen);
});

// ============================================
// INITIALISE PROJECT
// ============================================

async function initialise() {
  backgroundAudio.volume = Number(settings.backgroundVolume) / 100;
  spinAudio.volume = Number(settings.spinVolume) / 100;
  resultAudio.volume = Number(settings.resultVolume) / 100;

  renderEntries();

  try {
    audioDB = await openAudioDatabase();
    await restoreSavedAudio();
  } catch (error) {
    console.warn("Audio storage unavailable:", error);
    alert("Audio file storage is unavailable. The wheel can still be used, but uploaded audio may not be saved.");
  }
}


const backgroundMusic =
  document.getElementById("backgroundMusic");

const spinningMusic =
  document.getElementById("spinningMusic");

const resultMusic =
  document.getElementById("resultMusic");




initialise();

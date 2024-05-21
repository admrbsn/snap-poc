import './style.css';
import {
  bootstrapCameraKit,
  createMediaStreamSource,
  Transform2D,
} from '@snap/camera-kit';

document.querySelector('#app').innerHTML = `
<div class="w-screen h-dvh md:h-screen md:max-w-2xl md:flex md:items-center md:mx-auto">
  <div id="cameraWrapper" class="h-full md:h-auto md:p-6 md:bg-[#1e1e1e] md:rounded-lg">
    <div class="md:relative md:w-[640px] h-full md:h-auto md:aspect-[4/3] md:rounded-xl">
      <div class="absolute top-4 right-4 z-30">
        <button id="cameraButton" class="w-8 h-8 flex items-center justify-center bg-black/30 rounded-full">
          <svg viewBox="0 0 100 100" fill="none" class="w-6 h-6 text-white" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="50" r="10" fill="currentColor"/>
            <circle cx="50" cy="50" r="10" fill="currentColor"/>
            <circle cx="80" cy="50" r="10" fill="currentColor"/>
          </svg>
        </button>
        <div id="cameraSelect" class="hidden absolute top-10 right-0 w-44 bg-white shadow-lg rounded-lg p-2">
          <select id="cameras" class="w-full py-1 px-2 rounded text-sm appearance-none focus:outline-none focus:ring-0"></select>
        </div>
      </div>
      <canvas id="canvas" class="absolute md:relative bottom-0 md:bottom-auto left-0 md:left-auto w-full md:w-auto h-dvh md:h-auto object-cover rounded-lg"></canvas>
      <video id="standardVideo" class="hidden absolute md:relative bottom-0 md:bottom-auto left-0 md:left-auto w-full md:w-auto h-dvh md:h-auto object-cover transform scale-x-[-1] rounded-lg" width="640" height="480" muted></video>
      <button id="toggleRecording" class="absolute transform -translate-x-1/2 left-1/2 bottom-24 md:bottom-8 w-16 h-16 hover:scale-110 transition-all">
        <svg viewBox="0 0 100 100" fill="none" class="w-full h-full rounded-full" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="50" fill="#fff"/>
          <circle cx="50" cy="50" r="40" fill="#f42b2c"/>
        </svg>
      </button>
      <div id="video-container" class="hidden absolute top-0 left-0 w-full h-full z-40">
        <video id="recordedVideo" class="rounded-lg" width="640" height="480" controls autoplay></video>
        <div class="absolute transform -translate-x-1/2 left-1/2 bottom-16 flex space-x-2">
          <button id="download" class="px-6 py-2.5 bg-white text-[#121212] rounded-full font-semibold">Download</button>
          <button id="retake" class="px-6 py-2.5 bg-white text-[#121212] rounded-full font-semibold">Retake</button>
        </div>
      </div>
      <div id="recording-indicator" class="absolute bottom-3 right-3 w-20 flex items-center justify-center space-x-2 py-2 bg-[#121212] text-white rounded-full text-xs hidden">
        <div class="pulsate w-2 h-2 bg-[#f42b2c] rounded-full"></div>
        <span id="recording-duration">00:00</span>
      </div>
    </div>
    <div id="snap-select" class="absolute md:relative bottom-6 md:bottom-auto w-full flex items-center justify-center mt-3 transition-all">
      <span class="mr-3 text-white">Enable lenses</span>
      <div>
        <input type="checkbox" id="snapMode" class="mr-2">
        <label for="snapMode"></label>
      </div>
    </div>
    <div id="powered-by-snapchat" class="w-full hidden md:flex items-center justify-center mt-8 transition-all">
      <img src="/Snapchat-Logo.svg" class="w-8 mr-2">
      <span class="w-16 text-white text-[10px] leading-snug">Powered by Snapchat</span>
    </div>
    <div class="lenses-container absolute md:relative bottom-0 w-full hidden items-center justify-center space-x-4 md:mt-6 py-4 md:py-0 bg-[#1e1e1e] md:bg-none border-t border-[#353535] md:border-none transition-all"></div>
  </div>
</div>
`;

const cameraWrapper = document.getElementById('cameraWrapper');
const liveRenderTarget = document.getElementById('canvas');
const standardVideo = document.getElementById('standardVideo');
const videoContainer = document.getElementById('video-container');
const recordedVideo = document.getElementById('recordedVideo');
const toggleRecordingButton = document.getElementById('toggleRecording');
const downloadButton = document.getElementById('download');
const retakeButton = document.getElementById('retake');
const recordingIndicator = document.getElementById('recording-indicator');
const recordingDuration = document.getElementById('recording-duration');
const snapModeCheckbox = document.getElementById('snapMode');
const lensesContainer = document.querySelector('.lenses-container');
const cameraSelect = document.getElementById('cameras');
const cameraButton = document.getElementById('cameraButton');
const cameraSelectContainer = document.getElementById('cameraSelect');

let snapMediaRecorder;
let standardMediaRecorder;
let snapMediaStream;
let standardMediaStream;
let downloadUrl;
let isRecording = false;
let recordingInterval;
let cameraKit;
let session;
let activeLensDiv = null;

snapModeCheckbox.addEventListener('change', toggleMode);
cameraButton.addEventListener('click', () => {
  cameraSelectContainer.classList.toggle('hidden');
});
toggleRecordingButton.addEventListener('click', () => {
  if (isRecording) {
    if (snapModeCheckbox.checked) {
      stopRecording(snapMediaRecorder);
    } else {
      stopRecording(standardMediaRecorder);
    }
  } else {
    if (snapModeCheckbox.checked) {
      startRecording(snapMediaStream, true);
    } else {
      startRecording(standardMediaStream, false);
    }
  }
});
downloadButton.addEventListener('click', downloadVideo);
retakeButton.addEventListener('click', retakeRecording);
recordedVideo.addEventListener('ended', () => {
  standardVideo.muted = true; // Mute the standard video again when the preview ends
});

async function toggleMode() {
  if (snapModeCheckbox.checked) {
    cameraWrapper.classList.add('snap-mode');
    lensesContainer.classList.remove('hidden');
    lensesContainer.classList.add('flex');
    standardVideo.classList.add('hidden');
    liveRenderTarget.classList.remove('hidden');
    videoContainer.classList.add('hidden');
    await activateSnap();
  } else {
    cameraWrapper.classList.remove('snap-mode');
    lensesContainer.classList.remove('flex');
    lensesContainer.classList.add('hidden');
    liveRenderTarget.classList.add('hidden');
    standardVideo.classList.remove('hidden');
    videoContainer.classList.add('hidden');
    await initStandard();
  }
}

async function initStandard() {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  standardVideo.srcObject = mediaStream;
  standardVideo.play();
  standardMediaStream = mediaStream;
  await populateCameraSelect();
}

async function initSnap() {
  cameraKit = await bootstrapCameraKit({
    apiToken:
      'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzE1NzQwNjQ0LCJzdWIiOiI1ZTEyNzc2ZC1lYmM4LTQ2NDgtYmQ4Yi1mZDM1MDZkMWE3YjZ-U1RBR0lOR35iYTMzMDA2YS0yNGIwLTQxYzMtOGVjMS1hMjE5ZGU5ZWE5ZDcifQ.ez0U70EkHOCJpJN6JA42ARis37Tn77Ph6nkJqvsYvwg',
  });
  session = await cameraKit.createSession({ liveRenderTarget });
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  const source = createMediaStreamSource(mediaStream);
  await session.setSource(source);
  source.setTransform(Transform2D.MirrorX);
  await session.play();
  snapMediaStream = mediaStream;

  const { lenses } = await cameraKit.lensRepository.loadLensGroups([
    'b6ce3ec5-3b46-4fef-9f21-ad78dd406064',
  ]);

  attachLensesToContainer(lenses, session);
  await populateCameraSelect();
}

async function activateSnap() {
  if (!session) {
    await initSnap();
  }
  session.play();
}

async function populateCameraSelect() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(({ kind }) => kind === 'videoinput');

  cameraSelect.innerHTML = ''; // Clear existing options
  cameras.forEach((camera) => {
    const option = document.createElement('option');

    option.value = camera.deviceId;
    option.text = camera.label;

    cameraSelect.appendChild(option);
  });

  cameraSelect.addEventListener('change', (event) => {
    const deviceId = event.target.selectedOptions[0].value;

    if (snapModeCheckbox.checked) {
      setCameraKitSource(session, deviceId);
    } else {
      setStandardSource(deviceId);
    }
  });
}

async function setStandardSource(deviceId) {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId } },
    audio: true,
  });
  standardVideo.srcObject = mediaStream;
  standardVideo.play();
  standardMediaStream = mediaStream;
}

function attachLensesToContainer(lenses, session) {
  lensesContainer.innerHTML = ''; // Clear existing options
  lenses.forEach((lens) => {
    const lensDiv = document.createElement('div');
    lensDiv.classList.add(
      'lens-option',
      'flex',
      'items-center',
      'justify-center',
      'w-12',
      'h-12',
      'bg-white',
      'text-[#121212]',
      'text-[10px]',
      'text-center',
      'font-semibold',
      'leading-tight',
      'rounded-full',
      'cursor-pointer'
    );

    const lensImage = document.createElement('img');
    lensImage.src = `/${lens.name}.jpg`;
    lensImage.alt = lens.name;
    lensImage.classList.add('w-full', 'h-full', 'rounded-full');

    lensDiv.appendChild(lensImage);

    lensDiv.addEventListener('click', () => {
      if (activeLensDiv) {
        activeLensDiv.classList.remove('active');
      }
      lensDiv.classList.add('active');
      activeLensDiv = lensDiv;
      session.applyLens(lens);
    });

    lensesContainer.appendChild(lensDiv);
  });
}

function startRecording(mediaStream, isSnapMode) {
  isRecording = true;
  toggleRecordingButton.innerHTML = `
    <svg viewBox="0 0 100 100" fill="none" class="w-full h-full rounded-full" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="#fff"/>
      <rect x="20" y="20" width="60" height="60" rx="10" ry="10" fill="#f42b2c"/>
    </svg>
  `;
  downloadButton.disabled = true;
  videoContainer.classList.add('hidden');

  const mediaStreamWithAudio = new MediaStream([
    ...(isSnapMode
      ? liveRenderTarget.captureStream(30).getVideoTracks()
      : mediaStream.getVideoTracks()),
    ...mediaStream.getAudioTracks(),
  ]);

  if (isSnapMode) {
    snapMediaRecorder = new MediaRecorder(mediaStreamWithAudio);
    snapMediaRecorder.addEventListener('dataavailable', handleDataAvailable);
    snapMediaRecorder.start();
  } else {
    standardMediaRecorder = new MediaRecorder(mediaStreamWithAudio);
    standardMediaRecorder.addEventListener(
      'dataavailable',
      handleDataAvailable
    );
    standardMediaRecorder.start();
  }

  // Mute playback to avoid audio echo
  standardVideo.muted = true;
  recordingIndicator.classList.remove('hidden');
  startRecordingTimer();
}

function stopRecording(mediaRecorderInstance) {
  isRecording = false;
  toggleRecordingButton.innerHTML = `
  <svg viewBox="0 0 100 100" fill="none" class="w-full h-full rounded-full" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#fff"/>
    <circle cx="50" cy="50" r="40" fill="#f42b2c"/>
  </svg>
  `;

  if (mediaRecorderInstance) {
    mediaRecorderInstance.stop();
  }

  // Mute playback after recording
  standardVideo.muted = true;
  recordingIndicator.classList.add('hidden');
  stopRecordingTimer();
}

function handleDataAvailable(event) {
  if (!event.data.size) {
    console.warn('No recorded data available');
    return;
  }

  const blob = new Blob([event.data]);
  downloadUrl = window.URL.createObjectURL(blob);
  downloadButton.disabled = false;
  recordedVideo.src = downloadUrl;
  videoContainer.classList.remove('hidden');
  liveRenderTarget.classList.add('hidden');
  standardVideo.classList.add('hidden');
}

function downloadVideo() {
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'recording.webm';
  link.click();
  recordedVideo.pause(); // Stop video playback
  recordedVideo.currentTime = 0; // Reset video to start
}

function retakeRecording() {
  recordedVideo.pause(); // Stop video playback
  recordedVideo.currentTime = 0; // Reset video to start
  videoContainer.classList.add('hidden');
  if (snapModeCheckbox.checked) {
    liveRenderTarget.classList.remove('hidden');
  } else {
    standardVideo.muted = true; // Mute playback again to avoid echo
    standardVideo.classList.remove('hidden');
  }
}

function startRecordingTimer() {
  let seconds = 0;
  recordingInterval = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    recordingDuration.textContent = `${String(minutes).padStart(
      2,
      '0'
    )}:${String(displaySeconds).padStart(2, '0')}`;
  }, 1000);
}

function stopRecordingTimer() {
  clearInterval(recordingInterval);
  recordingDuration.textContent = '00:00';
}

window.addEventListener('load', async () => {
  await initSnap(); // Preload Snap Camera Kit
  await populateCameraSelect(); // Populate camera select on load
  toggleMode(); // Initialize with the default mode
});

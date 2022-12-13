let volumeThreshold = 1;
let volumeDetectorDelay = 10;
const updateVolume = () => {
  analyserNode.getByteFrequencyData(volumeDataArray);

  let sum = 0;
  for (const amplitude of volumeDataArray) {
    sum += amplitude * amplitude;
  }

  let volume = Math.sqrt(sum / volumeDataArray.length);
  volume = getInterpolation(20, 100, volume);
  volume = clamp(volume, 0, 1);
  if (true || volume > 0) {
    setPinkTromboneValue("intensity", null, volume);
    updateMenuInput("intensity");

    microphoneRecording.volume.push({
      time: getRecording(),
      value: volume,
    });

    if (autoKeyMicrophone && selectedButton) {
      selectedButton.keyframe.intensity = volume;
      updateButton(selectedButton);
      //updateMultiButtons();
    }
  }

  if (isVolumeDetectorEnabled) {
    window.setTimeout(() => updateVolume(), volumeDetectorDelay);
  }
};
let detector, input, stream, volumeDataArray;
window.enableMicrophone = async (override) => {
  if (stream) {
    if (override) {
      await window.disableMicrophone(true);
    } else {
      return;
    }
  }

  stream = await navigator.mediaDevices.getUserMedia({
    audio: selectedDeviceId ? { deviceId: selectedDeviceId } : true,
  });
  console.log("enable microphone", stream);

  audioContext.createMediaStreamSource(stream).connect(analyserNode);

  detector = detector || PitchDetector.forFloat32Array(analyserNode.fftSize);
  input = input || new Float32Array(detector.inputLength);
  volumeDataArray =
    volumeDataArray || new Uint8Array(analyserNode.frequencyBinCount);
};

let microphoneRecording = { pitch: [], volume: [] };
const getRecording = () => {
  return (Date.now() - startRecordingTime) / 1000;
};

let startRecordingTime;
const recordMicrophoneCallback = () => {
  const currentTime = Math.min(
    totalTime,
    (Date.now() - startRecordingTime) / 1000
  );

  timelineSlider.value = currentTime;

  if (isRecordingMicrophone && currentTime < totalTime) {
    drawCanvas();
    requestAnimationFrame(() => recordMicrophoneCallback());
  } else {
    console.log(microphoneRecording);
    setRecordingMicrophoneEnabled(false);
  }
};

const clearRecording = () => {
  console.log("clearing recording");
  microphoneRecording.pitch.length = 0;
  microphoneRecording.volume.length = 0;
  clearCanvas();
};
const clearCanvas = () => {
  timelineCanvasContext.clearRect(
    0,
    0,
    timelineCanvas.width,
    timelineCanvas.height
  );
};
const getAdjacents = (time, array) => {
  let before, after;
  array.some((value) => {
    if (value.time < time) {
      before = value;
    } else if (value.time > time) {
      after = value;
    }
    return after;
  });
  return { before, after };
};
const getInterpolationAtTime = (time, array) => {
  const { before, after } = getAdjacents(time, array);
  let value = 0;
  if (before || after) {
    if (before && after) {
      if (before == after) {
        value = before.value;
      } else {
        const timeInterpolation = getInterpolation(
          before.time,
          after.time,
          time
        );
        value = interpolate(before.value, after.value, timeInterpolation);
      }
    } else {
      if (before) {
        value = before.value;
      } else {
        value = after.value;
      }
    }
  }
  return value;
};
const getAdjacentVolumes = (time) => {
  return getAdjacents(time, microphoneRecording.volume);
};

const getVolumeAtTime = (time) => {
  return getInterpolationAtTime(time, microphoneRecording.volume);
};
const getPitchAtTime = (time) => {
  return getInterpolationAtTime(time, microphoneRecording.pitch);
};

const drawCanvas = () => {
  clearCanvas();

  const canvas = timelineCanvas;
  const ctx = timelineCanvasContext;

  let previousX, previousY;
  if (microphoneRecording.volume.length > 0) {
    microphoneRecording.pitch.forEach(({ time, value: pitch }, index) => {
      const xInterpolation = time / totalTime;
      const { min, max } = pinkTromboneParameters.frequency;
      const yInterpolation = getInterpolation(
        Math.log(min),
        Math.log(max),
        Math.log(pitch)
      );

      const x = xInterpolation * canvas.width;
      const y = (1 - yInterpolation) * canvas.height;

      let lineWidth = 1;
      let volume = getVolumeAtTime(time);

      if (index == 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.beginPath();
        ctx.strokeStyle = "#BAFAC9";
        ctx.lineWidth = volume * 20;
        //ctx.globalAlpha = 0.5;
        ctx.moveTo(previousX, previousY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      previousX = x;
      previousY = y;
    });
  }

  ctx.beginPath();
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  microphoneRecording.pitch.forEach(({ time, value: pitch }, index) => {
    const xInterpolation = time / totalTime;
    const { min, max } = pinkTromboneParameters.frequency;
    const yInterpolation = getInterpolation(
      Math.log(min),
      Math.log(max),
      Math.log(pitch)
    );

    const x = xInterpolation * canvas.width;
    const y = (1 - yInterpolation) * canvas.height;

    if (index == 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
};

let isRecordingMicrophone = false;
const setRecordingMicrophoneEnabled = (enabled) => {
  if (enabled && (!stream || !isPitchDetectorEnabled)) {
    return;
  }
  isRecordingMicrophone = enabled;
  if (isRecordingMicrophone) {
    clearRecording();
    startRecordingTime = Date.now();
    recordMicrophoneCallback();
  } else {
  }
  toggleMicrophoneRecordingButton.innerText = isRecordingMicrophone
    ? "🔴"
    : "⚪️";
};
window.toggleMicrophoneRecording = () => {
  setRecordingMicrophoneEnabled(!isRecordingMicrophone);
};
/* global AFRAME, THREE, Tone, PitchDetector */
AFRAME.registerSystem("violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
    modeText: { type: "selector" },
    interval: { type: "number", default: 40 },
    clarityThreshold: { type: "number", default: 0.4 },
    volumeThreshold: { type: "number", default: 20 },
    violin: {type: "selector"}
  },
  init: function () {
    window.violin = this;

    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L261
    this.A4 = 440;

    this.otherSide = this.data.side == "left" ? "right" : "left";

    this.hand = this.data[`${this.data.side}Hand`];
    this.otherHand = this.data[`${this.otherSide}Hand`];

    const buttons = this.data.side == "left" ? ["y", "x"] : ["b", "a"];
    this.otherHand.addEventListener(
      `${buttons[0]}buttondown`,
      this.onTopButtonDown.bind(this)
    );
    this.otherHand.addEventListener(
      `${buttons[1]}buttondown`,
      this.onBottomButtonDown.bind(this)
    );
    this.otherHand.addEventListener(
      "thumbstickmoved",
      this.onThumbstickMoved.bind(this)
    );
    this.otherHand.addEventListener(
      "gripdown",
      this.onGripDown.bind(this)
    );
    this.otherHand.addEventListener(
      "gripup",
      this.onGripUp.bind(this)
    );

    this.savePositionToLocalStorage = AFRAME.utils.throttle(
      this.savePositionToLocalStorage.bind(this),
      1000
    );
    this.loadPositionFromLocalStorage();
    this.saveRotationToLocalStorage = AFRAME.utils.throttle(
      this.saveRotationToLocalStorage.bind(this),
      1000
    );
    this.loadRotationFromLocalStorage();

    this.frequency = new Tone.Frequency();

    this.audioContext = Tone.context.rawContext._nativeAudioContext;
    this.analyserNode = this.audioContext.createAnalyser();
    this.isPitchDetectorEnabled = false;
    this.getPitchAndVolume = AFRAME.utils.throttleTick(
      this.getPitchAndVolume.bind(this),
      this.data.interval
    );

    this.modes = ["position", "pitch/roll", "tune", "fingers", "song"];
    this.modeIndex = 0;
    this.onModeIndexUpdate();
  },
  updateMode: function (index, isOffset = true) {
    let newModeIndex = this.modeIndex;
    if (this.modes.includes(index)) {
      newModeIndex = this.modes.indexOf(index);
    } else {
      if (isOffset) {
        newModeIndex += index;
      } else {
        if (index >= 0 && index < this.modes.length) {
          newModeIndex = index;
        }
      }
    }

    newModeIndex %= this.modes.length;
    newModeIndex = THREE.MathUtils.clamp(
      newModeIndex,
      0,
      this.modes.length - 1
    );

    if (this.modeIndex != newModeIndex) {
      this.modeIndex = newModeIndex;
      this.onModeIndexUpdate();
    }
  },
  onModeIndexUpdate: function () {
    this.mode = this.modes[this.modeIndex];
    console.log("new mode:", this.mode);
    this.data.modeText.setAttribute("value", this.mode);

    switch (this.mode) {
      case "position":
        this.disablePitchDetector();
        break;
      case "pitch/roll":
        this.disablePitchDetector();
        break;
      case "tune":
        this.enablePitchDetector();
        break;
      case "fingers":
        this.enablePitchDetector();
        break;
      case "song":
        this.enablePitchDetector();
        break;
    }
  },

  tick: function () {
    if (window.PitchDetector && !this.pitchDetector) {
      this.pitchDetector = window.PitchDetector.forFloat32Array(
        this.analyserNode.fftSize
      );
      this.pitchDetectorInput = new Float32Array(
        this.pitchDetector.inputLength
      );
      this.volumeDataArray = new Uint8Array(
        this.analyserNode.frequencyBinCount
      );
    }

    if (this.pitchDetector && this.isPitchDetectorEnabled) {
      this.getPitchAndVolume();
    }
  },

  onTopButtonDown: function () {
    this.updateMode(-1);
  },
  onBottomButtonDown: function () {
    this.updateMode(1);
  },

  onThumbstickMoved: function (event) {
    let { x, y } = event.detail;

    switch (this.mode) {
      case "position":
        // FILL - update position.xz
        // FILL - throttle function to save to localstorage
        break;
      case "pitch/roll":
        // FILL - update rotation.xy
        // FILL - throttle function to save to localstorage
        break;
    }
  },

  savePositionToLocalStorage: function () {
    // FILL
  },
  loadPositionFromLocalStorage: function () {
    // FILL
  },
  saveRotationToLocalStorage: function () {
    // FILL
  },
  loadRotationFromLocalStorage: function () {
    // FILL
  },

  enableMicrophone: async function () {
    if (this.stream) {
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("enabled microphone", this.stream);

    this.mediaStreamSource = this.audioContext.createMediaStreamSource(
      this.stream
    );
    this.mediaStreamSource.connect(this.analyserNode);
  },
  disableMicrophone: async function () {
    if (!this.stream) {
      return;
    }

    this.stream.getAudioTracks().forEach((audioTrack) => audioTrack.stop());
    this.stream = null;
    console.log("disabled microphone", this.stream);

    this.mediaStreamSource.disconnect();
    this.mediaStreamSource = null;
  },

  getPitchAndVolume: function () {
    const pitch = this.getPitch();
    const volume = this.getVolume();
    // FILL
  },
  getPitch: function () {
    this.analyserNode.getFloatTimeDomainData(this.pitchDetectorInput);
    const [pitch, clarity] = this.pitchDetector.findPitch(
      this.pitchDetectorInput,
      this.audioContext.sampleRate
    );
    if (clarity > this.data.clarityThreshold) {
      return pitch;
    }
  },
  getVolume: function () {
    this.analyserNode.getByteFrequencyData(this.volumeDataArray);

    let sum = 0;
    for (const amplitude of this.volumeDataArray) {
      sum += amplitude * amplitude;
    }

    let volume = Math.sqrt(sum / this.volumeDataArray.length);
    volume /= 100;
    return volume;
  },

  enablePitchDetector: async function () {
    await this.enableMicrophone();
    if (!this.isPitchDetectorEnabled) {
      this.isPitchDetectorEnabled = true;
      console.log("enabled pitch detector");
    }
  },
  disablePitchDetector: async function () {
    await this.disableMicrophone();
    if (this.isPitchDetectorEnabled) {
      this.isPitchDetectorEnabled = false;
      console.log("disabled pitch detector");
    }
  },

  getFrequencyOffset: function (frequency) {
    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L143
    const log = Math.log(frequency / this.A4) / Math.LN2;
    const offset = 12 * log - Math.round(12 * log);
    return offset;
  },
  frequencyToPosition: function (frequency) {
    // FILL - gets string/finger
  },
  
  onGripDown: function(){
    this.data.violin.object3D.visible = true;
  },
  onGripUp: function(){
    this.data.violin.object3D.visible = false;
  }
});

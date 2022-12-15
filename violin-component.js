/* global AFRAME, THREE, Tone, PitchDetector */
AFRAME.registerSystem("violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
    modeText: { type: "selector" },
    pitchInterval: { type: "number", default: 40 },
    clarityThreshold: { type: "number", default: 0.4 },
    volumeThreshold: { type: "number", default: 20 },
    violin: { type: "selector" },
    pitchText: { type: "selector" },
  },
  init: function () {
    window.violin = this;

    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L261
    this.A4 = 440;
    this.stringFrequencies = [
      [new Tone.Frequency("G3")],
      [new Tone.Frequency("D4")],
      [new Tone.Frequency("A4")],
      [new Tone.Frequency("E5")],
    ];
    this.stringFrequencies.forEach((stringFingerings) => {
      const openStringFrequency = stringFingerings[0];
      for (let index = 1; index <= 7; index++) {
        stringFingerings.push(openStringFrequency.transpose(index));
      }
    });
    this.noteToFingerings = {};
    this.stringFrequencies.forEach((stringFingerings, stringIndex) => {
      stringFingerings.forEach((frequency, fingerIndex) => {
        const note = frequency.toNote();
        this.noteToFingerings[note] = this.noteToFingerings[note] || [];
        this.noteToFingerings[note].push({ stringIndex, fingerIndex });
      });
    });

    this.otherSide = this.data.side == "left" ? "right" : "left";

    this.hand = this.data[`${this.data.side}Hand`];
    this.otherHand = this.data[`${this.otherSide}Hand`];

    const buttons = this.data.side == "left" ? ["b", "a"] : ["y", "x"];
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
    this.otherHand.addEventListener("gripdown", this.onGripDown.bind(this));
    this.otherHand.addEventListener("gripup", this.onGripUp.bind(this));
    this.otherHand.addEventListener(
      "triggerdown",
      this.onTriggerDown.bind(this)
    );
    this.otherHand.addEventListener("triggerup", this.onTriggerUp.bind(this));

    this.data.violin.addEventListener("loaded", (event) => {
      this.savePositionToLocalStorage = AFRAME.utils.debounce(
        this.savePositionToLocalStorage.bind(this),
        1000
      );
      this.loadPositionFromLocalStorage();
      this.saveRotationToLocalStorage = AFRAME.utils.debounce(
        this.saveRotationToLocalStorage.bind(this),
        1000
      );
      this.loadRotationFromLocalStorage();
      this.data.violin.object3D.rotation.reorder("YXZ");
    });

    this.frequency = new Tone.Frequency(440);

    this.audioContext = Tone.context.rawContext._nativeAudioContext;
    this.analyserNode = this.audioContext.createAnalyser();
    this.isPitchDetectorEnabled = false;
    this.getPitchAndVolume = AFRAME.utils.throttle(
      this.getPitchAndVolume.bind(this),
      this.data.pitchInterval
    );

    this.modes = ["position", "tune", "fingers", "song"];
    this.modeIndex = 0;
    this.onModeIndexUpdate();

    this.clearPitchText = AFRAME.utils.debounce(
      this.clearPitchText.bind(this),
      1000
    );
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

    if (this.isTriggerDown && this.mode == "position") {
      this.updateViolinPositionAndRotation();
    }
  },

  onTopButtonDown: function () {
    console.log("top button");
    this.updateMode(-1);
  },
  onBottomButtonDown: function () {
    console.log("buttom button");
    this.updateMode(1);
  },

  onThumbstickMoved: function (event) {
    let { x, y } = event.detail;

    switch (this.mode) {
      default:
        break;
    }
  },

  updateViolinPositionAndRotation: function () {
    if (this._resetPositionFlag) {
      this.initialControllerPosition = this.otherHand.object3D.position.clone();
      this.initialControllerQuaternion =
        this.otherHand.object3D.quaternion.clone().invert();
      this._resetPositionFlag = false;
    } else {
      this.data.violin.object3D.position.subVectors(this.otherHand.object3D.position, this.initialControllerPosition);
      this.data.violin.object3D.quaternion.multiplyQuaternions(this.otherHand.object3D.quaternion, this.initialControllerQuaternion);
      
      this.savePositionToLocalStorage();
      this.saveRotationToLocalStorage();
    }
  },

  savePositionToLocalStorage: function () {
    localStorage.violinPosition = JSON.stringify(
      this.data.violin.object3D.position.toArray()
    );
    console.log("saved position to localstorage");
  },
  loadPositionFromLocalStorage: function () {
    let violinPosition = localStorage.violinPosition;
    if (violinPosition) {
      violinPosition = JSON.parse(violinPosition);
      this.data.violin.object3D.position.fromArray(violinPosition);
    }
    console.log("loaded position from localstorage");
  },
  saveRotationToLocalStorage: function () {
    localStorage.violinRotation = JSON.stringify(
      this.data.violin.object3D.quaternion.toArray()
    );
    console.log("saved rotation to localstorage");
  },
  loadRotationFromLocalStorage: function () {
    let violinRotation = localStorage.violinRotation;
    if (violinRotation) {
      violinRotation = JSON.parse(violinRotation);
      this.data.violin.object3D.quaternion.fromArray(violinRotation);
    }
    console.log("loaded rotation from localstorage");
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
    let pitch, volume;

    //const pitch = this.getPitch();
    //const volume = this.getVolume();

    let value;
    switch (this.mode) {
      case "position":
        break;
      case "tune":
      case "fingers":
      case "song":
        pitch = this.getPitch();
        let note, offset;
        switch (this.mode) {
          case "tune":
            note = this.pitchToNote(pitch);
            offset = this.getPitchOffset(pitch);
            value = `${note} ${Math.round(pitch)}Hz (${
              offset > 0 ? "+" : "-"
            }${Math.round(Math.abs(offset) * 100)}%)`;
            break;
          case "fingers":
            const positions = this.pitchToPositions(pitch);
            // FILL
            break;
          case "song":
            note = this.pitchToNote(pitch);
            value = note;
            break;
        }
        break;
    }

    if (value) {
      this.data.pitchText.setAttribute("value", value);
      this.clearPitchText();
    }
  },
  clearPitchText: function () {
    this.data.pitchText.setAttribute("value", "");
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

  getPitchOffset: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L143
    const log = Math.log(pitch / this.A4) / Math.LN2;
    const offset = 12 * log - Math.round(12 * log);
    return offset;
  },
  pitchToPositions: function (pitch) {
    return this.noteToFingerings[this.pitchToNote(pitch)];
  },
  pitchToNote: function (pitch) {
    this.frequency._val = pitch;
    return this.frequency.toNote();
  },

  onGripDown: function () {
    this.data.violin.object3D.visible = true;
  },
  onGripUp: function () {
    this.data.violin.object3D.visible = false;
  },

  onTriggerDown: function () {
    this.isTriggerDown = true;

    switch (this.mode) {
      case "position":
        this._resetPositionFlag = true;
        break;
      case "fingers":
        // FILL - cycle thru frets
        break;
    }
  },
  onTriggerUp: function () {
    this.isTriggerDown = false;

    switch (this.mode) {
      case "fingers":
        // FILL - cycle thru frets
        break;
    }
  },
});

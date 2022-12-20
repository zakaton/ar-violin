/* global AFRAME, THREE, Tone, PitchDetector */
AFRAME.registerSystem("violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
    modeText: { type: "selector" },
    pitchInterval: { type: "number", default: 40 },
    clarityThreshold: { type: "number", default: 0.95 },
    volumeThreshold: { type: "number", default: 20 },
    violin: { type: "selector" },
    pitchText: { type: "selector" },
    offsetText: { type: "selector" },
    noteText: { type: "selector" },
    offsetThreshold: { type: "number", default: 0.1 },
    pitchThreshold: { type: "number", default: 30 },
    bindViolinToHand: { type: "boolean", default: false },
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
    Object.values(this.noteToFingerings).forEach((noteFingerings) =>
      noteFingerings.reverse()
    );

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

    this.violinModelEntity = this.data.violin.querySelector("[gltf-model]");
    this.violinModelEntity.addEventListener("loaded", (event) => {
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

      this.saveFretPositionsToLocalStorage = AFRAME.utils.debounce(
        this.saveFretPositionsToLocalStorage.bind(this),
        1000
      );
      this.loadFretPositionsFromLocalStorage();
    });

    this.frequency = new Tone.Frequency(440);

    this.audioContext = Tone.context.rawContext._nativeAudioContext;
    this.analyserNode = this.audioContext.createAnalyser();
    this.isPitchDetectorEnabled = false;
    this.getPitchAndVolume = AFRAME.utils.throttle(
      this.getPitchAndVolume.bind(this),
      this.data.pitchInterval
    );

    this.clearPitchText = AFRAME.utils.debounce(
      this.clearPitchText.bind(this),
      1000
    );
    this.clearNoteText = AFRAME.utils.debounce(
      this.clearNoteText.bind(this),
      1000
    );
    this.clearOffsetText = AFRAME.utils.debounce(
      this.clearOffsetText.bind(this),
      1000
    );

    this.stringEntities = Array.from(
      this.data.violin.querySelectorAll("[data-string]")
    );
    this.fingerEntities = Array.from(
      this.data.violin.querySelectorAll("[data-finger]")
    );
    this.fretEntities = Array.from(
      this.data.violin.querySelectorAll("[data-fret]")
    );
    this.knobEntities = Array.from(
      this.data.violin.querySelectorAll("[data-knob]")
    );

    this.updateHighlightedFretIndex(0, false);

    this.fingerStringToFingerIndex = {
      0: 0,
      L1: 1,
      1: 2,
      L2: 3,
      2: 4,
      3: 5,
      H3: 6,
      4: 7,
    };
    // https://www.stringclub.com/learn-play/howls-moving-castle/
    this.songFingerings = [
      { string: 1, finger: 0 },
      { string: 1, finger: 3 },
      { string: 2, finger: "L1" },
      { string: 2, finger: 3 },
      { string: 2, finger: 3 },
      { string: 2, finger: "L2" },
      { string: 2, finger: "L1" },
      { string: 2, finger: 0 },
      { string: 2, finger: "L1" },

      { string: 1, finger: 3 },
      { string: 2, finger: "L1" },
      { string: 2, finger: 3 },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L2" },
      { string: 3, finger: 3 },
      { string: 3, finger: "L1" },
      { string: 2, finger: "H3" },
      { string: 3, finger: "L1" },

      { string: 2, finger: 0 },
      { string: 2, finger: 3 },
      { string: 3, finger: "L1" },
      { string: 3, finger: 3 },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L1" },
      { string: 3, finger: 0 },
      { string: 3, finger: "L1" },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L1" },
      { string: 2, finger: 4 },

      { string: 2, finger: 3 },
      { string: 2, finger: "L2" },
      { string: 2, finger: "L1" },
      { string: 2, finger: "L2" },
      { string: 2, finger: 3 },
      { string: 2, finger: "L2" },
      { string: 1, finger: 3 },
      { string: 2, finger: 0 },
    ];
    this.songNotes = this.songFingerings.map(({ string, finger }) => {
      const fingerIndex = this.fingerStringToFingerIndex[finger];
      return this.stringFrequencies[string][fingerIndex];
    });

    this.modes = ["position", "tune", "fingers", "song"];
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
        this.hideFrets();
        this.clearSongNotes();
        this.showStrings();
        break;
      case "tune":
        this.enablePitchDetector();
        this.hideFrets();
        this.clearSongNotes();
        this.clearStrings();
        break;
      case "fingers":
        this.enablePitchDetector();
        this.showFrets();
        this.highlightFret(0);
        this.clearSongNotes();
        this.clearStrings();
        break;
      case "song":
        this.enablePitchDetector();
        this.hideFrets();
        this.updateHighlightedSongNote(0, false, true);
        break;
    }

    this.clearKnobs();
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
      case "fingers":
        this.highlightedFret.object3D.position.y += -y * 0.001;
        this.saveFretPositionsToLocalStorage();
        break;
      default:
        break;
    }
  },

  saveFretPositionsToLocalStorage: function () {
    localStorage.violinFretPositions = JSON.stringify(
      this.fretEntities.map((fretEntity) => fretEntity.object3D.position.y)
    );
    console.log("saved position to localstorage");
  },
  loadFretPositionsFromLocalStorage: function () {
    let violinFretPositions = localStorage.violinFretPositions;
    if (violinFretPositions) {
      violinFretPositions = JSON.parse(violinFretPositions);
      this.fretEntities.forEach((fretEntity, index) => {
        fretEntity.addEventListener("loaded", () => {
          fretEntity.object3D.position.y = Number(violinFretPositions[index]);
        });
      });
    }
    console.log("loaded fret positions from localstorage");
  },

  updateViolinPositionAndRotation: function () {
    if (!this.loadedPosition || !this.loadedRotation) {
      return;
    }

    if (this._resetPositionFlag) {
      this.initialOtherHandPosition = this.otherHand.object3D.position.clone();
      this.initialOtherHandQuaternionInverse =
        this.otherHand.object3D.quaternion.clone().invert();

      this.initialViolinPosition = this.data.violin.object3D.position.clone();

      if (this.otherHandQuaternionDifference) {
        if (this.previousOtherHandQuaternionDifference) {
          this.previousOtherHandQuaternionDifference.premultiply(
            this.otherHandQuaternionDifference
          );
        } else {
          this.previousOtherHandQuaternionDifference =
            this.otherHandQuaternionDifference.clone();
        }
      }

      this._resetPositionFlag = false;
    } else {
      this.handQuaternionInverse =
        this.handQuaternionInverse || new THREE.Quaternion();

      if (this.bindViolinToHand) {
        this.handQuaternionInverse.copy(this.hand.object3D.quaternion).invert();
      }

      this.data.violin.object3D.position.subVectors(
        this.otherHand.object3D.position,
        this.initialOtherHandPosition
      );
      this.data.violin.object3D.position.applyQuaternion(
        this.handQuaternionInverse
      );
      this.data.violin.object3D.position.add(this.initialViolinPosition);

      this.otherHandQuaternionDifference =
        this.otherHandQuaternionDifference || new THREE.Quaternion();
      this.otherHandQuaternionDifference.multiplyQuaternions(
        this.initialOtherHandQuaternionInverse,
        this.otherHand.object3D.quaternion
      );
      this.data.violin.object3D.quaternion.multiplyQuaternions(
        this.handQuaternionInverse,
        this.otherHandQuaternionDifference
      );
      //return;
      if (this.previousOtherHandQuaternionDifference) {
        this.data.violin.object3D.quaternion.multiply(
          this.previousOtherHandQuaternionDifference
        );
      }
    }
  },

  savePositionToLocalStorage: function () {
    localStorage.violinPosition = JSON.stringify(
      this.data.violin.object3D.position.toArray()
    );
    // console.log("saved position to localstorage");
  },
  loadPositionFromLocalStorage: function () {
    let violinPosition = localStorage.violinPosition;
    if (violinPosition) {
      violinPosition = JSON.parse(violinPosition);
      this.data.violin.setAttribute("position", violinPosition.join(" "));
      //this.data.violin.object3D.position.fromArray(violinPosition);
    }
    console.log("loaded position from localstorage");
    this.loadedPosition = true;
  },
  saveRotationToLocalStorage: function () {
    localStorage.violinRotation = JSON.stringify(
      this.data.violin.object3D.quaternion.toArray()
    );
    // console.log("saved rotation to localstorage");
  },
  loadRotationFromLocalStorage: function () {
    let violinRotation = localStorage.violinRotation;
    if (violinRotation) {
      violinRotation = JSON.parse(violinRotation);
      this.data.violin.object3D.quaternion.fromArray(violinRotation);
    }
    console.log("loaded rotation from localstorage");
    this.loadedRotation = true;
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
    let pitch, volume, positions, midi;
    let pitchValue, noteValue, noteColor, offsetValue, offsetColor;

    let value;
    switch (this.mode) {
      case "position":
        break;
      case "tune":
      case "fingers":
      case "song":
        pitch = this.getPitch();
        if (pitch) {
          //console.log("pitch", pitch);
          let note, offset;

          switch (this.mode) {
            case "tune":
            case "fingers":
              {
                note = this.pitchToNote(pitch);
                noteValue = note;

                pitchValue = `${Math.round(pitch)}Hz`;

                const fingerIndex =
                  this.mode == "tune" ? 0 : this.highlightedFretIndex + 1;
                const closestStringIndex = this.getClosestStringIndex(
                  pitch,
                  fingerIndex
                );
                const closestStringFrequency =
                  this.stringFrequencies[closestStringIndex][fingerIndex];

                midi = this.pitchToMidi(pitch);
                offset = this.getPitchOffset(pitch);
                const midiOffset = closestStringFrequency.toMidi() - midi;
                offset += midiOffset;

                offsetValue = `${offset > 0 ? "+" : "-"}${Math.round(
                  Math.abs(offset) * 100
                )}%`;
                if (Math.abs(offset) > this.data.offsetThreshold) {
                  offsetColor = offset > 0 ? "red" : "blue";
                } else {
                  offsetColor = "green";
                }

                this.highlightString(closestStringIndex);
                if (this.mode == "tune") {
                  this.highlightKnob(closestStringIndex, offset);
                }
              }

              break;
            case "song":
              
              note = this.pitchToNote(pitch);
              
              /*
              noteValue = note;

              pitchValue = `${Math.round(pitch)}Hz`;

              midi = this.pitchToMidi(pitch);
              offset = this.getPitchOffset(pitch);
              const midiOffset = this.highlightedSongNote.toMidi() - midi;
              offset += midiOffset;
              offsetValue = `${offset > 0 ? "+" : "-"}${Math.round(
                Math.abs(offset) * 100
              )}%`;
              if (Math.abs(offset) > this.data.offsetThreshold) {
                offsetColor = offset > 0 ? "red" : "blue";
              } else {
                offsetColor = "green";
              }
              */

              const isRightNote = note == this.highlightedSongNote.toNote();
              //noteColor = isRightNote ? "green" : "red";
              if (isRightNote) {
                console.log("played right note");
                this.updateHighlightedSongNote(1, true);
              }
              break;
          }
        }
        break;
    }

    this.setPitchText(pitchValue);
    this.setNoteText(noteValue, noteColor);
    this.setOffsetText(offsetValue, offsetColor);
  },

  highlightString: function (index) {
    console.log("highlighting string", index);
    this.stringEntities.forEach((stringEntity, _index) => {
      //stringEntity.object3D.visible = index === _index;
      stringEntity.setAttribute("opacity", index === _index ? 1 : 0.6);
    });
  },
  showStrings: function () {
    this.stringEntities.forEach((stringEntity) => {
      //stringEntity.object3D.visible = true
      stringEntity.setAttribute("opacity", 1);
    });
  },
  clearStrings: function () {
    this.highlightString(-1);
  },

  highlightKnob: function (index, offset = 1) {
    this.knobEntities.forEach((knobEntity, _index) => {
      knobEntity.object3D.visible = index === _index;
      knobEntity.object3D.scale.x = Math.sign(offset);
    });
  },
  clearKnobs: function () {
    this.highlightKnob(-1);
  },

  setFretsVisibility: function (visible) {
    this.fretEntities.forEach((fretEntity) => {
      fretEntity.object3D.visible = visible;
    });
  },
  showFrets: function () {
    this.setFretsVisibility(true);
  },
  hideFrets: function () {
    this.setFretsVisibility(false);
  },
  highlightFret: function (index) {
    this.fretEntities.forEach((fretEntity, _index) => {
      fretEntity.setAttribute("color", index == _index ? "red" : "black");
    });
  },
  updateHighlightedFretIndex: function (index, isOffset = true) {
    let newHighlightedFretIndex = this.highlightedFretIndex;
    if (isOffset) {
      newHighlightedFretIndex += index;
    } else {
      if (index >= 0 && index < this.fretEntities.length) {
        newHighlightedFretIndex = index;
      }
    }

    newHighlightedFretIndex %= this.fretEntities.length;
    newHighlightedFretIndex = THREE.MathUtils.clamp(
      newHighlightedFretIndex,
      0,
      this.fretEntities.length - 1
    );

    if (this.highlightedFretIndex != newHighlightedFretIndex) {
      this.highlightedFretIndex = newHighlightedFretIndex;
      this.highlightedFret = this.fretEntities[this.highlightedFretIndex];
      this.highlightFret(this.highlightedFretIndex);
    }
  },
  getClosestStringIndex: function (pitch, fingerIndex = 0) {
    let closestString;
    let closestFrequency;
    let closestIndex = -1;

    this.stringFrequencies.forEach((stringFingerings, index) => {
      const stringFingering = stringFingerings[fingerIndex];
      const stringFingeringFrequency = stringFingering.toFrequency();
      if (
        closestIndex < 0 ||
        Math.abs(pitch - stringFingeringFrequency) <
          Math.abs(pitch - closestFrequency)
      ) {
        closestIndex = index;
        closestString = stringFingering;
        closestFrequency = stringFingeringFrequency;
      }
    });

    return closestIndex;
  },

  setText: function (text, value, color) {
    if (value) {
      text.setAttribute("value", value);
      text.parentEl.setAttribute("visible", "true");
      if (color) {
        text.setAttribute("color", color);
      }
    }
  },
  clearText: function (text) {
    //text.setAttribute("value", "");
    text.parentEl.setAttribute("visible", "false");
  },

  setPitchText: function (value) {
    this.setText(this.data.pitchText, value);
    if (value) {
      this.clearPitchText();
    }
  },
  setNoteText: function (value, color) {
    this.setText(this.data.noteText, value, color);
    if (value && this.mode != "song") {
      this.clearNoteText();
    }
  },
  setOffsetText: function (value, color) {
    this.setText(this.data.offsetText, value, color);
    if (value) {
      this.clearOffsetText();
    }
  },

  clearPitchText: function () {
    this.clearText(this.data.pitchText);
  },
  clearNoteText: function () {
    this.clearText(this.data.noteText);
  },
  clearOffsetText: function () {
    this.clearText(this.data.offsetText);
  },
  clearAllText: function () {
    this.clearPitchText();
    this.clearNoteText();
    this.clearOffsetText();
  },

  getPitch: function () {
    this.analyserNode.getFloatTimeDomainData(this.pitchDetectorInput);
    const [pitch, clarity] = this.pitchDetector.findPitch(
      this.pitchDetectorInput,
      this.audioContext.sampleRate
    );

    if (
      clarity > this.data.clarityThreshold &&
      pitch > this.data.pitchThreshold
    ) {
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
    this.clearAllText();
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
  pitchToMidi: function (pitch) {
    this.frequency._val = pitch;
    return this.frequency.toMidi();
  },

  updateHighlightedSongNote: function (
    index,
    isOffset = false,
    override = false
  ) {
    let newSongNoteIndex = this.songNoteIndex;
    if (isOffset) {
      newSongNoteIndex += index;
    } else {
      if (index >= 0 && index < this.songNotes.length) {
        newSongNoteIndex = index;
      }
    }

    newSongNoteIndex %= this.songNotes.length;
    newSongNoteIndex = THREE.MathUtils.clamp(
      newSongNoteIndex,
      0,
      this.songNotes.length - 1
    );

    if (this.songNoteIndex != newSongNoteIndex || override) {
      this.songNoteIndex = newSongNoteIndex;
      this.highlightedSongNote = this.songNotes[this.songNoteIndex];
      console.log(
        "song note index",
        this.songNoteIndex,
        this.highlightedSongNote.toNote()
      );
      this.highlightSongNote();
    }
  },
  highlightSongNote: function () {
    const fingering =
      this.noteToFingerings[this.highlightedSongNote.toNote()][0];
    if (fingering) {
      console.log(fingering);
      const { stringIndex, fingerIndex } = fingering;
      this.fingerEntities.forEach((fingerEntity, index) => {
        const visible = fingerIndex !== 0 && index == stringIndex;
        if (visible) {
          fingerEntity.object3D.position.y =
            fingerIndex == 0
              ? 0
              : this.fretEntities[fingerIndex - 1].object3D.position.y;
        }
        fingerEntity.object3D.visible = visible;

        this.highlightString(stringIndex);
      });
    } else {
      console.log(
        "no fingering found for note",
        this.highlightedSongNote.toNote()
      );
    }
  },
  clearSongNotes: function () {
    this.fingerEntities.forEach((fingerEntity, index) => {
      fingerEntity.object3D.visible = false;
    });
  },

  onGripDown: function () {
    this.violinModelEntity.object3D.visible = true;
  },
  onGripUp: function () {
    this.violinModelEntity.object3D.visible = false;
  },

  onTriggerDown: function () {
    this.isTriggerDown = true;

    switch (this.mode) {
      case "position":
        this._resetPositionFlag = true;
        break;
      case "fingers":
        this.updateHighlightedFretIndex(1);
        break;
      case "song":
        this.updateHighlightedSongNote(0, false, true);
        break;
    }
  },
  onTriggerUp: function () {
    this.isTriggerDown = false;

    switch (this.mode) {
      case "position":
        this.savePositionToLocalStorage();
        this.saveRotationToLocalStorage();
        break;
    }
  },
});

/* global AFRAME, THREE, Tone */
AFRAME.registerSystem("violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
  },
  init: function () {
    window.violin = this;
    
    this.otherSide = this.data.side == "left"? "right":"left"
    
    this.hand = this.data[`${this.data.side}Hand`]
    this.otherHand = this.data[`${this.otherSide}Hand`]
    
    const buttons = this.data.side == "left"? ['y', 'x']:['b', 'a'];
    this.otherHand.addEventListener(`${buttons[0]}buttondown`, this.onTopButtonDown.bind(this))
    this.otherHand.addEventListener(`${buttons[1]}buttondown`, this.onBottomButtonDown.bind(this))
  },
  tick: function() {
    
  },
  onTopButtonDown: function() {
    
  },
  onBottomButtonDown: function() {
    
  },
  
  frequencyToPosition: function(frequency) {
    
  },
  
  getFrequencyOffset: function(frequency) {
    // returns a value between [-0.5, 0.5]
    // get the ideal frequency
    // get the log offset (ratio log 2^(1/2))
  },
});

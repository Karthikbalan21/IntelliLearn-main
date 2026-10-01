import { applyFemaleVoice } from './voice';

export const speak = (text) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const obj = new SpeechSynthesisUtterance(text);//Preparing the msg to be speak
  applyFemaleVoice(obj);
  window.speechSynthesis.cancel(); // Cancel any ongoing speech synthesis
  window.speechSynthesis.speak(obj);//sends the prepared msg to the browser speech engine
};






// Speech synthesis - Browser built-in text-to-speech API.
// 1. if statement, checks if the windows and the speechSynthesis API are available in the current environment. 

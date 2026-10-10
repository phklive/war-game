import { boot } from './main';

boot({ doc: document, win: window, makeAudioContext: () => new AudioContext(), seed: Date.now() });

import {encodeWithLyra, decodeWithLyra, isLyraReady} from 'lyra-codec';

const samplingRate = 16000;

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView
const isLittleEndian = (() => {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */);
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256;
})();

console.log(isLittleEndian);

export function waitLyraReady() {
  return new Promise((resolve)=>{
    const timer = setInterval(()=>{
      if (isLyraReady()) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

export async function encodeTransform(chunk, controller) {
  if (isLittleEndian) {
    // convert to Int16 of Network Order
    const bytes = new Uint8Array(chunk.data);
    for (let i = 1; i < bytes.length; i+=2) {
      const tmp = bytes[i];
      bytes[i] = bytes[i-1];
      bytes[i-1] = tmp;
    }
  }

  const samples = new Int16Array(chunk.data);

  // [-32768,32767] -> [-1,1]に変換
  const buffer = Float32Array.from(samples).map(v => v > 0 ? v/0x7fff : v/0x8000);

  const encodedChunk = encodeWithLyra(buffer, samplingRate);
  chunk.data = encodedChunk.buffer;

  controller.enqueue(chunk);
};

export async function decodeTransform(chunk, controller) {
  const encodedChunk = new Uint8Array(chunk.data);

  // 20ms分渡すので20ms/1s=1/50
  const decodedChunk = decodeWithLyra(encodedChunk, samplingRate, samplingRate/50);

  // [-1,1] -> [-32768,32767]に変換
  const samples = Int16Array.from(decodedChunk.map(v => v > 0 ? v*0x7fff : v*0x8000));
  chunk.data = samples.buffer;

  if (isLittleEndian) {
    // convert to Int16 of Network Order
    const bytes = new Uint8Array(chunk.data);
    for (let i = 1; i < bytes.length; i+=2) {
      const tmp = bytes[i];
      bytes[i] = bytes[i-1];
      bytes[i-1] = tmp;
    }
  }

  controller.enqueue(chunk);
};

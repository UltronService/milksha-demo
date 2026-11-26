/**
 * Ding-dong (Web Audio) + TTS. Respects brand.audio.*.
 * Failures are exposed to UI for the mute / TTS-fail badge; numbers still update.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  /**
   * @param {string} numberStr
   * @returns {string}
   */
  function formatSpokenText(numberStr) {
    if (!numberStr) {
      return '';
    }
    return String(numberStr)
      .split('')
      .map(function (char) {
        if (/[0-9A-Za-z]/.test(char)) {
          return ' ' + char + ' ';
        }
        return char;
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @param {object} [options]
   */
  function createAudioManager(options) {
    const opts = options || {};
    const AudioContextClass = root.AudioContext || root.webkitAudioContext;
    const synth = root.speechSynthesis || null;
    const listeners = [];

    const status = {
      muted: opts.muted === true,
      ttsFailed: false,
      dingDongFailed: false,
    };

    let audioCtx = null;
    let chineseVoice = null;
    let brandAudio = {
      tts: true,
      dingDong: true,
    };

    function emit() {
      const snapshot = {
        muted: status.muted,
        ttsFailed: status.ttsFailed,
        dingDongFailed: status.dingDongFailed,
      };
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](snapshot);
      }
    }

    function markDingDongFailed() {
      if (status.dingDongFailed) {
        return;
      }
      status.dingDongFailed = true;
      emit();
    }

    function markTtsFailed() {
      if (status.ttsFailed) {
        return;
      }
      status.ttsFailed = true;
      emit();
    }

    function ensureAudioContext() {
      try {
        if (!AudioContextClass) {
          markDingDongFailed();
          return null;
        }
        if (!audioCtx) {
          audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended' && audioCtx.resume) {
          audioCtx.resume().catch(function () {
            markDingDongFailed();
          });
        }
        return audioCtx;
      } catch (error) {
        markDingDongFailed();
        return null;
      }
    }

    function initVoice() {
      if (!synth) {
        markTtsFailed();
        return;
      }
      const pickVoice = function () {
        try {
          const voices = synth.getVoices() || [];
          chineseVoice =
            voices.find(function (voice) {
              return voice.lang === 'zh-TW' || voice.lang === 'zh-HK';
            }) ||
            voices.find(function (voice) {
              return voice.lang && String(voice.lang).indexOf('zh') === 0;
            }) ||
            null;
        } catch (error) {
          markTtsFailed();
        }
      };
      pickVoice();
      if (typeof synth.onvoiceschanged !== 'undefined') {
        synth.onvoiceschanged = pickVoice;
      }
    }

    const DING_DONG_GAIN_FLOOR = 0.001;
    const DING_DONG_ATTACK_S = 0.02;

    /** Proto B (bright): matches artifacts/dingdong-preview/generate_dingdong_wav.py */
    const DING_DONG_PROTO_B = {
      outputScale: 1.5583461918705759,
      harmonicH2: 0.35,
      harmonicH3: 0.15,
      harmonicDurationH2: 0.55,
      harmonicDurationH3: 0.4,
      resolveMs: 1400,
      notes: [
        { freq: 659.25, offsetS: 0, durationS: 0.7, peak: 0.4 },
        { freq: 523.25, offsetS: 0.3, durationS: 1.0, peak: 0.5 },
      ],
    };

    function playTone(ctx, freq, startTime, duration, peak) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(peak, startTime + DING_DONG_ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(DING_DONG_GAIN_FLOOR, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    function playBrightNote(ctx, freq, startTime, duration, peak, proto) {
      const scale = proto.outputScale;
      playTone(ctx, freq, startTime, duration, peak * scale);
      playTone(
        ctx,
        freq * 2,
        startTime,
        duration * proto.harmonicDurationH2,
        peak * proto.harmonicH2 * scale,
      );
      playTone(
        ctx,
        freq * 3,
        startTime,
        duration * proto.harmonicDurationH3,
        peak * proto.harmonicH3 * scale,
      );
    }

    function playDingDong() {
      return new Promise(function (resolve) {
        if (status.muted || brandAudio.dingDong === false) {
          resolve();
          return;
        }
        const ctx = ensureAudioContext();
        if (!ctx) {
          resolve();
          return;
        }
        try {
          const now = ctx.currentTime;
          const proto = DING_DONG_PROTO_B;
          for (let i = 0; i < proto.notes.length; i += 1) {
            const note = proto.notes[i];
            playBrightNote(ctx, note.freq, now + note.offsetS, note.durationS, note.peak, proto);
          }
          setTimeout(resolve, proto.resolveMs);
        } catch (error) {
          markDingDongFailed();
          resolve();
        }
      });
    }

    function speakNumber(number, pickupHint) {
      return new Promise(function (resolve) {
        if (status.muted || brandAudio.tts === false) {
          resolve();
          return;
        }
        if (!synth) {
          markTtsFailed();
          resolve();
          return;
        }
        try {
          synth.cancel();
          const spoken = formatSpokenText(number);
          const hint = String(pickupHint || '請取餐').replace(/^請/, '').trim() || '取餐';
          const utterance = new SpeechSynthesisUtterance('請 ' + spoken + ' ' + hint);
          if (chineseVoice) {
            utterance.voice = chineseVoice;
          }
          utterance.lang = 'zh-TW';
          utterance.rate = 0.9;
          utterance.pitch = 1.05;
          utterance.onend = function () {
            resolve();
          };
          utterance.onerror = function () {
            markTtsFailed();
            resolve();
          };
          synth.speak(utterance);
        } catch (error) {
          markTtsFailed();
          resolve();
        }
      });
    }

    initVoice();

    return {
      getStatus: function () {
        return {
          muted: status.muted,
          ttsFailed: status.ttsFailed,
          dingDongFailed: status.dingDongFailed,
        };
      },
      subscribe: function (listener) {
        if (typeof listener !== 'function') {
          return function () {};
        }
        listeners.push(listener);
        listener(this.getStatus());
        return function () {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        };
      },
      setBrandAudio: function (audio) {
        brandAudio = {
          tts: !audio || audio.tts !== false,
          dingDong: !audio || audio.dingDong !== false,
        };
      },
      setMuted: function (muted) {
        status.muted = muted === true;
        emit();
      },
      unlock: function () {
        ensureAudioContext();
      },
      announce: function (number, pickupHint) {
        if (!number) {
          return Promise.resolve();
        }
        return playDingDong()
          .then(function () {
            return speakNumber(number, pickupHint);
          })
          .catch(function () {
            markDingDongFailed();
            markTtsFailed();
          });
      },
      playDingDong: playDingDong,
    };
  }

  QMS.formatSpokenText = formatSpokenText;
  QMS.createAudioManager = createAudioManager;
})(typeof window !== 'undefined' ? window : globalThis);
